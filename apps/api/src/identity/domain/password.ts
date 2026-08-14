import argon2 from 'argon2';

const MIN_PASSWORD_LENGTH = 15;

const ARGON2_OPTIONS = {
  type: argon2.argon2id as 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function validatePassword(password: string): void {
  if (Array.from(password).length < MIN_PASSWORD_LENGTH) {
    throw new Error('Password must contain at least 15 characters');
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);

  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return argon2.verify(hash, password);
}

