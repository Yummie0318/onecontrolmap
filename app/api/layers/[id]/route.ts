// app/api/layers/[id]/route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

function cleanName(v: any) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " "); // normalize spaces
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
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

  // optional: keep names reasonable
  if (name.length > 120) {
    return NextResponse.json(
      { ok: false, error: "Layer name is too long (max 120 chars)." },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    // 1) make sure layer exists
    const exists = await client.query(
      `SELECT id, name FROM public.layers WHERE id = $1`,
      [layerId]
    );
    if (!exists.rowCount) {
      return NextResponse.json({ ok: false, error: "Layer not found." }, { status: 404 });
    }

    // 2) check duplicate name (case-insensitive)
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

    // 3) update
    const updated = await client.query(
      `UPDATE public.layers
       SET name = $1
       WHERE id = $2
       RETURNING id, name, source_filename, geom_type, srid, feature_count, created_at`,
      [name, layerId]
    );

    return NextResponse.json({ ok: true, layer: updated.rows[0] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to rename layer." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: layerId } = await ctx.params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // delete children first (unless you have ON DELETE CASCADE)
    await client.query(`DELETE FROM public.features WHERE layer_id = $1`, [layerId]);

    const res = await client.query(`DELETE FROM public.layers WHERE id = $1`, [layerId]);

    await client.query("COMMIT");

    if (res.rowCount === 0) {
      return NextResponse.json({ ok: false, error: "Layer not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to delete layer." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
