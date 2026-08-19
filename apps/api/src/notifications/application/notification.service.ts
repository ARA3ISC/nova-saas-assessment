import { Injectable, Inject, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, TransactionalEmailTemplate } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { decryptInitialOwnerEnvelope, encryptInitialOwnerEnvelope } from '../domain/envelope';
import { EMAIL_SENDER, EmailSender } from '../infrastructure/email-sender';

const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const RETRY_BATCH_SIZE = 25;
const INVITATION_ENVELOPE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_ENVELOPE_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private retryTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
  ) {}

  onModuleInit(): void {
    this.retryTimer = setInterval(() => {
      void this.dispatchPending();
    }, RETRY_INTERVAL_MS);
    this.retryTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
    }
  }

  async enqueueInitialOwnerInvitation(
    tx: Prisma.TransactionClient,
    params: { organizationId: string; recipient: string; token: string },
  ): Promise<{ id: string }> {
    return tx.outboxMessage.create({
      data: {
        organizationId: params.organizationId,
        recipient: params.recipient,
        template: TransactionalEmailTemplate.INITIAL_OWNER_INVITATION_V1,
        deliveryKey: randomUUID(),
        encryptedEnvelope: encryptInitialOwnerEnvelope({ token: params.token }),
      },
      select: { id: true },
    });
  }

  async enqueueCollaboratorInvitation(
    tx: Prisma.TransactionClient,
    params: { organizationId: string; recipient: string; token: string },
  ): Promise<{ id: string }> {
    return tx.outboxMessage.create({
      data: {
        organizationId: params.organizationId,
        recipient: params.recipient,
        template: TransactionalEmailTemplate.COLLABORATOR_INVITATION_V1,
        deliveryKey: randomUUID(),
        encryptedEnvelope: encryptInitialOwnerEnvelope({ token: params.token }),
      },
      select: { id: true },
    });
  }

  async enqueuePasswordReset(
    tx: Prisma.TransactionClient,
    params: { organizationId: string | null; recipient: string; token: string },
  ): Promise<{ id: string }> {
    return tx.outboxMessage.create({
      data: {
        organizationId: params.organizationId,
        recipient: params.recipient,
        template: TransactionalEmailTemplate.PASSWORD_RESET_V1,
        deliveryKey: randomUUID(),
        encryptedEnvelope: encryptInitialOwnerEnvelope({ token: params.token }),
      } satisfies Prisma.OutboxMessageUncheckedCreateInput,
      select: { id: true },
    });
  }

  async deliver(messageId: string): Promise<void> {
    const message = await this.prisma.outboxMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || message.status !== 'PENDING') {
      return;
    }

    try {
      const envelope = decryptInitialOwnerEnvelope(message.encryptedEnvelope);
      const origin = this.publicApplicationOrigin();
      const acceptPath =
        message.template === TransactionalEmailTemplate.INITIAL_OWNER_INVITATION_V1
          ? '/invitations/initial-owner/accept'
          : message.template === TransactionalEmailTemplate.COLLABORATOR_INVITATION_V1
            ? '/invitations/collaborator/accept'
            : '/password-reset/complete';
      const acceptUrl = new URL(acceptPath, origin);
      acceptUrl.searchParams.set('token', envelope.token);
      const providerMessageId = await this.sender.send({
        to: message.recipient,
        deliveryKey: message.deliveryKey,
        template: message.template,
        actionUrl: acceptUrl.toString(),
      });
      await this.prisma.outboxMessage.update({
        where: { id: message.id },
        data: {
          status: 'DELIVERED',
          attemptCount: { increment: 1 },
          providerMessageId,
          encryptedEnvelope: '',
          deliveredAt: new Date(),
          lastFailureCode: null,
        },
      });
    } catch (error: unknown) {
      await this.prisma.outboxMessage.update({
        where: { id: message.id },
        data: {
          attemptCount: { increment: 1 },
          lastFailureCode: this.safeFailureCode(error),
        },
      });
    }
  }

  /**
   * Replays a bounded batch after a transient provider or process failure.
   * `deliveryKey` is retained on every attempt, so concurrent workers remain
   * safe through Resend's idempotency contract.
   */
  async dispatchPending(): Promise<void> {
    try {
      await this.expireCredentialEnvelopes();
      const pending = await this.prisma.outboxMessage.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: RETRY_BATCH_SIZE,
        select: { id: true },
      });

      await Promise.all(pending.map((message) => this.deliver(message.id)));
    } catch {
      // The next interval retries database and transport outages. Individual
      // delivery failures are recorded by deliver() without leaking details.
    }
  }

  async expireCredentialEnvelopes(now = new Date()): Promise<void> {
    await Promise.all([
      this.prisma.outboxMessage.updateMany({
        where: {
          status: 'PENDING',
          template: TransactionalEmailTemplate.PASSWORD_RESET_V1,
          createdAt: {
            lte: new Date(now.getTime() - PASSWORD_RESET_ENVELOPE_TTL_MS),
          },
        },
        data: {
          status: 'EXPIRED',
          encryptedEnvelope: '',
          lastFailureCode: 'CREDENTIAL_EXPIRED',
        },
      }),
      this.prisma.outboxMessage.updateMany({
        where: {
          status: 'PENDING',
          template: {
            in: [
              TransactionalEmailTemplate.INITIAL_OWNER_INVITATION_V1,
              TransactionalEmailTemplate.COLLABORATOR_INVITATION_V1,
            ],
          },
          createdAt: {
            lte: new Date(now.getTime() - INVITATION_ENVELOPE_TTL_MS),
          },
        },
        data: {
          status: 'EXPIRED',
          encryptedEnvelope: '',
          lastFailureCode: 'CREDENTIAL_EXPIRED',
        },
      }),
    ]);
  }

  private publicApplicationOrigin(): URL {
    const raw = process.env.PUBLIC_APP_ORIGIN?.trim();
    if (!raw) throw new Error('PUBLIC_APP_ORIGIN is required');
    const origin = new URL(raw);
    if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') {
      throw new Error('PUBLIC_APP_ORIGIN must use HTTPS outside localhost');
    }
    return origin;
  }

  private safeFailureCode(error: unknown): string {
    const value = error instanceof Error ? error.message : 'EMAIL_DELIVERY_FAILED';
    return createHash('sha256').update(value).digest('hex').slice(0, 16);
  }
}
