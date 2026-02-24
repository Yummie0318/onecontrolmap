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

function badRequest(msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status: 400 });
}

function normalizeFids(fids: any) {
  if (!Array.isArray(fids) || fids.length === 0) return { ok: false as const, error: "Invalid feature id." };

  const allStr = fids.every((x) => typeof x === "string");
  if (!allStr) return { ok: false as const, error: "Invalid feature id. IDs must be strings." };

  const allInt = (fids as string[]).every((x) => isIntLike(x));
  const allUuid = (fids as string[]).every((x) => isUuid(x));

  if (!allInt && !allUuid) {
    return { ok: false as const, error: "Invalid feature id. IDs must be all integers OR all UUIDs." };
  }

  const idsParam = allUuid ? (fids as string[]) : (fids as string[]).map((x) => BigInt(x));
  return { ok: true as const, allUuid, idsParam };
}

function normalizeRemoveProps(v: any) {
  if (v == null) return { ok: true as const, keys: null as string[] | null };

  if (!Array.isArray(v) || v.length === 0) {
    return { ok: false as const, error: "remove_properties must be a non-empty array of strings." };
  }
  if (!v.every((x) => typeof x === "string" && x.trim().length > 0)) {
    return { ok: false as const, error: "remove_properties must contain only non-empty strings." };
  }

  // You can optionally filter reserved keys here if you want
  // Example: disallow "__fid" deletion:
  const keys = v.map((s) => s.trim()).filter((k) => k !== "__fid");
  if (keys.length === 0) return { ok: false as const, error: "remove_properties has no valid keys to remove." };

  return { ok: true as const, keys };
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: layerId } = await ctx.params;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const fids = body?.fids;
  const properties = body?.properties;
  const remove_properties = body?.remove_properties;

  const norm = normalizeFids(fids);
  if (!norm.ok) return badRequest(norm.error);

  const rem = normalizeRemoveProps(remove_properties);
  if (!rem.ok) return badRequest(rem.error);

  const hasProps =
    properties != null && typeof properties === "object" && !Array.isArray(properties) && Object.keys(properties).length > 0;

  const hasRemove = Array.isArray(rem.keys) && rem.keys.length > 0;

  if (!hasProps && !hasRemove) {
    return badRequest('Body must include at least one of: { properties: {...} } or { remove_properties: ["field"] }.');
  }

  if (properties != null && !hasProps) {
    // properties was provided but invalid
    return badRequest("properties must be a JSON object (not an array) and not empty.");
  }

  const picked = await pickDbByLayerId(layerId);
  if (!picked) {
    return NextResponse.json({ ok: false, error: "Layer not found." }, { status: 404 });
  }

  const client = await picked.pool.connect();
  try {
    // Build SQL based on which operations exist
    // - remove keys uses jsonb - text[]
    // - update uses jsonb || jsonb
    // We apply remove first, then merge updates.
    //
    // props = (COALESCE(props,'{}') - $removeKeys) || $properties

    let setExpr = "COALESCE(props, '{}'::jsonb)";
    const params: any[] = [layerId];
    let pIdx = 2;

    if (hasRemove) {
      setExpr = `(${setExpr} - $${pIdx}::text[])`;
      params.push(rem.keys);
      pIdx++;
    }

    if (hasProps) {
      setExpr = `(${setExpr} || $${pIdx}::jsonb)`;
      params.push(properties);
      pIdx++;
    }

    // ids param
    params.push(norm.idsParam);
    const idsIdx = pIdx;

    const sql = norm.allUuid
      ? `
        UPDATE public.features
        SET props = ${setExpr}
        WHERE layer_id = $1
          AND id = ANY($${idsIdx}::uuid[])
      `
      : `
        UPDATE public.features
        SET props = ${setExpr}
        WHERE layer_id = $1
          AND id = ANY($${idsIdx}::bigint[])
      `;

    const res = await client.query(sql, params);

    return NextResponse.json({
      ok: true,
      db: picked.db,
      updated: res.rowCount ?? 0,
      removed_keys: hasRemove ? rem.keys : [],
      merged_keys: hasProps ? Object.keys(properties) : [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: layerId } = await ctx.params;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const fids = body?.fids;
  const norm = normalizeFids(fids);
  if (!norm.ok) return badRequest(norm.error);

  const picked = await pickDbByLayerId(layerId);
  if (!picked) {
    return NextResponse.json({ ok: false, error: "Layer not found." }, { status: 404 });
  }

  if (body?.confirm !== true) {
    return badRequest('Delete requires { "confirm": true } to prevent accidental deletes.');
  }

  const client = await picked.pool.connect();
  try {
    const sql = norm.allUuid
      ? `
        DELETE FROM public.features
        WHERE layer_id = $1
          AND id = ANY($2::uuid[])
      `
      : `
        DELETE FROM public.features
        WHERE layer_id = $1
          AND id = ANY($2::bigint[])
      `;

    const res = await client.query(sql, [layerId, norm.idsParam]);

    return NextResponse.json({
      ok: true,
      db: picked.db,
      deleted: res.rowCount ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status: 500 });
  } finally {
    client.release();
  }
}