import argon2 from 'argon2';

const MIN_PASSWORD_LENGTH = 15;

// Keep this deliberately small and deterministic in the assessment runtime. It
// blocks the most frequently abused credentials and can be replaced by a
// maintained offline breach corpus without changing the domain contract.
const COMPROMISED_PASSWORDS = new Set([
  '123456789012345',
  'correct horse battery staple',
  'letmeinletmeinletmein',
  'passwordpassword',
  'qwertyuiopqwerty',
]);

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
  if (COMPROMISED_PASSWORDS.has(password.normalize('NFKC').toLowerCase())) {
    throw new Error('Choose a password that is not commonly compromised');
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);

  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
