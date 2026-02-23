// app/api/layers/[id]/features/bulk/route.ts
import { NextResponse } from "next/server";
import { poolDb1, poolDb2 } from "@/lib/db";

async function pickDbByLayerId(layerId: string) {
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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isIntLike(v: string) {
  return /^[0-9]+$/.test(v);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: layerId } = await ctx.params;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const fids = body?.fids;
  const properties = body?.properties;

  if (!Array.isArray(fids) || fids.length === 0) {
    return NextResponse.json({ ok: false, error: "Invalid feature id." }, { status: 400 });
  }
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return NextResponse.json({ ok: false, error: "Body must be { properties: { ... } }" }, { status: 400 });
  }

  // detect ID type
  const allInt = fids.every((x: any) => typeof x === "string" && isIntLike(x));
  const allUuid = fids.every((x: any) => typeof x === "string" && isUuid(x));

  if (!allInt && !allUuid) {
    return NextResponse.json(
      { ok: false, error: "Invalid feature id. IDs must be all integers OR all UUIDs." },
      { status: 400 }
    );
  }

  const picked = await pickDbByLayerId(layerId);
  if (!picked) {
    return NextResponse.json({ ok: false, error: "Layer not found." }, { status: 404 });
  }

  const client = await picked.pool.connect();
  try {
    // ✅ update props merge
    // IMPORTANT: compare layer_id too so you don't update other layers
    const sql = allUuid
      ? `
        UPDATE public.features
        SET props = COALESCE(props, '{}'::jsonb) || $2::jsonb
        WHERE layer_id = $1
          AND id = ANY($3::uuid[])
        `
      : `
        UPDATE public.features
        SET props = COALESCE(props, '{}'::jsonb) || $2::jsonb
        WHERE layer_id = $1
          AND id = ANY($3::bigint[])
        `;

    const idsParam = allUuid ? (fids as string[]) : (fids as string[]).map((x) => BigInt(x));

    const res = await client.query(sql, [layerId, properties, idsParam]);

    return NextResponse.json({
      ok: true,
      db: picked.db,
      updated: res.rowCount ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status: 500 });
  } finally {
    client.release();
  }
}