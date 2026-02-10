// app/api/layers/[id]/route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

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
