import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  getTerminalPassword,
  sameSecret,
  sessionToken,
} from '../../../lib/terminal-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const password = getTerminalPassword();
  if (!password) {
    return NextResponse.json({ ok: false, error: 'Terminal password is not set.' }, { status: 503 });
  }

  let given = '';
  try {
    const body = await req.json();
    given = typeof body?.password === 'string' ? body.password : '';
  } catch {
    given = '';
  }

  if (!given || !sameSecret(given, password)) {
    return NextResponse.json({ ok: false, error: 'Wrong password.' }, { status: 401 });
  }

  const token = await sessionToken();
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Terminal password is not set.' }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
