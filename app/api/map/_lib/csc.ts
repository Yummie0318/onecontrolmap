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
  
  /**
   * CSC fields (from your attribute tables)
   * NOTE: CSC number field name varies across layers (CSC_Number / CSC_NUMBER / CSC_No).
   * Because searchDatasetGeoJSON field mode matches one exact field name,
   * we handle CSC number via KEYWORD mode so it matches across any field.
   */
  export type CscField =
    | "REGION"
    | "PENRO"
    | "DISTRICT"
    | "CENRO"
    | "MUNI_CITY"
    | "BARANGAY"
    | "PSGC"
    | "STATUS"
    | "TENURE"
    | "WATERSHED"
    | "LC_NO"
    | "CONT_PERS"
    | "NAME_CSC"
    | "HOLD_ADD"
    | "YR_ASSESS"
    | "REMARKS"
    | "NAME";
  
  function extraRenewalWhere(renewal: boolean) {
    // You have STATUS + REMARKS; renewal often appears in either.
    return renewal
      ? `AND (lower(coalesce(f.props->>'REMARKS','')) LIKE '%renewal%' OR lower(coalesce(f.props->>'STATUS','')) LIKE '%renewal%')`
      : "";
  }
  
  /** Handle "csc number 123" / "csc no 123" robustly (keyword mode to survive field-name differences) */
  function tryParseCscNumber(cleaned: string) {
    // common patterns:
    // "csc 123", "csc number 123", "csc_no 123", "csc number: 123-ABC"
    const m =
      cleaned.match(/\bcsc(?:\s*number|\s*no|_number|_no)?\s+([a-z0-9\-\/]+)\b/i) ||
      cleaned.match(/\bcsc(?:\s*number|\s*no|_number|_no)?\s*[:#]\s*([a-z0-9\-\/]+)\b/i);
  
    const v = m?.[1]?.trim();
    if (!v) return null;
    return v;
  }
  
  export function parseCscMessage(message: string): {
    normalized: string;
    parsed: ParsedQuery;
    extraWhereSql?: string;
  } {
    const dataset: DatasetKey = "CSC";
  
    const smallest = wantsSmallest(message);
    const largest = wantsLargest(message);
    const renewal = wantsRenewal(message);
    const flags: IntentFlags = { smallest, largest, renewal };
  
    let cleaned = stripFillerWords(message);
    cleaned = stripIntentWords(cleaned);
  
    // Structured fields
    if (cleaned.includes("region")) {
      const v = extractAfterKeyword(cleaned, "region");
      if (v)
        return {
          normalized: makeNormalized(dataset, `region ${v}`, flags),
          parsed: { mode: "field", field: "REGION", value: v, ...flags },
          extraWhereSql: extraRenewalWhere(renewal),
        };
    }
  
    if (cleaned.includes("penro")) {
      const v = extractAfterKeyword(cleaned, "penro");
      if (v)
        return {
          normalized: makeNormalized(dataset, `penro ${v}`, flags),
          parsed: { mode: "field", field: "PENRO", value: v, ...flags },
          extraWhereSql: extraRenewalWhere(renewal),
        };
    }
  
    if (cleaned.includes("district")) {
      const v = extractAfterKeyword(cleaned, "district");
      if (v)
        return {
          normalized: makeNormalized(dataset, `district ${v}`, flags),
          parsed: { mode: "field", field: "DISTRICT", value: v, ...flags },
          extraWhereSql: extraRenewalWhere(renewal),
        };
    }
  
    if (cleaned.includes("cenro")) {
      const v = extractAfterKeyword(cleaned, "cenro");
      if (v)
        return {
          normalized: makeNormalized(dataset, `cenro ${v}`, flags),
          parsed: { mode: "field", field: "CENRO", value: v, ...flags },
          extraWhereSql: extraRenewalWhere(renewal),
        };
    }
  
    if (cleaned.includes("muni_city") || cleaned.includes("municipality") || cleaned.includes("muni") || cleaned.includes("city")) {
      const key = cleaned.includes("muni_city")
        ? "muni_city"
        : cleaned.includes("municipality")
        ? "municipality"
        : cleaned.includes("muni")
        ? "muni"
        : "city";
  
      const v = extractAfterKeyword(cleaned, key);
      if (v)
        return {
          normalized: makeNormalized(dataset, `muni_city ${v}`, flags),
          parsed: { mode: "field", field: "MUNI_CITY", value: v, ...flags },
          extraWhereSql: extraRenewalWhere(renewal),
        };
    }
  
    if (cleaned.includes("barangay")) {
      const v = extractAfterKeyword(cleaned, "barangay");
      if (v)
        return {
          normalized: makeNormalized(dataset, `barangay ${v}`, flags),
          parsed: { mode: "field", field: "BARANGAY", value: v, ...flags },
          extraWhereSql: extraRenewalWhere(renewal),
        };
    }
  
    if (cleaned.includes("psgc")) {
      const v = extractAfterKeyword(cleaned, "psgc");
      if (v)
        return {
          normalized: makeNormalized(dataset, `psgc ${v}`, flags),
          parsed: { mode: "field", field: "PSGC", value: v, ...flags },
          extraWhereSql: extraRenewalWhere(renewal),
        };
    }
  
    if (cleaned.includes("status")) {
      const v = extractAfterKeyword(cleaned, "status");
      if (v)
        return {
          normalized: makeNormalized(dataset, `status ${v}`, flags),
          parsed: { mode: "field", field: "STATUS", value: v, ...flags },
          extraWhereSql: extraRenewalWhere(renewal),
        };
    }
  
    if (cleaned.includes("tenure")) {
      const v = extractAfterKeyword(cleaned, "tenure");
      if (v)
        return {
          normalized: makeNormalized(dataset, `tenure ${v}`, flags),
          parsed: { mode: "field", field: "TENURE", value: v, ...flags },
          extraWhereSql: extraRenewalWhere(renewal),
        };
    }
  
    if (cleaned.includes("watershed")) {
      const v = extractAfterKeyword(cleaned, "watershed");
      if (v)
        return {
          normalized: makeNormalized(dataset, `watershed ${v}`, flags),
          parsed: { mode: "field", field: "WATERSHED", value: v, ...flags },
          extraWhereSql: extraRenewalWhere(renewal),
        };
    }
  
    if (cleaned.includes("lc_no") || cleaned.includes("lc")) {
      const key = cleaned.includes("lc_no") ? "lc_no" : "lc";
      const v = extractAfterKeyword(cleaned, key);
      if (v)
        return {
          normalized: makeNormalized(dataset, `lc_no ${v}`, flags),
          parsed: { mode: "field", field: "LC_NO", value: v, ...flags },
          extraWhereSql: extraRenewalWhere(renewal),
        };
    }
  
    if (cleaned.includes("cont_pers") || cleaned.includes("contact")) {
      const key = cleaned.includes("cont_pers") ? "cont_pers" : "contact";
      const v = extractAfterKeyword(cleaned, key);
      if (v)
        return {
          normalized: makeNormalized(dataset, `cont_pers ${v}`, flags),
          parsed: { mode: "field", field: "CONT_PERS", value: v, ...flags },
          extraWhereSql: extraRenewalWhere(renewal),
        };
    }
  
    if (cleaned.includes("name_csc")) {
      const v = extractAfterKeyword(cleaned, "name_csc");
      if (v)
        return {
          normalized: makeNormalized(dataset, `name_csc ${v}`, flags),
          parsed: { mode: "field", field: "NAME_CSC", value: v, ...flags },
          extraWhereSql: extraRenewalWhere(renewal),
        };
    }
  
    if (cleaned.includes("hold_add") || cleaned.includes("address")) {
      const key = cleaned.includes("hold_add") ? "hold_add" : "address";
      const v = extractAfterKeyword(cleaned, key);
      if (v)
        return {
          normalized: makeNormalized(dataset, `hold_add ${v}`, flags),
          parsed: { mode: "field", field: "HOLD_ADD", value: v, ...flags },
          extraWhereSql: extraRenewalWhere(renewal),
        };
    }
  
    if (cleaned.includes("yr_assess") || cleaned.includes("year")) {
      const key = cleaned.includes("yr_assess") ? "yr_assess" : "year";
      const v = extractAfterKeyword(cleaned, key);
      if (v)
        return {
          normalized: makeNormalized(dataset, `yr_assess ${v}`, flags),
          parsed: { mode: "field", field: "YR_ASSESS", value: v, ...flags },
          extraWhereSql: extraRenewalWhere(renewal),
        };
    }
  
    if (cleaned.includes("remarks")) {
      const v = extractAfterKeyword(cleaned, "remarks");
      if (v)
        return {
          normalized: makeNormalized(dataset, `remarks ${v}`, flags),
          parsed: { mode: "field", field: "REMARKS", value: v, ...flags },
          extraWhereSql: extraRenewalWhere(renewal),
        };
    }
  
    // ✅ CSC number: keyword mode (handles CSC_Number / CSC_NUMBER / CSC_No differences)
    const cscNo = tryParseCscNumber(cleaned);
    if (cscNo) {
      return {
        normalized: makeNormalized(dataset, `csc_number ${cscNo}`, flags),
        parsed: { mode: "keyword", keyword: cscNo, ...flags },
        extraWhereSql: extraRenewalWhere(renewal),
      };
    }
  
    // Layer mode: "csc alcala" -> CSC_Alcala
    const t = cleaned.split(" ").filter(Boolean);
    const dsToken = dataset.toLowerCase();
    const dsRemoved = t.filter((x) => x !== dsToken);
  
    const hasOtherKeywords = dsRemoved.some((x) =>
      [
        "region",
        "penro",
        "district",
        "cenro",
        "muni_city",
        "municipality",
        "muni",
        "city",
        "barangay",
        "psgc",
        "status",
        "tenure",
        "watershed",
        "lc_no",
        "lc",
        "cont_pers",
        "contact",
        "name_csc",
        "hold_add",
        "address",
        "remarks",
        "yr_assess",
        "year",
        "csc",
        "csc_number",
        "csc_no",
      ].includes(x)
    );
  
    if (!hasOtherKeywords && dsRemoved.length === 1) {
      const area = dsRemoved[0];
      const layerName = `${dataset}_${area.charAt(0).toUpperCase()}${area.slice(1)}`;
      return {
        normalized: makeNormalized(dataset, area, flags),
        parsed: { mode: "layer", layerName, ...flags },
        extraWhereSql: extraRenewalWhere(renewal),
      };
    }
  
    // Keyword fallback
    const kw = dsRemoved.join(" ").trim() || cleaned;
  
    return {
      normalized: makeNormalized(dataset, kw, flags),
      parsed: { mode: "keyword", keyword: kw || normalizeText(message), ...flags },
      extraWhereSql: extraRenewalWhere(renewal),
    };
  }
  