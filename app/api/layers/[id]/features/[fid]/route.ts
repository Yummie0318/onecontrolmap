// app/api/layers/[id]/features/[fid]/route.ts
import { NextResponse } from "next/server";
import { poolDb1, poolDb2 } from "@/lib/db";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
function isIntLike(v: string) {
  return /^[0-9]+$/.test(v);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; fid: string }> }) {
  const { id: layerId, fid } = await ctx.params;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const properties = body?.properties;

  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return NextResponse.json({ ok: false, error: "Body must be { properties: { ... } }" }, { status: 400 });
  }

  if ("__fid" in properties) delete (properties as any).__fid;

  const fidIsUuid = isUuid(fid);
  const fidIsInt = isIntLike(fid);

  if (!fid || (!fidIsUuid && !fidIsInt)) {
    return NextResponse.json({ ok: false, error: "Invalid feature id." }, { status: 400 });
  }

  const sql = fidIsUuid
    ? `
      UPDATE public.features f
      SET props = COALESCE(f.props, '{}'::jsonb) || $1::jsonb
      WHERE f.id = $2::uuid AND f.layer_id = $3
    `
    : `
      UPDATE public.features f
      SET props = COALESCE(f.props, '{}'::jsonb) || $1::jsonb
      WHERE f.id = $2::bigint AND f.layer_id = $3
    `;

  const params = [properties, fidIsUuid ? fid : BigInt(fid), layerId];

  // Try DB1
  const c1 = await poolDb1.connect();
  try {
    const r1 = await c1.query(sql, params);
    if (r1.rowCount) return NextResponse.json({ ok: true, db: "db1", updated: r1.rowCount });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed to update feature (db1)." }, { status: 500 });
  } finally {
    c1.release();
  }

  // Try DB2
  const c2 = await poolDb2.connect();
  try {
    const r2 = await c2.query(sql, params);
    if (r2.rowCount) return NextResponse.json({ ok: true, db: "db2", updated: r2.rowCount });

    return NextResponse.json({ ok: false, error: "Feature not found for this layer." }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed to update feature (db2)." }, { status: 500 });
  } finally {
    c2.release();
  }
}