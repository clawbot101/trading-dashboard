import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPnlSplit, type AnalysisBook } from '../../../../lib/analysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Params = z.object({
  book: z.enum(['l2', 'l4']).default('l2'),
  range: z.enum(['7D', '30D', '90D', 'ALL']).default('30D'),
});

export async function GET(req: NextRequest) {
  try {
    const q = Params.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    const data = await getPnlSplit(q.book as AnalysisBook, q.range);
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    const status = err?.name === 'ZodError' ? 400 : 500;
    return NextResponse.json({ ok: false, error: err?.message ?? 'error' }, { status });
  }
}
