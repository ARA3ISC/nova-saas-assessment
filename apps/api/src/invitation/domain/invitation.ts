import { createHash, randomBytes } from 'node:crypto';

export type InvitationKind =
  | 'INITIAL_OWNER'
  | 'COLLABORATOR';

export type InvitationProfile =
  | 'Administrator'
  | 'User';

const INVITATION_TOKEN_BYTES = 32;

export function normalizeInvitationEmail(
  email: string,
): string {
  return email.trim().toLowerCase();
}

export function generateInvitationToken(): string {
  return randomBytes(INVITATION_TOKEN_BYTES).toString(
    'base64url',
  );
}

export function hashInvitationToken(
  token: string,
): string {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}

export function isInvitationExpired(
  expiresAt: Date,
  now: Date = new Date(),
): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function validateInvitationInput(params: {
  email: string;
  kind: InvitationKind;
  targetProfile: InvitationProfile;
}): void {
  if (!params.email.trim()) {
    throw new Error('email is required');
  }

  if (
    params.kind !== 'INITIAL_OWNER' &&
    params.kind !== 'COLLABORATOR'
  ) {
    throw new Error('invalid invitation kind');
  }

  if (
    params.targetProfile !== 'Administrator' &&
    params.targetProfile !== 'User'
  ) {
    throw new Error('invalid invitation profile');
  }

  if (
    params.kind === 'INITIAL_OWNER' &&
    params.targetProfile !== 'Administrator'
  ) {
    throw new Error(
      'INITIAL_OWNER invitations must target Administrator',
    );
  }
}
