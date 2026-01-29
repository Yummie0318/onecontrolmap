import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

type Op = "=" | "!=" | ">" | ">=" | "<" | "<=" | "ilike";
type DatasetKey = "CBFMA" | "NGP" | "SIFMA" | "FIRE" | "UNKNOWN";

type Filter = { field: string; op: Op; value: string | number | boolean };

type Plan = {
  layerName: DatasetKey;
  filters: Filter[];
  // OR groups. Each inner array is AND. Groups are OR'ed together.
  anyOf?: Filter[][];
  orderBy?: { field: string; direction: "asc" | "desc" } | null;
  aggregate?: { type: "count" | "sum" | "avg" | "min" | "max"; field?: string } | null;
  limit: number;
  explanation?: string;
};

/* ---------------- helpers ---------------- */

function extractTextFromResponses(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();

  const out = data?.output;
  if (!Array.isArray(out)) return "";

  let combined = "";
  for (const item of out) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (typeof c?.text === "string") combined += c.text;
      if (typeof c?.content === "string") combined += c.content;
    }
  }
  return combined.trim();
}

function stripCodeFences(s: string) {
  const t = s.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  return t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

const allowedOps: Op[] = ["=", "!=", ">", ">=", "<", "<=", "ilike"];

function normalizeText(s: string) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------- lightweight catalog ---------------- */

let CATALOG_CACHE: { at: number; layers: Array<{ name: string; fields: string[] }> } | null = null;

async function getCatalog() {
  const now = Date.now();
  if (CATALOG_CACHE && now - CATALOG_CACHE.at < 30_000) return CATALOG_CACHE.layers;

  const r = await pool.query(`
    SELECT name, fields
    FROM public.layers
    ORDER BY created_at DESC
    LIMIT 60
  `);

  const layers = r.rows.map((row) => ({
    name: String(row.name),
    fields: Object.keys((row.fields ?? {}) as Record<string, any>),
  }));

  CATALOG_CACHE = { at: now, layers };
  return layers;
}

/* ---------------- dataset detection ---------------- */

function detectDataset(message: string): DatasetKey {
  const m = message.toLowerCase();
  if (m.includes("cbfma") || m.includes("cbfm") || m.includes("tenure")) return "CBFMA";
  if (m.includes("ngp") || m.includes("greening")) return "NGP";
  if (m.includes("sifma")) return "SIFMA";
  if (m.includes("fire") || m.includes("incident") || m.includes("hotspot")) return "FIRE";
  return "UNKNOWN";
}

/* ---------------- hard intent extraction (deterministic) ---------------- */

function hasRenewalHint(raw: string) {
  const m = raw.toLowerCase();
  return m.includes("renewal") || m.includes("for renewal") || m.includes("renew");
}

/**
 * Extract: "cenro aparri and cenro alcala"
 * Supports:
 * - "cenro aparri"
 * - "cenro: aparri, alcala"
 * - "cenro aparri and alcala"
 */
function extractCenroList(raw: string): string[] {
  const s = normalizeText(raw);

  if (!s.includes("cenro")) return [];

  // grab everything after the first "cenro"
  // ex: "show cbfma of cenro aparri and cenro alcala"
  const after = s.split("cenro").slice(1).join(" cenro ").trim();
  if (!after) return [];

  // split by connectors, keep only meaningful words
  const parts = after
    .replace(/\b(of|in|at|within|near)\b/g, " ")
    .split(/\b(?:and|or|,|\/|&)\b/g)
    .map((x) => normalizeText(x).replace(/\bcenro\b/g, "").trim())
    .filter(Boolean);

  // remove too short junk
  const clean = parts
    .map((p) => p.replace(/[^a-z0-9\s]/g, "").trim())
    .filter((p) => p.length >= 3);

  // unique
  return Array.from(new Set(clean));
}

/**
 * Extract registration-like codes:
 * Examples:
 * - BAC-07-94
 * - CAG-1532-2014
 * - 2022110074309-01
 */
function extractRegCode(raw: string): string | null {
  const t = raw.trim();

  // hyphenated alpha-numeric code (BAC-07-94, CAG-1532-2014)
  const m1 = t.match(/\b[A-Za-z]{2,5}-\d{1,6}(?:-\d{1,6})+\b/);
  if (m1?.[0]) return m1[0];

  // long numeric with hyphen suffix (2022110074309-01)
  const m2 = t.match(/\b\d{8,}-\d{1,4}\b/);
  if (m2?.[0]) return m2[0];

  return null;
}

function extractPlaceHint(raw: string) {
  const s = normalizeText(raw);

  // If query is about CENRO specifically, don't treat as "place"
  if (s.includes("cenro")) return null;

  // "in gattaran"
  const re = /\b(?:in|within|at|near|of)\s+([a-z][a-z\s\-]+)\b/i;
  const hit = raw.match(re);
  if (hit?.[1]) return hit[1].trim();

  // single word leftover
  const cleaned = s
    .replace(/\b(show|all|cbfma|cbfm|ngp|sifma|fire|map|display|for|renewal)\b/g, "")
    .trim();

  if (cleaned && cleaned.length >= 4 && cleaned.split(" ").length <= 3) return cleaned;

  return null;
}

function mergeAnyOf(plan: Plan, groups: Filter[][]) {
  if (!groups.length) return;
  if (!Array.isArray(plan.anyOf) || plan.anyOf.length === 0) {
    plan.anyOf = groups;
    return;
  }
  plan.anyOf = [...plan.anyOf, ...groups];
}

/* ---------------- handler ---------------- */

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = body?.message;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ ok: false, error: "Missing message." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Missing OPENAI_API_KEY." }, { status: 500 });
    }

    const catalog = await getCatalog();
    const dataset = detectDataset(message);

    // ✅ hard hints
    const renewalHint = hasRenewalHint(message);
    const cenroList = extractCenroList(message); // ["aparri","alcala"]
    const regCode = extractRegCode(message);     // "BAC-07-94"
    const placeHint = extractPlaceHint(message); // fallback place search

    const schemaHint = catalog
      .slice(0, 25)
      .map((l) => `- ${l.name}: ${l.fields.slice(0, 15).join(", ")}`)
      .join("\n");

    const prompt = `
You are a GIS query planner for a web-based Control Map.

Convert the user's request into a STRICT JSON plan.

DATASET KEYS (layerName):
- "CBFMA" = all Community-Based Forest Management layers
- "NGP"   = National Greening Program
- "SIFMA"
- "FIRE"
- "UNKNOWN" if unclear

CBFMA FIELD REALITY:
- Municipality/places may be in ADD_PO or PO_ADD (sometimes MUNI_CITY exists).
- "For Renewal" is stored in REMARKS.
- CENRO is stored in CENRO.
- Registration codes are usually in REG_NO (sometimes LC_NO).

Rules:
- Use DATASET KEY for layerName.
- Use ilike with %...% for flexible text matching.
- Default limit = 200, "show all" => 2000.
- If user asks multiple values (ex: "cenro aparri and cenro alcala"), express as anyOf OR groups.

AVAILABLE LAYERS (for field hints only):
${schemaHint}

Return RAW JSON ONLY:
{
  "layerName": "CBFMA|NGP|SIFMA|FIRE|UNKNOWN",
  "filters": [{"field":string,"op":string,"value":string|number|boolean}],
  "anyOf": [[{"field":string,"op":string,"value":string|number|boolean}]],
  "orderBy": {"field":string,"direction":"asc"|"desc"} | null,
  "aggregate": {"type":"count"|"sum"|"avg"|"min"|"max","field"?:string} | null,
  "limit": number,
  "explanation": string
}

User message: ${message}

Detected hints:
- dataset=${dataset}
- renewal=${renewalHint ? "yes" : "no"}
- cenro=${cenroList.length ? cenroList.join(",") : "none"}
- regCode=${regCode ?? "none"}
- place=${placeHint ?? "none"}
`.trim();

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: prompt,
      }),
    });

    const raw = await r.json().catch(async () => ({ rawText: await r.text() }));
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: "OpenAI error", details: raw }, { status: 500 });
    }

    const text = extractTextFromResponses(raw);
    if (!text) {
      return NextResponse.json({ ok: false, error: "Model returned empty text." }, { status: 500 });
    }

    let plan: Plan;
    try {
      plan = JSON.parse(stripCodeFences(text));
    } catch {
      return NextResponse.json({ ok: false, error: "Model returned invalid JSON.", text }, { status: 500 });
    }

    /* ---------------- sanitization ---------------- */

    plan.layerName = (["CBFMA", "NGP", "SIFMA", "FIRE"].includes(plan.layerName) ? plan.layerName : dataset) as DatasetKey;

    if (!Array.isArray(plan.filters)) plan.filters = [];
    plan.filters = plan.filters.filter((f) => f && typeof f.field === "string" && allowedOps.includes(f.op));

    if (!Array.isArray(plan.anyOf)) plan.anyOf = undefined;
    if (Array.isArray(plan.anyOf)) {
      plan.anyOf = plan.anyOf
        .filter((g) => Array.isArray(g))
        .map((g) => g.filter((f) => f && typeof f.field === "string" && allowedOps.includes(f.op)))
        .filter((g) => g.length > 0);
      if (plan.anyOf.length === 0) plan.anyOf = undefined;
    }

    const lim = Number(plan.limit ?? 200);
    plan.limit = Number.isFinite(lim) ? Math.min(Math.max(lim, 0), 2000) : 200;

    if (!plan.explanation) plan.explanation = "";

    /* ---------------- HARD ENFORCEMENT (this fixes your 3 queries) ---------------- */

    // 1) renewal
    if (renewalHint && plan.layerName === "CBFMA") {
      plan.filters.push({ field: "REMARKS", op: "ilike", value: "%renewal%" });
    }

    // 2) CENRO list (Aparri OR Alcala)
    if (cenroList.length && plan.layerName === "CBFMA") {
      const groups: Filter[][] = cenroList.map((c) => [
        { field: "CENRO", op: "ilike", value: `%${normalizeText(c)}%` },
      ]);
      mergeAnyOf(plan, groups);
    }

    // 3) REG/LC codes like BAC-07-94
    if (regCode && plan.layerName === "CBFMA") {
      // use REG_NO; run-plan will alias if needed
      plan.filters.push({ field: "REG_NO", op: "ilike", value: `%${regCode}%` });
    }

    // Optional: place hint -> OR across common location fields
    if (placeHint && plan.layerName === "CBFMA") {
      const v = `%${normalizeText(placeHint)}%`;
      const groups: Filter[][] = [
        [{ field: "MUNI_CITY", op: "ilike", value: v }],
        [{ field: "ADD_PO", op: "ilike", value: v }],
        [{ field: "PO_ADD", op: "ilike", value: v }],
        [{ field: "PO_NAME", op: "ilike", value: v }],
        [{ field: "NAME_PO", op: "ilike", value: v }],
        [{ field: "W_NAME", op: "ilike", value: v }],
        [{ field: "NAME_WS", op: "ilike", value: v }],
        [{ field: "PENRO", op: "ilike", value: v }],
        [{ field: "CENRO", op: "ilike", value: v }],
        [{ field: "REGION", op: "ilike", value: v }],
      ];
      mergeAnyOf(plan, groups);
    }

    // Ensure dataset if user says cbfma
    const msgN = normalizeText(message);
    if (msgN.includes("cbfma") || msgN.includes("cbfm")) plan.layerName = "CBFMA";

    return NextResponse.json({
      ok: true,
      plan,
      thinking_text: plan.explanation || "Preparing the map…",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unexpected error." }, { status: 500 });
  }
}
