import { Injectable } from '@nestjs/common';
import { TransactionalEmailTemplate } from '@prisma/client';

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export type EmailSendRequest = {
  to: string;
  template: TransactionalEmailTemplate;
  actionUrl: string;
  deliveryKey: string;
};

export interface EmailSender {
  send(request: EmailSendRequest): Promise<string | null>;
}

@Injectable()
export class ResendEmailSender implements EmailSender {
  async send(request: EmailSendRequest): Promise<string | null> {
    const rendered = renderTransactionalEmail(request);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey()}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': request.deliveryKey,
      },
      body: JSON.stringify({
        from: this.sender(),
        to: [request.to],
        subject: rendered.subject,
        html: rendered.html,
      }),
    });
    if (!response.ok) throw new Error(`RESEND_${response.status}`);
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string'
      ? body.id
      : null;
  }

  private apiKey(): string {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) throw new Error('RESEND_API_KEY is required');
    return key;
  }

  private sender(): string {
    const sender = process.env.RESEND_SENDER?.trim();
    if (!sender) throw new Error('RESEND_SENDER is required');
    if (/\r|\n/.test(sender) || !sender.includes('@')) throw new Error('RESEND_SENDER is invalid');
    return sender;
  }
}

const TEMPLATE_CONTENT: Record<
  TransactionalEmailTemplate,
  { path: string; subject: string; introduction: string }
> = {
  INITIAL_OWNER_INVITATION_V1: {
    path: '/invitations/initial-owner/accept',
    subject: 'Activate your NOVA organization account',
    introduction: 'You have been invited to activate your NOVA organization account.',
  },
  COLLABORATOR_INVITATION_V1: {
    path: '/invitations/collaborator/accept',
    subject: 'Join your NOVA organization',
    introduction: 'You have been invited to join a NOVA organization.',
  },
  PASSWORD_RESET_V1: {
    path: '/password-reset/complete',
    subject: 'Reset your NOVA password',
    introduction: 'Use the link below to reset your NOVA password.',
  },
};

export function renderTransactionalEmail(request: EmailSendRequest): {
  subject: string;
  html: string;
} {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.to)) {
    throw new Error('EMAIL_RECIPIENT_INVALID');
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      request.deliveryKey,
    )
  ) {
    throw new Error('EMAIL_DELIVERY_KEY_INVALID');
  }
  const content = TEMPLATE_CONTENT[request.template];
  if (!content) throw new Error('EMAIL_TEMPLATE_NOT_ALLOWED');
  const actionUrl = new URL(request.actionUrl);
  const configuredOrigin = new URL(requiredPublicOrigin());
  if (actionUrl.origin !== configuredOrigin.origin || actionUrl.pathname !== content.path) {
    throw new Error('EMAIL_ACTION_URL_NOT_ALLOWED');
  }
  if (!actionUrl.searchParams.get('token')) throw new Error('EMAIL_ACTION_TOKEN_REQUIRED');
  return {
    subject: content.subject,
    html: `<p>${content.introduction}</p><p><a href="${actionUrl.toString()}">Continue</a></p>`,
  };
}

function requiredPublicOrigin(): string {
  const raw = process.env.PUBLIC_APP_ORIGIN?.trim();
  if (!raw) throw new Error('PUBLIC_APP_ORIGIN is required');
  const origin = new URL(raw);
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') {
    throw new Error('PUBLIC_APP_ORIGIN must use HTTPS outside localhost');
  }
  return origin.toString();
}

export class RecordingEmailSender implements EmailSender {
  readonly sent: EmailSendRequest[] = [];
  async send(request: EmailSendRequest): Promise<string> {
    renderTransactionalEmail(request);
    this.sent.push(request);
    return `recorded-${this.sent.length}`;
  }
}
