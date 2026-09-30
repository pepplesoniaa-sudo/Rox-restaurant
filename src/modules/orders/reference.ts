import { randomInt } from 'node:crypto';

// Customer-facing order code, e.g. ROX-7KQ2M9XA.
// 32 possible characters: digits and capitals minus 0/O and 1/I, which look
// alike when read over the phone. 32^8 ≈ 1.1 trillion combinations.
// crypto.randomInt is unpredictable, unlike Math.random, so references
// cannot be guessed from earlier ones.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const LENGTH = 8;

export function generateOrderReference(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `ROX-${code}`;
}
