/**
 * Terminal login. The password comes from the TERMINAL_PASSWORD environment variable.
 *
 * The session cookie is an HMAC keyed by that password, so changing the password
 * in Vercel invalidates every existing session.
 */

export const SESSION_COOKIE = 'terminal_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const enc = new TextEncoder();

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function getTerminalPassword(): string | undefined {
  const value = process.env.TERMINAL_PASSWORD;
  return value && value.length > 0 ? value : undefined;
}

export function sameSecret(given: string, expected: string): boolean {
  const a = enc.encode(given);
  const b = enc.encode(expected);
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/** Cookie value for a valid session, or null when no password is configured. */
export async function sessionToken(): Promise<string | null> {
  const password = getTerminalPassword();
  if (!password) return null;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('algo-terminal-session-v2'));
  return toHex(sig);
}

/** Only allow same-site relative paths after login. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}
