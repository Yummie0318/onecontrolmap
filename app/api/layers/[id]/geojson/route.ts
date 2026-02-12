// C:\Users\Yummie03\Desktop\onemap\app\api\layers\[id]\geojson\route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

function toNum(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: layerId } = await ctx.params;

  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") ?? "map") as "map" | "full";

  // ✅ used only for map mode to reduce payload (adjust if needed)
  const simplifyTolerance = toNum(url.searchParams.get("simplifyTolerance"), 0.00005);

  const client = await pool.connect();
  try {
    // ✅ MAP MODE: simplified geometry + minimal properties (fast)
    if (mode === "map") {
      const { rows } = await client.query(
        `
        SELECT jsonb_build_object(
          'type','FeatureCollection',
          'features', COALESCE(jsonb_agg(
            jsonb_build_object(
              'type','Feature',
              'id', f.id,
              'geometry', ST_AsGeoJSON(
                CASE
                  WHEN $2::float8 > 0 THEN ST_SimplifyPreserveTopology(f.geom, $2::float8)
                  ELSE f.geom
                END
              )::jsonb,
              'properties', jsonb_build_object('__fid', f.id)
            )
          ), '[]'::jsonb)
        ) AS fc
        FROM public.features f
        WHERE f.layer_id = $1
        `,
        [layerId, simplifyTolerance]
      );

      return NextResponse.json({
        ok: true,
        mode: "map",
        simplifyTolerance,
        geojson: rows[0]?.fc ?? { type: "FeatureCollection", features: [] },
      });
    }

    // ✅ FULL MODE: full props + full geometry (still heavy, use only when necessary)
    const { rows } = await client.query(
      `
      SELECT jsonb_build_object(
        'type','FeatureCollection',
        'features', COALESCE(jsonb_agg(
          jsonb_build_object(
            'type','Feature',
            'id', f.id,
            'geometry', ST_AsGeoJSON(f.geom)::jsonb,
            'properties',
              jsonb_build_object('__fid', f.id) || COALESCE(f.props, '{}'::jsonb)
          )
        ), '[]'::jsonb)
      ) AS fc
      FROM public.features f
      WHERE f.layer_id = $1
      `,
      [layerId]
    );

    return NextResponse.json({
      ok: true,
      mode: "full",
      geojson: rows[0]?.fc ?? { type: "FeatureCollection", features: [] },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
