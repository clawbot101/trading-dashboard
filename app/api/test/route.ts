export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ ok: true, message: 'API is working', timestamp: new Date().toISOString() });
}
