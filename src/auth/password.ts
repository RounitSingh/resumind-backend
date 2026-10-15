import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

// scrypt (built in, no native addon). Format: scrypt$N$saltHex$hashHex
const N = 16384
const KEYLEN = 64

const derive = (password: string, salt: Buffer, n: number): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scrypt(password, salt, KEYLEN, { N: n, maxmem: 64 * 1024 * 1024 }, (e, key) => (e ? reject(e) : resolve(key))),
  )

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, N)
  return `scrypt$${N}$${salt.toString('hex')}$${key.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !n || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await derive(password, Buffer.from(saltHex, 'hex'), Number(n))
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// Compared against when the email is unknown, so login timing doesn't reveal which emails exist.
export const DUMMY_HASH = `scrypt$${N}$${'00'.repeat(16)}$${'00'.repeat(KEYLEN)}`
