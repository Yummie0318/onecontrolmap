// app/api/layers/[id]/geojson/route.ts
import { NextResponse } from "next/server";
import { poolDb1, poolDb2 } from "@/lib/db";

function toNum(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

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

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: layerId } = await ctx.params;

  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") ?? "map") as "map" | "full";

  // used only for map mode to reduce payload
  const simplifyTolerance = toNum(url.searchParams.get("simplifyTolerance"), 0.00005);

  const picked = await pickDbByLayerId(layerId);
  if (!picked) {
    return NextResponse.json({ ok: false, error: "Layer not found." }, { status: 404 });
  }

  const client = await picked.pool.connect();
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
        db: picked.db,
        mode: "map",
        simplifyTolerance,
        geojson: rows[0]?.fc ?? { type: "FeatureCollection", features: [] },
      });
    }

    // ✅ FULL MODE: full props + full geometry (heavy)
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
      db: picked.db,
      mode: "full",
      geojson: rows[0]?.fc ?? { type: "FeatureCollection", features: [] },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status: 500 });
  } finally {
    client.release();
  }
}