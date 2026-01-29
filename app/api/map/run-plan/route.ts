import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

type Op = "=" | "!=" | ">" | ">=" | "<" | "<=" | "ilike";
type DatasetKey = "CBFMA" | "NGP" | "SIFMA" | "FIRE" | "UNKNOWN";

type Filter = { field: string; op: Op; value: any };

type Plan = {
  layerName: DatasetKey;
  filters: Filter[];
  anyOf?: Filter[][]; // OR groups (each group is AND)
  limit: number;
  orderBy?: { field: string; direction: "asc" | "desc" } | null;
  aggregate?: { type: "count" | "sum" | "avg" | "min" | "max"; field?: string } | null;
  explanation?: string;
};

/* ---------------- text helpers ---------------- */

function normalizeValue(val: string) {
  return val
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Used on DB-side so "BAC-07-94" matches "bac 07 94" etc.
function normalizeTextSql(expr: string) {
  return `regexp_replace(replace(replace(lower(${expr}), '-', ' '), '_', ' '), '\\s+', ' ', 'g')`;
}

function canonicalFieldName(field: string) {
  // Accept AI/user field names like "cenro", "CENRO", "cenro office"
  return field
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_")
    .toUpperCase();
}

/* ---------------- heuristics ---------------- */

function isLikelyNumberField(field: string) {
  return /_HA$|_KM$|AREA|COUNT|QTY|NUMBER|AMOUNT|VALUE/i.test(field);
}
function isLikelyDateField(field: string) {
  return /DATE|_DTE|_ISSD|_EXPD|REG_DATE/i.test(field);
}
function isSafeFieldName(field: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(field);
}

/* ---------------- dataset -> layer patterns ---------------- */

function datasetPatterns(dataset: DatasetKey) {
  switch (dataset) {
    case "CBFMA":
      return ["TEN_CBFMA%", "CBFMA%", "CBFM%", "MERGE_CBFM%"];
    case "NGP":
      return ["NGP%", "NATIONAL_GREENING%", "GREENING%"];
    case "SIFMA":
      return ["SIFMA%"];
    case "FIRE":
      return ["FIRE%", "HOTSPOT%", "INCIDENT%"];
    default:
      return ["%"];
  }
}

/* ---------------- field aliases (important) ---------------- */

function fieldAlternatives(dataset: DatasetKey, field: string): string[] {
  const f0 = canonicalFieldName(field);
  if (!f0) return [];
  if (dataset !== "CBFMA") return [f0];

  // Add aliases you saw in real data: PO_ADD/ADD_PO, LC_NO, etc.
  const map: Record<string, string[]> = {
    // watershed
    NAME_WS: ["NAME_WS", "W_NAME"],
    W_NAME: ["W_NAME", "NAME_WS"],

    // PO name
    NAME_PO: ["NAME_PO", "PO_NAME"],
    PO_NAME: ["PO_NAME", "NAME_PO"],

    // address / municipality hints
    ADD_PO: ["ADD_PO", "PO_ADD"],
    PO_ADD: ["PO_ADD", "ADD_PO"],

    // registration / codes (your samples show both REG_NO and LC_NO)
    REG_NUMBER: ["REG_NUMBER", "REG_NO", "LC_NO", "CBFMA_NO"],
    REG_NO: ["REG_NO", "REG_NUMBER", "LC_NO", "CBFMA_NO"],
    LC_NO: ["LC_NO", "REG_NO", "REG_NUMBER", "CBFMA_NO"],
    CBFMA_NO: ["CBFMA_NO", "REG_NO", "REG_NUMBER", "LC_NO"],

    // dates
    REG_DTE: ["REG_DTE", "REG_DATE"],
    REG_DATE: ["REG_DATE", "REG_DTE"],

    // surveys
    YR_SURV: ["YR_SURV", "YR_SRV"],
    YR_SRV: ["YR_SRV", "YR_SURV"],

    // admin fields
    REMARKS: ["REMARKS"],
    REGION: ["REGION"],
    PENRO: ["PENRO"],
    CENRO: ["CENRO"],
    PSGC: ["PSGC"],
    TENURE: ["TENURE"],

    // optional dataset fields
    MUNI_CITY: ["MUNI_CITY", "MUNICIPALITY", "MUNI", "ADD_PO", "PO_ADD"],
  };

  return map[f0] ?? [f0];
}

/* ---------------- keyword search fallback ---------------- */

function keywordFieldsFor(dataset: DatasetKey) {
  if (dataset === "CBFMA") {
    return [
      "MUNI_CITY",
      "ADD_PO",
      "PO_ADD",
      "NAME_PO",
      "PO_NAME",
      "W_NAME",
      "NAME_WS",
      "PENRO",
      "CENRO",
      "REGION",
      "REMARKS",
      "REG_NO",
      "LC_NO",
      "CBFMA_NO",
      "PSGC",
      "TENURE",
    ];
  }
  return ["NAME", "REMARKS", "LOCATION"];
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

// Split raw query into AND tokens (space/and/&, commas) and OR groups (" or ")
function parseQuery(raw: string) {
  const s = normalizeValue(raw);

  // OR groups: "aparri or alcala"
  const orParts = s
    .split(/\s+\bor\b\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);

  // Each OR part becomes AND tokens
  const groups = orParts.map((part) => {
    const tokens = part
      .split(/,|;|\s+\band\b\s+|&/i)
      .map((x) => x.trim())
      .filter(Boolean)
      // Avoid ultra-short noise tokens (still allow "ii" region etc)
      .filter((t) => t.length >= 2);

    return tokens;
  });

  return groups.filter((g) => g.length > 0);
}

/* ---------------- SQL builder ---------------- */

function buildFilterClauseWithAliases(dataset: DatasetKey, f: Filter, pStart: number) {
  const allowedOps = new Set<Op>(["=", "!=", "<", ">", "<=", ">=", "ilike"]);
  if (!f?.field || !allowedOps.has(f.op)) return null;

  const op = f.op;
  const value = f.value;

  // ✅ keyword fallback: OR across many useful fields (one token)
  if (canonicalFieldName(f.field) === "__KEYWORD" && typeof value === "string") {
    const normVal = normalizeValue(value);
    const like = normVal.includes("%") ? normVal : `%${normVal}%`;

    const fields = uniq(
      keywordFieldsFor(dataset)
        .flatMap((k) => fieldAlternatives(dataset, k))
        .filter(isSafeFieldName)
    );

    const clauses: string[] = [];
    const params: any[] = [];
    let p = pStart;

    for (const field of fields) {
      const left = normalizeTextSql(`(props->>$${p})`);
      clauses.push(`${left} LIKE $${p + 1}`);
      params.push(field, like);
      p += 2;
    }

    if (!clauses.length) return null;
    return { clauseSql: `(${clauses.join(" OR ")})`, params, next: p };
  }

  const fields = uniq(fieldAlternatives(dataset, String(f.field)).filter(isSafeFieldName));
  if (!fields.length) return null;

  const perFieldClauses: string[] = [];
  const params: any[] = [];
  let p = pStart;

  for (const field of fields) {
    // text comparisons
    if (typeof value === "string" && (op === "=" || op === "!=" || op === "ilike")) {
      const normVal = normalizeValue(value);
      const left = normalizeTextSql(`(props->>$${p})`);

      if (op === "ilike") {
        const like = normVal.includes("%") ? normVal : `%${normVal}%`;
        perFieldClauses.push(`${left} LIKE $${p + 1}`);
        params.push(field, like);
        p += 2;
        continue;
      }

      if (op === "=") {
        perFieldClauses.push(`${left} = $${p + 1}`);
        params.push(field, normVal);
        p += 2;
        continue;
      }

      if (op === "!=") {
        perFieldClauses.push(`${left} <> $${p + 1}`);
        params.push(field, normVal);
        p += 2;
        continue;
      }
    }

    // numeric
    if (typeof value === "number" || isLikelyNumberField(field)) {
      perFieldClauses.push(`(NULLIF(props->>$${p}, '')::double precision) ${op} $${p + 1}`);
      params.push(field, Number(value));
      p += 2;
      continue;
    }

    // date
    if (isLikelyDateField(field)) {
      perFieldClauses.push(`(NULLIF(props->>$${p}, '')::date) ${op} $${p + 1}::date`);
      params.push(field, String(value));
      p += 2;
      continue;
    }

    // boolean
    if (typeof value === "boolean") {
      perFieldClauses.push(`(LOWER(props->>$${p})) ${op} $${p + 1}`);
      params.push(field, String(value).toLowerCase());
      p += 2;
      continue;
    }

    // fallback exact
    perFieldClauses.push(`(props->>$${p}) ${op} $${p + 1}`);
    params.push(field, String(value));
    p += 2;
  }

  if (!perFieldClauses.length) return null;

  const clauseSql =
    perFieldClauses.length === 1 ? perFieldClauses[0] : `(${perFieldClauses.join(" OR ")})`;

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

    const patterns = datasetPatterns(plan.layerName);

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
      return NextResponse.json(
        { ok: false, error: `No layers matched dataset: ${plan.layerName}` },
        { status: 404 }
      );
    }

    const layerIds = layerRes.rows.map((r) => r.id as string);
    const layerPicked = layerRes.rows.map((r) => r.name as string);

    const hasFilters =
      (Array.isArray(plan.filters) && plan.filters.length > 0) ||
      (Array.isArray(plan.anyOf) && plan.anyOf.length > 0);

    const effectivePlan: Plan = {
      ...plan,
      layerName: plan.layerName,
      filters: Array.isArray(plan.filters) ? [...plan.filters] : [],
      anyOf: Array.isArray(plan.anyOf) ? plan.anyOf : undefined,
      limit: Number.isFinite(Number(plan.limit)) ? Number(plan.limit) : 200,
    };

    // ✅ BEST fallback:
    // If AI gives no filters, we build a strong search from the raw query:
    // - support OR using "or"
    // - support AND using "and"/commas/&
    if (!hasFilters && rawQuery) {
      const groups = parseQuery(rawQuery);

      if (groups.length > 1) {
        // OR across groups, AND inside group
        effectivePlan.anyOf = groups.map((tokens) =>
          tokens.map((t) => ({ field: "__keyword", op: "ilike" as Op, value: t }))
        );
      } else if (groups.length === 1) {
        // Single group: AND tokens
        for (const t of groups[0]) {
          effectivePlan.filters.push({ field: "__keyword", op: "ilike", value: t });
        }
      } else {
        // fallback single token
        effectivePlan.filters.push({ field: "__keyword", op: "ilike", value: rawQuery });
      }

      if (!Number.isFinite(Number(effectivePlan.limit)) || effectivePlan.limit <= 0) {
        effectivePlan.limit = 200;
      }
    }

    const clauses: string[] = [`layer_id = ANY($1)`];
    const params: any[] = [layerIds];
    let p = 2;

    // AND filters
    for (const f of effectivePlan.filters || []) {
      const built = buildFilterClauseWithAliases(effectivePlan.layerName, f, p);
      if (!built) continue;
      clauses.push(built.clauseSql);
      params.push(...built.params);
      p = built.next;
    }

    // anyOf OR groups
    if (Array.isArray(effectivePlan.anyOf) && effectivePlan.anyOf.length > 0) {
      const orGroups: string[] = [];

      for (const group of effectivePlan.anyOf) {
        const groupClauses: string[] = [];
        let gp = p;
        const gpParams: any[] = [];

        for (const f of group || []) {
          const built = buildFilterClauseWithAliases(effectivePlan.layerName, f, gp);
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

    // ORDER BY (alias-safe)
    let orderSql = "";
    if (effectivePlan.orderBy?.field && limit > 0) {
      const requested = effectivePlan.orderBy.field;
      const dir = effectivePlan.orderBy.direction === "desc" ? "DESC" : "ASC";

      const alts = fieldAlternatives(effectivePlan.layerName, requested).filter(isSafeFieldName);
      const f = alts[0];

      if (f) {
        if (isLikelyNumberField(f)) {
          orderSql = `ORDER BY (NULLIF(props->>'${f}','')::double precision) ${dir} NULLS LAST`;
        } else if (isLikelyDateField(f)) {
          orderSql = `ORDER BY (NULLIF(props->>'${f}','')::date) ${dir} NULLS LAST`;
        } else {
          orderSql = `ORDER BY ${normalizeTextSql(`(props->>'${f}')`)} ${dir} NULLS LAST`;
        }
      }
    }

    // AGGREGATE MODE
    if (effectivePlan.aggregate) {
      const t = effectivePlan.aggregate.type;

      if (t === "count") {
        const q = await pool.query(
          `SELECT COUNT(*)::int AS value FROM public.features WHERE ${clauses.join(" AND ")}`,
          params
        );
        return NextResponse.json({
          ok: true,
          layerPicked,
          stats: { aggregate: effectivePlan.aggregate, value: q.rows[0]?.value ?? 0 },
          geojson: { type: "FeatureCollection", features: [] },
        });
      }

      const field = effectivePlan.aggregate.field;
      if (!field || !isSafeFieldName(canonicalFieldName(field))) {
        return NextResponse.json(
          { ok: false, error: "aggregate.field is required and must be safe." },
          { status: 400 }
        );
      }

      const safeField = canonicalFieldName(field);

      const q = await pool.query(
        `
        SELECT ${t.toUpperCase()}(NULLIF(props->>'${safeField}','')::double precision) AS value
        FROM public.features
        WHERE ${clauses.join(" AND ")}
        `,
        params
      );

      return NextResponse.json({
        ok: true,
        layerPicked,
        stats: { aggregate: effectivePlan.aggregate, value: q.rows[0]?.value ?? null },
        geojson: { type: "FeatureCollection", features: [] },
      });
    }

    // FEATURES MODE
    const sql = `
      WITH filtered AS (
        SELECT geom, props
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
              'geometry', ST_AsGeoJSON(geom)::jsonb,
              'properties', props
            )
          ),
          '[]'::jsonb
        )
      ) AS geojson
      FROM filtered;
    `;

    const r = await pool.query(sql, params);
    const gj = r.rows?.[0]?.geojson ?? { type: "FeatureCollection", features: [] };
    const featureCount = Array.isArray(gj?.features) ? gj.features.length : 0;

    return NextResponse.json({
      ok: true,
      layerPicked,
      stats: { featureCount },
      geojson: gj,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}
