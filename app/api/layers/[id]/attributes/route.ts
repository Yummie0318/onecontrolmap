// app/api/layers/[id]/attributes/route.ts
import { NextResponse } from "next/server";
import { poolDb1, poolDb2 } from "@/lib/db";

function toInt(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function escapeLike(s: string) {
  // Escape % and _ and backslash for LIKE/ILIKE
  return s.replace(/[%_\\]/g, (m) => "\\" + m);
}

async function pickDbByLayerId(layerId: string) {
  // returns { db: "db1"|"db2", pool } if layer exists
  const c1 = await poolDb1.connect();
  try {
    const r1 = await c1.query(`SELECT 1 FROM public.layers WHERE id = $1 LIMIT 1`, [layerId]);
    if (r1.rowCount) return { db: "db1" as const, pool: poolDb1 };
  } finally {
    c1.release();
  }

  const c2 = await poolDb2.connect();
  try {
    const r2 = await c2.query(`SELECT 1 FROM public.layers WHERE id = $1 LIMIT 1`, [layerId]);
    if (r2.rowCount) return { db: "db2" as const, pool: poolDb2 };
  } finally {
    c2.release();
  }

  return null;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: layerId } = await ctx.params;

  const url = new URL(req.url);
  const page = Math.max(1, toInt(url.searchParams.get("page"), 1));
  const pageSize = Math.min(1000, Math.max(10, toInt(url.searchParams.get("pageSize"), 50)));
  const searchRaw = String(url.searchParams.get("search") ?? "").trim();

  const offset = (page - 1) * pageSize;

  // ✅ choose which DB this layer belongs to
  const picked = await pickDbByLayerId(layerId);
  if (!picked) {
    return NextResponse.json({ ok: false, error: "Layer not found." }, { status: 404 });
  }

  const client = await picked.pool.connect();
  try {
    // WHERE
    let whereSql = `WHERE f.layer_id = $1`;
    const params: any[] = [layerId];

    if (searchRaw) {
      const pat = `%${escapeLike(searchRaw)}%`;
      params.push(pat);
      whereSql += ` AND (COALESCE(f.props, '{}'::jsonb)::text ILIKE $2 ESCAPE '\\')`;
    }

    // TOTAL COUNT
    const totalRes = await client.query(
      `
      SELECT COUNT(*)::int AS total
      FROM public.features f
      ${whereSql}
      `,
      params
    );
    const total = totalRes.rows?.[0]?.total ?? 0;

    // PAGE ROWS
    const pageParams = [...params, pageSize, offset];
    const rowsRes = await client.query(
      `
      SELECT f.id AS __fid, COALESCE(f.props, '{}'::jsonb) AS props
      FROM public.features f
      ${whereSql}
      ORDER BY f.id
      LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}
      `,
      pageParams
    );

    const rows = (rowsRes.rows ?? []).map((r: any) => {
      const props = r?.props && typeof r.props === "object" ? r.props : {};
      return { __fid: r.__fid ?? null, ...props };
    });

    // Columns based on returned page (fast)
    const colSet = new Set<string>();
    colSet.add("__fid");
    for (const row of rows) for (const k of Object.keys(row)) colSet.add(k);

    const rest = Array.from(colSet).filter((c) => c !== "__fid").sort((a, b) => a.localeCompare(b));
    const columns = ["__fid", ...rest];

    return NextResponse.json({
      ok: true,
      layerId,
      page,
      pageSize,
      total,
      search: searchRaw,
      columns,
      rows,
      db: picked.db, // helpful for debugging
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status: 500 });
  } finally {
    client.release();
  }
}