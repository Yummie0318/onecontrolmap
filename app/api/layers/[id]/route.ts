import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> } // ✅ params is a Promise
) {
  const { id: layerId } = await ctx.params;

  const client = await pool.connect();
  try {
    const { rowCount } = await client.query(
      `DELETE FROM public.layers WHERE id = $1`,
      [layerId]
    );

    if (!rowCount) {
      return NextResponse.json({ ok: false, error: "Layer not found." }, { status: 404 });
    }

    // If you set FK ON DELETE CASCADE, features will auto-delete.
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Delete failed." }, { status: 500 });
  } finally {
    client.release();
  }
}
