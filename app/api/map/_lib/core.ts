import { pool } from "@/lib/db";

export type DatasetKey = "CBFMA" | "PA" | "NGP" | "SIFMA" | "FIRE" | "UNKNOWN";

/** intent flags that can apply to any dataset */
export type IntentFlags = {
  smallest?: boolean;
  largest?: boolean;
  renewal?: boolean;
};

export type ParsedQuery =
  | ({ mode: "field"; field: string; value: string } & IntentFlags)
  | ({ mode: "layer"; layerName: string } & IntentFlags)
  | ({ mode: "keyword"; keyword: string } & IntentFlags);

export function normalizeText(s: string) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-`~()\\[\]"'’]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Remove filler words:
 * - "show me the cbfma of cenro alcala" -> "cbfma cenro alcala"
 * - "cbfma that is for renewal" -> "cbfma for renewal"
 */
export function stripFillerWords(message: string) {
  const s = normalizeText(message);

  return s
    .replace(
      /\b(show|display|list|find|search|get|give|provide|tell|please|pls|kindly|can|could|would|will|want|need|like|i|im|i'm|me|we|us|our|my|your|that|this|it|is|are|was|were|which)\b/g,
      " "
    )
    .replace(/\b(of|in|at|within|near|from|on|the|a|an|to)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------- intent detection ---------------- */

export function wantsSmallest(raw: string) {
  const s = normalizeText(raw);
  return /\bsmallest\b|\bminimum\b|\blowest\b|\bmin\b/.test(s);
}

export function wantsLargest(raw: string) {
  const s = normalizeText(raw);
  return /\blargest\b|\bmaximum\b|\bhighest\b|\bmax\b|\bbiggest\b/.test(s);
}

export function wantsRenewal(raw: string) {
  const s = normalizeText(raw);
  return /\bfor\s+renewal\b|\brenewal\b|\brenew\b/.test(s);
}

export function stripIntentWords(cleaned: string) {
  return cleaned
    .replace(/\bfor\s+renewal\b/g, " ")
    .replace(/\brenewal\b/g, " ")
    .replace(/\brenew\b/g, " ")
    .replace(/\bsmallest\b|\bminimum\b|\blowest\b|\bmin\b/g, " ")
    .replace(/\blargest\b|\bmaximum\b|\bhighest\b|\bmax\b|\bbiggest\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractAfterKeyword(cleaned: string, key: string) {
  const idx = cleaned.indexOf(key);
  if (idx === -1) return null;

  const after = cleaned.slice(idx + key.length).trim();
  if (!after) return null;

  const stop = after.match(
    /\b(cenro|penro|muni_city|municipality|barangay|po_alias|pa_alias|alias|acronym|name_of_pa|name|province|region|type|remarks|po)\b/
  );
  const val = stop ? after.slice(0, stop.index).trim() : after.trim();
  return val || null;
}

export function makeNormalized(dataset: DatasetKey, base: string, flags: IntentFlags) {
  const parts = [dataset.toLowerCase(), base].filter(Boolean);
  if (flags.renewal) parts.push("for renewal");
  if (flags.smallest) parts.push("smallest");
  if (flags.largest) parts.push("largest");
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export async function resolveLayerExists(layerName: string) {
  const r = await pool.query(`select id, name from layers where name = $1 limit 1`, [layerName]);
  return r.rows[0] ?? null;
}

function geojsonBuildSql(tolerance: number) {
  return `
    jsonb_build_object(
      'type','FeatureCollection',
      'features', coalesce(jsonb_agg(
        jsonb_build_object(
          'type','Feature',
          'id', f.id,
          'geometry', st_asgeojson(st_simplifypreservetopology(f.geom, ${tolerance}))::jsonb,
          'properties', f.props
        )
      ), '[]'::jsonb)
    )
  `.trim();
}

/** safe numeric parse for smallest/largest ordering */
function areaOrderExprSql() {
  return `
    NULLIF(
      regexp_replace(
        coalesce(
          f.props->>'AREA_HA',
          f.props->>'HECTARES',
          f.props->>'HECTARE',
          f.props->>'AREA',
          ''
        ),
        '[^0-9\\.]',
        '',
        'g'
      ),
      ''
    )::double precision
  `.trim();
}

/** word-splitting match across ALL props_text */
function keywordMatchSql() {
  return `
    (
      select bool_and(f.props_text like ('%' || t || '%'))
      from unnest(string_to_array(lower($2), ' ')) as t
      where t <> ''
    )
  `.trim();
}

/**
 * Shared DB search runner.
 * - parsed.field is validated by you in each dataset parser (whitelist!)
 */
export async function searchDatasetGeoJSON(args: {
  dataset: DatasetKey;
  parsed: ParsedQuery;
  limit?: number;
  simplifyTolerance?: number;
  /** optional: dataset-specific extra WHERE clause for renewal, etc. */
  extraWhereSql?: string;
}) {
  const { dataset, parsed } = args;

  const baseLimit = Math.min(Math.max(Number(args.limit ?? 500), 1), 2000);
  const tol = Number(args.simplifyTolerance ?? 0.00005);

  const wantsSmall = !!parsed.smallest;
  const wantsLarge = !!parsed.largest;

  const finalLimit = wantsSmall || wantsLarge ? 1 : baseLimit;

  const orderBy =
    wantsSmall
      ? `ORDER BY ${areaOrderExprSql()} ASC NULLS LAST`
      : wantsLarge
      ? `ORDER BY ${areaOrderExprSql()} DESC NULLS LAST`
      : "";

  // NOTE: you can pass extraWhereSql from dataset modules (ex: renewal)
  const extraWhere = args.extraWhereSql ? `\n${args.extraWhereSql}\n` : "\n";

  if (parsed.mode === "layer") {
    const layer = await resolveLayerExists(parsed.layerName);
    if (!layer) {
      const keyword = parsed.layerName.split("_").slice(1).join("_");
      return searchDatasetGeoJSON({
        dataset,
        parsed: { mode: "keyword", keyword, smallest: wantsSmall, largest: wantsLarge, renewal: !!parsed.renewal },
        limit: baseLimit,
        simplifyTolerance: tol,
        extraWhereSql: args.extraWhereSql,
      });
    }

    const r = await pool.query(
      `
      select ${geojsonBuildSql(tol)} as geojson
      from (
        select f.id, f.geom, f.props
        from features f
        join layers l on l.id = f.layer_id
        where l.name = $1
        ${extraWhere}
        ${orderBy}
        limit $2
      ) f
      `,
      [layer.name, finalLimit]
    );

    return { mode: "layer" as const, layer: layer.name, geojson: r.rows[0]?.geojson ?? { type: "FeatureCollection", features: [] } };
  }

  if (parsed.mode === "field") {
    const r = await pool.query(
      `
      select ${geojsonBuildSql(tol)} as geojson
      from (
        select f.id, f.geom, f.props
        from features f
        join layers l on l.id = f.layer_id
        where split_part(l.name,'_',1) = $1
          and lower(coalesce(f.props->>$2,'')) = lower($3)
        ${extraWhere}
        ${orderBy}
        limit $4
      ) f
      `,
      [dataset, parsed.field, parsed.value, finalLimit]
    );

    return { mode: "field" as const, filter: parsed, geojson: r.rows[0]?.geojson ?? { type: "FeatureCollection", features: [] } };
  }

  const r = await pool.query(
    `
    select ${geojsonBuildSql(tol)} as geojson
    from (
      select f.id, f.geom, f.props
      from features f
      join layers l on l.id = f.layer_id
      where split_part(l.name,'_',1) = $1
        and ${keywordMatchSql()}
      ${extraWhere}
      ${orderBy}
      limit $3
    ) f
    `,
    [dataset, parsed.keyword, finalLimit]
  );

  return { mode: "keyword" as const, keyword: parsed.keyword, geojson: r.rows[0]?.geojson ?? { type: "FeatureCollection", features: [] } };
}
