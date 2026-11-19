import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function sameSecret(given: string, expected: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(given);
  const b = enc.encode(expected);
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const password = process.env.TERMINAL_PASSWORD;
  const user = process.env.TERMINAL_USER || 'terminal';
  if (!password) {
    if (process.env.VERCEL) {
      return new NextResponse('Terminal password is not set.', { status: 503 });
    }
    return NextResponse.next();
  }

  const header = req.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    let decoded = '';
    try {
      decoded = atob(header.slice(6));
    } catch {
      decoded = '';
    }
    const split = decoded.indexOf(':');
    const givenUser = split >= 0 ? decoded.slice(0, split) : '';
    const givenPassword = split >= 0 ? decoded.slice(split + 1) : '';
    if (sameSecret(givenUser, user) && sameSecret(givenPassword, password)) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Algo Terminal", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
