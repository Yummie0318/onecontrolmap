import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `
      SELECT id, name, source_filename, geom_type, srid, feature_count, created_at
      FROM public.layers
      ORDER BY created_at DESC NULLS LAST, name ASC
      `
    );

    return NextResponse.json({ ok: true, layers: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
