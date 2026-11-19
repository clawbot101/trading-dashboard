import { NextResponse } from 'next/server';
import { getPaperBook } from '../../../lib/paper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  try {
    const data = await getPaperBook('mw_majors_weak');
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'paper book unavailable' },
      { status: 500 }
    );
  }
}
