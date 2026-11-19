import { NextRequest, NextResponse } from 'next/server';
import { getPaperBook, listPaperBooks } from '../../../lib/paper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const strategy = req.nextUrl.searchParams.get('strategy');
    if (!strategy) {
      const books = await listPaperBooks();
      return NextResponse.json({ ok: true, data: { books } });
    }
    if (!/^[a-z0-9_]+$/.test(strategy)) {
      return NextResponse.json({ ok: false, error: 'unknown strategy' }, { status: 400 });
    }
    const data = await getPaperBook(strategy);
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'paper book unavailable' },
      { status: 500 }
    );
  }
}
