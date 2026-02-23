import { NextResponse } from "next/server";
import { poolDb1, poolDb2 } from "@/lib/db";

type LayerRow = {
  id: string;
  name: string;
  source_filename: string | null;
  geom_type: string | null;
  srid: number | null;
  feature_count: number | null;
  created_at: string | null;
  _source: "db1" | "db2";
};

export async function GET() {
  try {
    const sql = `
      SELECT
        id,
        name,
        source_filename,
        geom_type,
        srid,
        feature_count,
        created_at
      FROM public.layers
      ORDER BY created_at DESC NULLS LAST, name ASC
    `;

    // Query both databases safely
    const [r1, r2] = await Promise.all([
      poolDb1.query(sql).catch(() => ({ rows: [] })),
      poolDb2.query(sql).catch(() => ({ rows: [] })),
    ]);

    const db1Rows: LayerRow[] = (r1.rows ?? []).map((r: any) => ({
      ...r,
      _source: "db1",
    }));

    const db2Rows: LayerRow[] = (r2.rows ?? []).map((r: any) => ({
      ...r,
      _source: "db2",
    }));

    // Merge DB2 first (new storage), then DB1
    const merged = [...db2Rows, ...db1Rows];

    // Final stable sort
    merged.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      ok: true,
      layers: merged,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed" },
      { status: 500 }
    );
  }
}