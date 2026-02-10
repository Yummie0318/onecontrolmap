import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; fid: string }> }
) {
  const { id: layerId, fid } = await ctx.params;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const props = body?.properties;

  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return NextResponse.json(
      { ok: false, error: "Body must be { properties: { ... } }" },
      { status: 400 }
    );
  }

  // prevent overwriting __fid
  if ("__fid" in props) delete props.__fid;

  // ✅ fid is UUID (from GeoJSON __fid)
  if (!fid || !isUuid(fid)) {
    return NextResponse.json({ ok: false, error: "Invalid feature id." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const { rowCount } = await client.query(
      `
      UPDATE public.features f
      SET props = $1::jsonb
      WHERE f.id = $2::uuid
        AND f.layer_id = $3
      `,
      [JSON.stringify(props), fid, layerId]
    );

    if (!rowCount) {
      return NextResponse.json(
        { ok: false, error: "Feature not found for this layer." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to update feature." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
