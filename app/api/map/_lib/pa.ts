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
  
  const PA_ACRONYMS = new Set(["pipls", "ppls", "mpl", "bwfr", "wwfr"]);
  
  function stripPaNoiseTokens(kw: string) {
    const s = normalizeText(kw);
    const tokens = s.split(" ").filter(Boolean);
    const filtered = tokens.filter((t) => !["pa", "protected", "area", "areas", "protectedarea", "protectedareas", "nipas"].includes(t));
    return filtered.length ? filtered.join(" ") : s;
  }
  
  export function parsePaMessage(message: string): { normalized: string; parsed: ParsedQuery; extraWhereSql?: string } {
    const dataset: DatasetKey = "PA";
    const smallest = wantsSmallest(message);
    const largest = wantsLargest(message);
    const renewal = wantsRenewal(message);
    const flags: IntentFlags = { smallest, largest, renewal };
  
    let cleaned = stripFillerWords(message);
    cleaned = stripIntentWords(cleaned);
  
    // structured shared fields
    if (cleaned.includes("cenro")) {
      const v = extractAfterKeyword(cleaned, "cenro");
      if (v) return { normalized: makeNormalized(dataset, `cenro ${v}`, flags), parsed: { mode: "field", field: "CENRO", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
  
    if (cleaned.includes("penro")) {
      const v = extractAfterKeyword(cleaned, "penro");
      if (v) return { normalized: makeNormalized(dataset, `penro ${v}`, flags), parsed: { mode: "field", field: "PENRO", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
  
    if (cleaned.includes("province")) {
      const v = extractAfterKeyword(cleaned, "province");
      if (v) return { normalized: makeNormalized(dataset, `province ${v}`, flags), parsed: { mode: "field", field: "PROVINCE", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
  
    if (cleaned.includes("region")) {
      const v = extractAfterKeyword(cleaned, "region");
      if (v) return { normalized: makeNormalized(dataset, `region ${v}`, flags), parsed: { mode: "field", field: "REGION", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
  
    if (cleaned.includes("type")) {
      const v = extractAfterKeyword(cleaned, "type");
      if (v) return { normalized: makeNormalized(dataset, `type ${v}`, flags), parsed: { mode: "field", field: "TYPE", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
  
    // PA alias/acronym -> PA_ALIAS
    if (cleaned.includes("pa_alias")) {
      const v = extractAfterKeyword(cleaned, "pa_alias");
      if (v) return { normalized: makeNormalized(dataset, `pa_alias ${v}`, flags), parsed: { mode: "field", field: "PA_ALIAS", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
    if (cleaned.includes("acronym")) {
      const v = extractAfterKeyword(cleaned, "acronym");
      if (v) return { normalized: makeNormalized(dataset, `pa_alias ${v}`, flags), parsed: { mode: "field", field: "PA_ALIAS", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
    if (cleaned.includes("alias")) {
      const v = extractAfterKeyword(cleaned, "alias");
      if (v) return { normalized: makeNormalized(dataset, `pa_alias ${v}`, flags), parsed: { mode: "field", field: "PA_ALIAS", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
  
    // name -> NAME_OF_PA
    if (cleaned.includes("name_of_pa")) {
      const v = extractAfterKeyword(cleaned, "name_of_pa");
      if (v) return { normalized: makeNormalized(dataset, `name_of_pa ${v}`, flags), parsed: { mode: "field", field: "NAME_OF_PA", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
    if (cleaned.includes("name")) {
      const v = extractAfterKeyword(cleaned, "name");
      if (v) return { normalized: makeNormalized(dataset, `name_of_pa ${v}`, flags), parsed: { mode: "field", field: "NAME_OF_PA", value: v, ...flags }, extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "" };
    }
  
    // acronym-only query: "pipls" -> keyword "pipls" (but dataset will be detected as PA)
    const tokens = normalizeText(message).split(" ").filter(Boolean);
    if (tokens.length === 1 && PA_ACRONYMS.has(tokens[0])) {
      return {
        normalized: makeNormalized(dataset, tokens[0], flags),
        parsed: { mode: "keyword", keyword: tokens[0], ...flags },
        extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "",
      };
    }
  
    // layer mode if "pa alcala" style
    const t = cleaned.split(" ").filter(Boolean);
    const dsToken = dataset.toLowerCase();
    const dsRemoved = t.filter((x) => x !== dsToken);
  
    const hasOtherKeywords = dsRemoved.some((x) =>
      ["cenro", "penro", "province", "region", "type", "remarks", "pa_alias", "alias", "acronym", "name_of_pa", "name"].includes(x)
    );
  
    if (!hasOtherKeywords && dsRemoved.length === 1) {
      const area = dsRemoved[0];
      const layerName = `${dataset}_${area.charAt(0).toUpperCase()}${area.slice(1)}`;
      return {
        normalized: makeNormalized(dataset, area, flags),
        parsed: { mode: "layer", layerName, ...flags },
        extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "",
      };
    }
  
    // keyword fallback (strip "protected area" words)
    const kwRaw = dsRemoved.join(" ").trim() || cleaned;
    const kw = stripPaNoiseTokens(kwRaw);
  
    return {
      normalized: makeNormalized(dataset, kw, flags),
      parsed: { mode: "keyword", keyword: kw || normalizeText(message), ...flags },
      extraWhereSql: renewal ? `AND lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%'` : "",
    };
  }
  