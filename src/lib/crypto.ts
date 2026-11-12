import { createHash, randomBytes, randomInt } from 'node:crypto';

/** Long random token for refresh / reset links. Only its hash is stored. */
export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** Short human-friendly code, e.g. for invite links. */
export function randomCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) code += codeAlphabet[randomInt(codeAlphabet.length)];
  return code;
}
