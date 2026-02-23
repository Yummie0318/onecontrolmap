// app/api/layers/[id]/route.ts
import { NextResponse } from "next/server";
import { poolDb1, poolDb2 } from "@/lib/db";

function cleanName(v: any) {
  return String(v ?? "").trim().replace(/\s+/g, " ");
}

async function getClientFromLayerId(layerId: string) {
  // Returns { db: "db1"|"db2", client } if layer exists, else null
  const c1 = await poolDb1.connect();
  try {
    const r1 = await c1.query(`SELECT id FROM public.layers WHERE id = $1`, [layerId]);
    if (r1.rowCount) return { db: "db1" as const, client: c1 };
  } catch {
    c1.release();
    throw new Error("DB1 query failed.");
  }
  c1.release();

  const c2 = await poolDb2.connect();
  try {
    const r2 = await c2.query(`SELECT id FROM public.layers WHERE id = $1`, [layerId]);
    if (r2.rowCount) return { db: "db2" as const, client: c2 };
  } catch {
    c2.release();
    throw new Error("DB2 query failed.");
  }
  c2.release();

  return null;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: layerId } = await ctx.params;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const name = cleanName(body?.name);

  if (!layerId) {
    return NextResponse.json({ ok: false, error: "Missing layer id." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ ok: false, error: "Layer name is required." }, { status: 400 });
  }
  if (name.length > 120) {
    return NextResponse.json(
      { ok: false, error: "Layer name is too long (max 120 chars)." },
      { status: 400 }
    );
  }

  // find which DB has this layer
  const found = await getClientFromLayerId(layerId);
  if (!found) {
    return NextResponse.json({ ok: false, error: "Layer not found." }, { status: 404 });
  }

  const client = found.client;
  try {
    // duplicate name check ONLY inside the same DB
    const dup = await client.query(
      `SELECT id FROM public.layers WHERE LOWER(name) = LOWER($1) AND id <> $2 LIMIT 1`,
      [name, layerId]
    );
    if ((dup.rowCount ?? 0) > 0) {
      return NextResponse.json(
        { ok: false, error: "A layer with that name already exists." },
        { status: 409 }
      );
    }

    const updated = await client.query(
      `UPDATE public.layers
       SET name = $1
       WHERE id = $2
       RETURNING id, name, source_filename, geom_type, srid, feature_count, created_at`,
      [name, layerId]
    );

    return NextResponse.json({ ok: true, layer: updated.rows[0], db: found.db });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to rename layer." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: layerId } = await ctx.params;

  if (!layerId) {
    return NextResponse.json({ ok: false, error: "Missing layer id." }, { status: 400 });
  }

  // find which DB has this layer
  const found = await getClientFromLayerId(layerId);
  if (!found) {
    return NextResponse.json({ ok: false, error: "Layer not found." }, { status: 404 });
  }

  const client = found.client;
  try {
    await client.query("BEGIN");

    // delete children first (unless ON DELETE CASCADE)
    await client.query(`DELETE FROM public.features WHERE layer_id = $1`, [layerId]);

    const res = await client.query(`DELETE FROM public.layers WHERE id = $1`, [layerId]);

    await client.query("COMMIT");

    if (res.rowCount === 0) {
      return NextResponse.json({ ok: false, error: "Layer not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, db: found.db });
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to delete layer." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}