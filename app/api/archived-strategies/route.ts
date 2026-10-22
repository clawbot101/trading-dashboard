import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getArchivedStrategiesStore,
  setArchivedStrategies,
  invalidateArchivedStrategiesCache,
} from '../../../lib/archived-strategies-store';
import { listKnownStrategyNames } from '../../../lib/queries/strategy-names';
import { clearResponseCache } from '../../../lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PutBodySchema = z.object({
  archived: z.array(z.string()),
});

export async function GET() {
  try {
    const [store, known] = await Promise.all([
      getArchivedStrategiesStore(),
      listKnownStrategyNames(),
    ]);
    return NextResponse.json({
      ok: true,
      archived: store.archived,
      known,
      defaults: store.defaults,
      updated_at: store.updated_at,
    });
  } catch (err) {
    console.error('GET archived-strategies failed:', err);
    return NextResponse.json({ ok: false, error: 'Failed to load archived strategies' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = PutBodySchema.parse(await req.json());
    const payload = await setArchivedStrategies(body.archived);
    invalidateArchivedStrategiesCache();
    clearResponseCache();
    return NextResponse.json({
      ok: true,
      archived: payload.archived,
      updated_at: payload.updated_at,
    });
  } catch (err) {
    console.error('PUT archived-strategies failed:', err);
    return NextResponse.json({ ok: false, error: 'Failed to save archived strategies' }, { status: 400 });
  }
}
