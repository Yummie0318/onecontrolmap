import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

type GeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: any;
    properties?: Record<string, any> | null;
  }>;
};

function inferFieldTypes(props: Record<string, any>[]) {
  const types: Record<string, string> = {};
  for (const p of props) {
    for (const [k, v] of Object.entries(p)) {
      if (v === null || v === undefined) continue;
      const t =
        typeof v === "number"
          ? "number"
          : typeof v === "boolean"
          ? "boolean"
          : typeof v === "string"
          ? "string"
          : "json";
      // keep first non-null type seen
      if (!types[k]) types[k] = t;
    }
  }
  return types;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Missing file (field name must be 'file')." },
        { status: 400 }
      );
    }

    // Basic file checks
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "File too large (max 25MB)." },
        { status: 413 }
      );
    }

    const text = await file.text();

    let geo: GeoJSONFeatureCollection;
    try {
      geo = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON." },
        { status: 400 }
      );
    }

    if (geo?.type !== "FeatureCollection" || !Array.isArray(geo.features)) {
      return NextResponse.json(
        { ok: false, error: "GeoJSON must be a FeatureCollection." },
        { status: 400 }
      );
    }

    if (geo.features.length === 0) {
      return NextResponse.json(
        { ok: false, error: "GeoJSON has no features." },
        { status: 400 }
      );
    }

    // Determine geometry type (from first feature)
    const firstGeomType = geo.features[0]?.geometry?.type;
    if (!firstGeomType) {
      return NextResponse.json(
        { ok: false, error: "Missing geometry.type in first feature." },
        { status: 400 }
      );
    }

    // Collect props for schema inference
    const propsList: Record<string, any>[] = geo.features
      .map((f) => (f.properties && typeof f.properties === "object" ? f.properties : {}))
      .slice(0, 200); // limit inference workload

    const fields = inferFieldTypes(propsList);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1) Insert layer
      const layerName =
        (form.get("name") as string | null)?.trim() ||
        file.name.replace(/\.[^/.]+$/, "") ||
        "uploaded_layer";

      const insertLayer = await client.query(
        `
        INSERT INTO public.layers (name, source_filename, geom_type, srid, feature_count, fields)
        VALUES ($1, $2, $3, 4326, $4, $5::jsonb)
        RETURNING id
        `,
        [layerName, file.name, firstGeomType, geo.features.length, JSON.stringify(fields)]
      );

      const layerId: string = insertLayer.rows[0].id;

      // 2) Insert features (batch)
      // Use PostGIS: ST_GeomFromGeoJSON(geom_json) then force SRID 4326
      const batchSize = 300; // safe chunk size
      for (let i = 0; i < geo.features.length; i += batchSize) {
        const chunk = geo.features.slice(i, i + batchSize);

        // Build multi-values insert
        const values: any[] = [];
        const placeholders: string[] = [];

        chunk.forEach((f, idx) => {
          const base = idx * 3;
          const geomJson = f.geometry;
          if (!geomJson) {
            throw new Error(`Feature at index ${i + idx} has no geometry.`);
          }
          const props = f.properties && typeof f.properties === "object" ? f.properties : {};

          values.push(layerId, JSON.stringify(geomJson), JSON.stringify(props));
          placeholders.push(`($${base + 1}, ST_SetSRID(ST_GeomFromGeoJSON($${base + 2}), 4326), $${base + 3}::jsonb)`);
        });

        await client.query(
          `
          INSERT INTO public.features (layer_id, geom, props)
          VALUES ${placeholders.join(",")}
          `,
          values
        );
      }

      await client.query("COMMIT");

      return NextResponse.json({
        ok: true,
        layerId,
        name: layerName,
        featureCount: geo.features.length,
        geomType: firstGeomType,
      });
    } catch (e: any) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { ok: false, error: e?.message ?? "Upload failed." },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unexpected error." },
      { status: 500 }
    );
  }
}
