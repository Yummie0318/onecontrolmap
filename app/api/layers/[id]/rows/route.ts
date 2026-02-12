import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

function toInt(v: any, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: layerId } = await ctx.params;
  const { searchParams } = new URL(req.url);

  const limit = Math.min(Math.max(toInt(searchParams.get("limit"), 50), 1), 50);
  const offset = Math.max(toInt(searchParams.get("offset"), 0), 0);

  const q = String(searchParams.get("q") ?? "").trim(); // search whole layer

  const client = await pool.connect();
  try {
    // ✅ total count (with optional search)
    const totalRes = await client.query(
      `
      SELECT COUNT(*)::int AS total
      FROM public.features f
      WHERE f.layer_id = $1
        AND (
          $2 = '' OR
          f.props::text ILIKE '%' || $2 || '%'
        )
      `,
      [layerId, q]
    );
    const total = totalRes.rows[0]?.total ?? 0;

    // ✅ page data
    const rowsRes = await client.query(
      `
      SELECT
        f.id AS __fid,
        ($3 + ROW_NUMBER() OVER (ORDER BY f.id))::int AS __row,
        COALESCE(f.props, '{}'::jsonb) AS props
      FROM public.features f
      WHERE f.layer_id = $1
        AND (
          $2 = '' OR
          f.props::text ILIKE '%' || $2 || '%'
        )
      ORDER BY f.id
      LIMIT $4 OFFSET $3
      `,
      [layerId, q, offset, limit]
    );

    // ✅ columns from current page (fast + safe)
    const colSet = new Set<string>();
    colSet.add("__row");
    colSet.add("__fid");
    for (const r of rowsRes.rows) {
      const p = r.props ?? {};
      for (const k of Object.keys(p)) colSet.add(k);
    }
    const columns = Array.from(colSet);

    const rows = rowsRes.rows.map((r) => ({
      __row: r.__row,
      __fid: r.__fid,
      ...(r.props ?? {}),
    }));

    return NextResponse.json({ ok: true, columns, rows, total, limit, offset, q });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
