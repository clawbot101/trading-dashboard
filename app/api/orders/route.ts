/**
 * Order Events API route.
 * GET: returns order events grouped by strategy_order_id with lifecycle.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrderEvents } from '../../../lib/queries/trades';

// Query params schema
const OrdersParamsSchema = z.object({
  timeRange: z.enum(['24H', '7D', '30D', '90D', 'ALL']).default('24H'),
  venue: z.string().optional(),
  strategy: z.string().optional(),
  symbol: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const params = OrdersParamsSchema.parse({
      timeRange: searchParams.get('timeRange') || '24H',
      venue: searchParams.get('venue'),
      strategy: searchParams.get('strategy'),
      symbol: searchParams.get('symbol'),
      page: searchParams.get('page'),
      pageSize: searchParams.get('pageSize'),
    });

    // Run query
    const orderEvents = await getOrderEvents(
      params.timeRange,
      params.venue,
      params.strategy,
      params.symbol,
      params.page,
      params.pageSize
    );

    // Build response
    const response = {
      ok: true,
      as_of: new Date().toISOString(),
      page: params.page,
      pageSize: params.pageSize,
      data: {
        orderEvents,
      },
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err) {
    console.error('[api/orders] Error:', err);

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