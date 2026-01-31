// C:\Users\Yummie03\Desktop\onemap\app\api\map\run-plan\route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

type Op = "=" | "!=" | ">" | ">=" | "<" | "<=" | "ilike";
type DatasetKey = "CBFMA" | "PA" | "UNKNOWN";

type Filter = { field: string; op: Op; value: any };

type Plan = {
  layerName: DatasetKey;
  filters: Filter[];
  anyOf?: Filter[][];
  limit: number;
  orderBy?: { field: string; direction: "asc" | "desc" } | null;
  aggregate?: { type: "count" | "sum" | "avg" | "min" | "max"; field?: string } | null;
  explanation?: string;
};

/* ---------------- text helpers ---------------- */

function normalizeValue(val: string) {
  return String(val ?? "")
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-`~()\\[\]"'’]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// DB-side normalization: punctuation -> space, collapse spaces
function normalizeTextSql(expr: string) {
  return `
    regexp_replace(
      regexp_replace(
        replace(replace(lower(${expr}), '-', ' '), '_', ' '),
        '[\\.,/#!$%^&*;:{}=\\-\\\`~\\(\\)\\[\\]"''’\\\\]+',
        ' ',
        'g'
      ),
      '\\s+',
      ' ',
      'g'
    )
  `.trim();
}

function canonicalFieldName(field: string) {
  return String(field ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_")
    .toUpperCase();
}

function isSafeFieldName(field: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(field);
}

/* ---------------- STOPWORDS ---------------- */

const STOPWORDS = new Set([
  "i","im","i'm","me","my","mine","we","us","our","you","your","yours",
  "please","pls","kindly","can","could","would","will","want","need","like",
  "show","display","list","find","search","get","give","provide","tell",
  "all","records","record","entries","entry","data","map","layer",
  "of","in","at","within","near","for","from","on","the","a","an","to",

  // ✅ important: do NOT turn these into keywords (they kill results)
  "smallest","largest","biggest","lowest","highest","minimum","maximum",
  "area","hectare","hectares","ha","km","square","sqm"
]);

function isStopwordToken(t: string) {
  const x = normalizeValue(t);
  return !x || STOPWORDS.has(x);
}

/* ---------------- structured fields (protect from widening) ---------------- */

const STRUCTURED_FIELDS = new Set([
  "CENRO",
  "PENRO",
  "REGION",
  "TYPE",
  "REMARKS",
  "TENURE",
  "ACRONYM",
  "PO_NAME",
  "PO_ADD",
  "NAME_PO",
  "ADD_PO",
  "PSGC",
  "REG_NO",
  "REG_DTE",
  "STATUS",
  "PROVINCE",
  "MUNI_CTY",
  "BARANGAY",
  "PA",
  "PA_1",
]);

function isStructuredFieldName(field: string) {
  const f = canonicalFieldName(field);
  if (!f) return false;
  if (f === "__KEYWORD") return false;
  if (f === "__AREA__") return false;
  return STRUCTURED_FIELDS.has(f);
}

/* ---------------- heuristics ---------------- */

function isLikelyNumberField(field: string) {
  return /_HA$|_KM$|AREA|COUNT|QTY|NUMBER|AMOUNT|VALUE|HECTARES|HA$/i.test(field);
}
function isLikelyDateField(field: string) {
  return /DATE|_DTE|_ISSD|_EXPD|REG_DATE|_DT$/i.test(field);
}

/* ---------------- dataset -> layer patterns ---------------- */

function datasetPatterns(dataset: DatasetKey) {
  switch (dataset) {
    case "CBFMA":
      return ["TEN_CBFMA%", "CBFMA%", "CBFM%", "MERGE_CBFM%"];
    case "PA":
      return ["PA_%", "PA%", "PROTECTED_AREA%", "PROTECTEDAREA%"];
    default:
      return ["%"];
  }
}

/* ---------------- tokenizing / parsing ---------------- */

function stripCommandWordsKeepDataset(raw: string) {
  const s = normalizeValue(raw);
  return s
    .replace(/\b(show|display|list|find|search|get|give|provide|tell|all|records|entries|data|map|layer|please|pls|kindly|can|could|would|will|want|need|like|you|me|i|we|us|our|my)\b/g, " ")
    .replace(/\b(of|in|at|within|near|for|from|on|the|a|an|to)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripCommandWordsForKeyword(raw: string) {
  const s = stripCommandWordsKeepDataset(raw);
  return s
    .replace(/\b(cbfma|cbfm|tenure)\b/g, " ")
    .replace(/\b(pa|protected\s+area(s)?|protectedarea(s)?|protected|nipas)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseQueryGroups(raw: string) {
  const s = stripCommandWordsForKeyword(raw);
  if (!s) return [];

  const orParts = s
    .split(/\s+\bor\b\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);

  const groups = orParts.map((part) => {
    const tokens = part
      .split(/,|;|\s+\band\b\s+|&/i)
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((t) => t.length >= 2)
      .filter((t) => !isStopwordToken(t));
    return tokens;
  });

  return groups.filter((g) => g.length > 0);
}

function tokenizeMeaningful(raw: string) {
  const cleaned = stripCommandWordsForKeyword(raw);
  if (!cleaned) return [];
  const tokens = cleaned
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .filter((t) => !isStopwordToken(t));
  return Array.from(new Set(tokens));
}

/* ---------------- NEW: get real fields from DB ---------------- */

let FIELDS_CACHE: { at: number; key: string; fields: string[] } | null = null;

async function getAvailableFields(layerIds: string[]) {
  const key = layerIds.slice().sort().join("|");
  const now = Date.now();
  if (FIELDS_CACHE && FIELDS_CACHE.key === key && now - FIELDS_CACHE.at < 30_000) {
    return FIELDS_CACHE.fields;
  }

  const r = await pool.query(
    `
    SELECT fields
    FROM public.layers
    WHERE id = ANY($1)
    `,
    [layerIds]
  );

  const set = new Set<string>();
  for (const row of r.rows) {
    const obj = (row.fields ?? {}) as Record<string, any>;
    for (const k of Object.keys(obj)) set.add(String(k));
  }

  const fields = Array.from(set);
  FIELDS_CACHE = { at: now, key, fields };
  return fields;
}

function resolveFieldCandidates(requested: string, availableFields: string[]) {
  const want = canonicalFieldName(requested);
  if (!want) return [];

  const exact: string[] = [];
  const starts: string[] = [];
  const contains: string[] = [];

  for (const f of availableFields) {
    const nf = canonicalFieldName(f);
    if (nf === want) exact.push(f);
    else if (nf.startsWith(want)) starts.push(f);
    else if (nf.includes(want)) contains.push(f);
  }

  return [...exact, ...starts, ...contains].slice(0, 6);
}

/* ---------------- dataset auto-pick (CBFMA vs PA only) ---------------- */

async function autoPickDatasetFromDB(rawQuery: string): Promise<DatasetKey> {
  const keep = stripCommandWordsKeepDataset(rawQuery);
  if (/\b(cbfma|cbfm|tenure)\b/i.test(keep)) return "CBFMA";
  if (/\b(pa|protected\s+area(s)?|protectedarea(s)?|protected|nipas)\b/i.test(keep)) return "PA";

  const tokens = tokenizeMeaningful(rawQuery);
  if (!tokens.length) return "UNKNOWN";

  const like = `%${normalizeValue(tokens[0])}%`;
  const candidates: DatasetKey[] = ["CBFMA", "PA"];

  let best: { ds: DatasetKey; score: number } = { ds: "UNKNOWN", score: 0 };

  for (const ds of candidates) {
    const patterns = datasetPatterns(ds);

    const r = await pool.query(
      `
      WITH layer_ids AS (
        SELECT id
        FROM public.layers
        WHERE (${patterns.map((_, i) => `name ILIKE $${i + 1}`).join(" OR ")})
      )
      SELECT COUNT(*)::int AS c
      FROM public.features f
      WHERE f.layer_id = ANY(ARRAY(SELECT id FROM layer_ids))
        AND EXISTS (
          SELECT 1
          FROM jsonb_each_text(f.props) kv
          WHERE ${normalizeTextSql("kv.value")} LIKE $${patterns.length + 1}
        )
      `,
      [...patterns, like]
    );

    const score = Number(r.rows?.[0]?.c ?? 0);
    if (score > best.score) best = { ds, score };
  }

  return best.ds;
}

/* ---------------- WORD / WHOLE-TOKEN matching ---------------- */

function buildWordLikePattern(token: string) {
  const t = normalizeValue(token);
  return `% ${t} %`;
}

function normalizedWithPaddingSql(expr: string) {
  return `(' ' || ${normalizeTextSql(expr)} || ' ')`;
}

/* ---------------- pick best area field ---------------- */

function pickBestAreaField(availableFields: string[]) {
  const prefs = ["AREA_HA", "HECTARES", "HECTARE", "AREA", "SHAPE_AREA", "Shape_Area", "Shape_Area_1"];
  const canon = (x: string) => canonicalFieldName(x);

  for (const p of prefs) {
    const hit = availableFields.find((f) => canon(f) === canon(p));
    if (hit) return hit;
  }

  const fallback = availableFields.find((f) => /AREA|HECTARES|_HA|HA$/i.test(f));
  return fallback ?? null;
}

/* ---------------- SQL builder ---------------- */

function buildFilterClauseDynamic(f: Filter, pStart: number, availableFields: string[]) {
  const allowedOps = new Set<Op>(["=", "!=", "<", ">", "<=", ">=", "ilike"]);
  if (!f?.field || !allowedOps.has(f.op)) return null;

  const op = f.op;
  const value = f.value;

  // __keyword: search ANY props value
  if (canonicalFieldName(f.field) === "__KEYWORD" && typeof value === "string") {
    const token = normalizeValue(value);
    if (token.length < 2) return null;

    // ignore stopwords so they never kill results
    if (isStopwordToken(token)) return null;

    // short tokens => word-match
    const useWord = token.length <= 4;
    const likeParam = useWord ? buildWordLikePattern(token) : `%${token}%`;

    const clauseSql = `EXISTS (
      SELECT 1
      FROM jsonb_each_text(props) kv
      WHERE ${
        useWord
          ? `${normalizedWithPaddingSql("kv.value")} LIKE $${pStart}`
          : `${normalizeTextSql("kv.value")} LIKE $${pStart}`
      }
    )`;

    return { clauseSql: `(${clauseSql})`, params: [likeParam], next: pStart + 1 };
  }

  // requested field -> candidates
  const candidates = resolveFieldCandidates(f.field, availableFields).filter((x) => isSafeFieldName(String(x)));
  const fieldsToTry = candidates.length ? candidates : [String(f.field)];

  const perFieldClauses: string[] = [];
  const params: any[] = [];
  let p = pStart;

  for (const field of fieldsToTry) {
    if (typeof value === "string" && (op === "=" || op === "!=" || op === "ilike")) {
      const token = normalizeValue(value);

      if (op === "ilike") {
        const useWord = token.length <= 4;
        const left = useWord ? normalizedWithPaddingSql(`(props->>$${p})`) : normalizeTextSql(`(props->>$${p})`);
        const like = useWord ? buildWordLikePattern(token) : (token.includes("%") ? token : `%${token}%`);

        perFieldClauses.push(`${left} LIKE $${p + 1}`);
        params.push(field, like);
        p += 2;
        continue;
      }

      const leftEq = normalizeTextSql(`(props->>$${p})`);
      if (op === "=") {
        perFieldClauses.push(`${leftEq} = $${p + 1}`);
        params.push(field, token);
        p += 2;
        continue;
      }
      if (op === "!=") {
        perFieldClauses.push(`${leftEq} <> $${p + 1}`);
        params.push(field, token);
        p += 2;
        continue;
      }
    }

    if (typeof value === "number" || isLikelyNumberField(String(field))) {
      perFieldClauses.push(`(NULLIF(props->>$${p}, '')::double precision) ${op} $${p + 1}`);
      params.push(field, Number(value));
      p += 2;
      continue;
    }

    if (isLikelyDateField(String(field))) {
      perFieldClauses.push(`(NULLIF(props->>$${p}, '')::date) ${op} $${p + 1}::date`);
      params.push(field, String(value));
      p += 2;
      continue;
    }

    perFieldClauses.push(`(props->>$${p}) ${op} $${p + 1}`);
    params.push(field, String(value));
    p += 2;
  }

  if (!perFieldClauses.length) return null;

  const clauseSql = perFieldClauses.length === 1 ? perFieldClauses[0] : `(${perFieldClauses.join(" OR ")})`;
  return { clauseSql, params, next: p };
}

/* ---------------- handler ---------------- */

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { plan?: Plan; query?: string };
    const plan = body?.plan;
    const rawQuery = typeof body?.query === "string" ? body.query.trim() : "";

    if (!plan?.layerName) {
      return NextResponse.json({ ok: false, error: "Missing plan.layerName." }, { status: 400 });
    }

    // only support CBFMA + PA
    let resolvedLayerName: DatasetKey = ["CBFMA", "PA"].includes(plan.layerName) ? plan.layerName : "UNKNOWN";

    if ((resolvedLayerName === "UNKNOWN" || !resolvedLayerName) && rawQuery) {
      const picked = await autoPickDatasetFromDB(rawQuery);
      if (picked !== "UNKNOWN") resolvedLayerName = picked;
    }
    if (resolvedLayerName === "UNKNOWN") resolvedLayerName = "CBFMA";

    const patterns = datasetPatterns(resolvedLayerName);

    const layerRes = await pool.query(
      `
      SELECT l.id, l.name
      FROM public.layers l
      WHERE (${patterns.map((_, i) => `l.name ILIKE $${i + 1}`).join(" OR ")})
      ORDER BY l.created_at DESC
      `,
      patterns
    );

    if (layerRes.rowCount === 0) {
      return NextResponse.json({ ok: false, error: `No layers matched dataset: ${resolvedLayerName}` }, { status: 404 });
    }

    const layerIds = layerRes.rows.map((r) => r.id as string);
    const layerPicked = layerRes.rows.map((r) => r.name as string);

    const availableFields = await getAvailableFields(layerIds);

    const hasFilters =
      (Array.isArray(plan.filters) && plan.filters.length > 0) ||
      (Array.isArray(plan.anyOf) && plan.anyOf.length > 0);

    const effectivePlan: Plan = {
      ...plan,
      layerName: resolvedLayerName,
      filters: Array.isArray(plan.filters) ? [...plan.filters] : [],
      anyOf: Array.isArray(plan.anyOf) ? plan.anyOf : undefined,
      limit: Number.isFinite(Number(plan.limit)) ? Number(plan.limit) : 200,
    };

    // ✅ SMART WIDENING (SAFE):
    // Only widen when the single filter is NOT structured (so we don't delete correct CENRO filters).
    if (
      rawQuery &&
      !effectivePlan.aggregate &&
      Array.isArray(effectivePlan.filters) &&
      effectivePlan.filters.length === 1 &&
      (!Array.isArray(effectivePlan.anyOf) || effectivePlan.anyOf.length === 0)
    ) {
      const only = effectivePlan.filters[0];
      const isSingleTextIlike =
        only?.op === "ilike" &&
        typeof only?.value === "string" &&
        canonicalFieldName(only?.field) !== "__KEYWORD";

      if (isSingleTextIlike && !isStructuredFieldName(String(only.field))) {
        const tokens = tokenizeMeaningful(rawQuery);
        if (tokens.length) {
          effectivePlan.filters = tokens.map((t) => ({ field: "__keyword", op: "ilike", value: t }));
        }
      }
    }

    // If AI gave no filters: build token filters from query
    if (!hasFilters && rawQuery) {
      const groups = parseQueryGroups(rawQuery);

      if (groups.length > 1) {
        effectivePlan.anyOf = groups.map((tokens) =>
          tokens.map((t) => ({ field: "__keyword", op: "ilike" as Op, value: t }))
        );
      } else {
        const tokens = groups.length === 1 ? groups[0] : tokenizeMeaningful(rawQuery);
        for (const t of tokens) {
          effectivePlan.filters.push({ field: "__keyword", op: "ilike", value: t });
        }
      }

      if (/\bshow\s+all\b/i.test(normalizeValue(rawQuery))) {
        effectivePlan.limit = 2000;
      }
    }

    const clauses: string[] = [`layer_id = ANY($1)`];
    const params: any[] = [layerIds];
    let p = 2;

    for (const f of effectivePlan.filters || []) {
      const built = buildFilterClauseDynamic(f, p, availableFields);
      if (!built) continue;
      clauses.push(built.clauseSql);
      params.push(...built.params);
      p = built.next;
    }

    if (Array.isArray(effectivePlan.anyOf) && effectivePlan.anyOf.length > 0) {
      const orGroups: string[] = [];

      for (const group of effectivePlan.anyOf) {
        const groupClauses: string[] = [];
        let gp = p;
        const gpParams: any[] = [];

        for (const f of group || []) {
          const built = buildFilterClauseDynamic(f, gp, availableFields);
          if (!built) continue;
          groupClauses.push(built.clauseSql);
          gpParams.push(...built.params);
          gp = built.next;
        }

        if (groupClauses.length > 0) {
          orGroups.push(`(${groupClauses.join(" AND ")})`);
          params.push(...gpParams);
          p = gp;
        }
      }

      if (orGroups.length > 0) clauses.push(`(${orGroups.join(" OR ")})`);
    }

    const limit = Math.min(Math.max(Number(effectivePlan.limit ?? 200), 0), 2000);

    // ORDER BY
    let orderSql = "";
    const orderParams: any[] = [];

    if (effectivePlan.orderBy?.field && limit > 0) {
      const dir = effectivePlan.orderBy.direction === "desc" ? "DESC" : "ASC";

      if (canonicalFieldName(effectivePlan.orderBy.field) === "__AREA__") {
        const areaField = pickBestAreaField(availableFields);
        if (areaField) {
          orderSql = `ORDER BY (NULLIF(props->>$${p}, '')::double precision) ${dir} NULLS LAST`;
          orderParams.push(areaField);
          p += 1;
        }
      } else {
        const candidates = resolveFieldCandidates(effectivePlan.orderBy.field, availableFields);
        const picked = candidates[0] ?? effectivePlan.orderBy.field;

        orderSql = `ORDER BY ${normalizeTextSql(`(props->>$${p})`)} ${dir} NULLS LAST`;
        orderParams.push(picked);
        p += 1;
      }
    }

// FEATURES MODE (✅ fix: make geom valid + 2D + 4326 so it will display)
const sql = `
  WITH filtered AS (
    SELECT
      CASE
        WHEN geom IS NULL THEN NULL
        WHEN ST_SRID(geom) = 4326 THEN ST_Force2D(ST_MakeValid(geom))
        WHEN ST_SRID(geom) = 0 THEN ST_Force2D(ST_MakeValid(ST_SetSRID(geom, 4326)))
        ELSE ST_Force2D(ST_MakeValid(ST_Transform(geom, 4326)))
      END AS geom4326,
      props
    FROM public.features
    WHERE ${clauses.join(" AND ")}
    ${orderSql}
    LIMIT ${limit}
  )
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'type','Feature',
          'geometry', CASE
            WHEN geom4326 IS NULL THEN NULL
            ELSE ST_AsGeoJSON(geom4326)::jsonb
          END,
          'properties', props
        )
      ),
      '[]'::jsonb
    )
  ) AS geojson
  FROM filtered;
`;


    const r = await pool.query(sql, [...params, ...orderParams]);
    const gj = r.rows?.[0]?.geojson ?? { type: "FeatureCollection", features: [] };
    const featureCount = Array.isArray(gj?.features) ? gj.features.length : 0;

    const nullGeomCount = Array.isArray(gj?.features)
  ? gj.features.filter((f: any) => !f?.geometry).length
  : 0;


  return NextResponse.json({
    ok: true,
    layerPicked,
    stats: { featureCount, nullGeomCount },
    geojson: gj,
    debug: {
      rawQueryReceived: rawQuery,
      resolvedLayerName,
      availableFieldsCount: availableFields.length,
      effectivePlanFilters: effectivePlan.filters,
      effectivePlanAnyOf: effectivePlan.anyOf,
      orderBy: effectivePlan.orderBy,
    },
  });
  
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}
