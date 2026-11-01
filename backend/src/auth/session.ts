
import { createHash, randomBytes } from 'node:crypto'

const SESSION_TOKEN_BYTES = 32

export const SESSION_COOKIE_NAME = 'smhm_session'

export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000

export function createSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: SESSION_DURATION_MS,
  }
}
