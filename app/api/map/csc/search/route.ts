import { NextResponse } from "next/server";
import { parseUserMessageToQuery, searchDatasetGeoJSON } from "@/app/api/map/_lib/search";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = String(body?.message ?? body?.q ?? "").trim();
    if (!message) return NextResponse.json({ ok: false, error: "Missing message" }, { status: 400 });

    const dataset = "CSC" as const;
    const { normalized, parsed, extraWhereSql } = parseUserMessageToQuery(dataset, message);

    const result = await searchDatasetGeoJSON({
      dataset,
      parsed,
      limit: body?.limit ?? 500,
      simplifyTolerance: body?.simplifyTolerance ?? 0.00005,
      extraWhereSql,
    });

    return NextResponse.json({
      ok: true,
      dataset,
      normalized,
      parsed,
      geojson: (result as any).geojson,
      meta: result,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
