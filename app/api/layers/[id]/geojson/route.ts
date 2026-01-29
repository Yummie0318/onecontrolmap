import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> } // ✅ params is a Promise
) {
  const { id: layerId } = await ctx.params; // ✅ unwrap with await

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `
      SELECT jsonb_build_object(
        'type','FeatureCollection',
        'features', COALESCE(jsonb_agg(
          jsonb_build_object(
            'type','Feature',
            'geometry', ST_AsGeoJSON(f.geom)::jsonb,
            'properties', COALESCE(f.props, '{}'::jsonb)
          )
        ), '[]'::jsonb)
      ) AS fc
      FROM public.features f
      WHERE f.layer_id = $1
      `,
      [layerId]
    );

    return NextResponse.json({ ok: true, geojson: rows[0]?.fc ?? { type: "FeatureCollection", features: [] } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
