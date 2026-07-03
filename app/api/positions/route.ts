/**
 * Live Positions API route.
 * GET: returns live positions, summary, and open orders.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getLivePositions,
  getPositionSummary,
  getAllOpenOrders,
} from '../../../lib/queries/positions';

// Query params schema
const PositionsParamsSchema = z.object({
  venue: z.string().optional(),
  strategy: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const params = PositionsParamsSchema.parse({
      venue: searchParams.get('venue'),
      strategy: searchParams.get('strategy'),
    });

    // Run queries sequentially
    const positions = await getLivePositions(params.venue, params.strategy);
    const summary = await getPositionSummary(params.venue, params.strategy);
    const openOrders = await getAllOpenOrders(params.venue, params.strategy);

    // Build response
    const response = {
      ok: true,
      as_of: new Date().toISOString(),
      data: {
        positions,
        summary,
        openOrders,
      },
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err) {
    console.error('[api/positions] Error:', err);

    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'Invalid parameters', details: err.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}