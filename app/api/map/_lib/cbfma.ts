import {
    DatasetKey,
    IntentFlags,
    ParsedQuery,
    extractAfterKeyword,
    makeNormalized,
    normalizeText,
    stripFillerWords,
    stripIntentWords,
    wantsLargest,
    wantsRenewal,
    wantsSmallest,
  } from "./core";
  
  export type CbfmaField = "CENRO" | "PENRO" | "MUNI_CITY" | "BARANGAY" | "PO_ALIAS" | "REMARKS";
  
  export function parseCbfmaMessage(message: string): { normalized: string; parsed: ParsedQuery; extraWhereSql?: string } {
    const dataset: DatasetKey = "CBFMA";
    const smallest = wantsSmallest(message);
    const largest = wantsLargest(message);
    const renewal = wantsRenewal(message);
    const flags: IntentFlags = { smallest, largest, renewal };
  
    let cleaned = stripFillerWords(message);
    cleaned = stripIntentWords(cleaned);
  
    // fields
    if (cleaned.includes("cenro")) {
      const v = extractAfterKeyword(cleaned, "cenro");
      if (v) return { normalized: makeNormalized(dataset, `cenro ${v}`, flags), parsed: { mode: "field", field: "CENRO", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
  
    if (cleaned.includes("penro")) {
      const v = extractAfterKeyword(cleaned, "penro");
      if (v) return { normalized: makeNormalized(dataset, `penro ${v}`, flags), parsed: { mode: "field", field: "PENRO", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
  
    if (cleaned.includes("muni_city") || cleaned.includes("municipality") || cleaned.includes("city") || cleaned.includes("muni")) {
      const key = cleaned.includes("muni_city") ? "muni_city" : cleaned.includes("municipality") ? "municipality" : cleaned.includes("muni") ? "muni" : "city";
      const v = extractAfterKeyword(cleaned, key);
      if (v) return { normalized: makeNormalized(dataset, `muni_city ${v}`, flags), parsed: { mode: "field", field: "MUNI_CITY", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
  
    if (cleaned.includes("barangay")) {
      const v = extractAfterKeyword(cleaned, "barangay");
      if (v) return { normalized: makeNormalized(dataset, `barangay ${v}`, flags), parsed: { mode: "field", field: "BARANGAY", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
  
    // alias for CBFMA
    if (cleaned.includes("po_alias")) {
      const v = extractAfterKeyword(cleaned, "po_alias");
      if (v) return { normalized: makeNormalized(dataset, `po_alias ${v}`, flags), parsed: { mode: "field", field: "PO_ALIAS", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
    if (cleaned.includes("alias")) {
      const v = extractAfterKeyword(cleaned, "alias");
      if (v) return { normalized: makeNormalized(dataset, `po_alias ${v}`, flags), parsed: { mode: "field", field: "PO_ALIAS", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
    if (cleaned.includes("po")) {
      const v = extractAfterKeyword(cleaned, "po");
      if (v) return { normalized: makeNormalized(dataset, `po_alias ${v}`, flags), parsed: { mode: "field", field: "PO_ALIAS", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
  
    // layer mode (cbfma + single token)
    const t = cleaned.split(" ").filter(Boolean);
    const dsToken = dataset.toLowerCase();
    const dsRemoved = t.filter((x) => x !== dsToken && x !== "cbfm" && x !== "tenure");
    const hasOtherKeywords = dsRemoved.some((x) => ["cenro", "penro", "barangay", "muni_city", "municipality", "alias", "po_alias", "po"].includes(x));
  
    if (!hasOtherKeywords && dsRemoved.length === 1) {
      const area = dsRemoved[0];
      const layerName = `${dataset}_${area.charAt(0).toUpperCase()}${area.slice(1)}`;
      return {
        normalized: makeNormalized(dataset, area, flags),
        parsed: { mode: "layer", layerName, ...flags },
        extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "",
      };
    }
  
    // keyword fallback (global)
    const kw = dsRemoved.join(" ").trim() || cleaned;
    return {
      normalized: makeNormalized(dataset, kw, flags),
      parsed: { mode: "keyword", keyword: kw || normalizeText(message), ...flags },
      extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "",
    };
  }
  