import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_N = 2 ** 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAX_MEMORY = 256 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      KEY_LENGTH,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: SCRYPT_MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export function validatePassword(password: string): string | null {
  const characterCount = [...password].length;

  if (characterCount < 12) {
    return 'Password must contain at least 12 characters.';
  }

  if (characterCount > 128 || Buffer.byteLength(password, 'utf8') > 1024) {
    return 'Password must be no longer than 128 characters.';
  }

  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await deriveKey(password, salt);

  return [
    'scrypt',
    String(KEY_LENGTH),
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

const DUMMY_HASH = [
  'scrypt',
  String(KEY_LENGTH),
  String(SCRYPT_N),
  String(SCRYPT_R),
  String(SCRYPT_P),
  Buffer.alloc(SALT_LENGTH).toString('base64url'),
  Buffer.alloc(KEY_LENGTH).toString('base64url'),
].join('$');

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const parts = encodedHash.split('$');
  if (parts.length !== 7) return false;

  const [algorithm, keyLengthText, costText, blockSizeText, parallelizationText, saltText, hashText] = parts;

  if (
    algorithm !== 'scrypt' ||
    keyLengthText !== String(KEY_LENGTH) ||
    costText !== String(SCRYPT_N) ||
    blockSizeText !== String(SCRYPT_R) ||
    parallelizationText !== String(SCRYPT_P)
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(saltText, 'base64url');
    const expectedKey = Buffer.from(hashText, 'base64url');

    if (salt.length !== SALT_LENGTH || expectedKey.length !== KEY_LENGTH) {
      return false;
    }

    const actualKey = await deriveKey(password, salt);
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}

export async function performDummyPasswordVerification(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_HASH);
}
