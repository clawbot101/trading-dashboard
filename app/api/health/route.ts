import { NextResponse } from "next/server";
import { dbHealthcheck } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const info = await dbHealthcheck();
    return NextResponse.json({ ok: true, info });
  } catch (err: any) {
    console.error("[api/health] error", {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Internal server error", code: err?.code ?? null },
      { status: 500 }
    );
  }
}