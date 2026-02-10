import { DatasetKey, normalizeText, searchDatasetGeoJSON } from "./core";
import { parseCbfmaMessage } from "./cbfma";
import { parsePaMessage } from "./pa";
import { parseCscMessage } from "./csc";

/** keep your old function name */
export function detectDataset(message: string): DatasetKey {
  const t = normalizeText(message);

  // explicit dataset words
  if (/\bcbfma\b|\bcbfm\b|\btenure\b/.test(t)) return "CBFMA";
  if (/\bcsc\b|\bcsc_number\b|\bcsc_no\b|\bcsc\s*number\b|\bcsc\s*no\b|\bcommunity\s*stewardship\b|\bstewardship\s*contract\b/.test(t))
    return "CSC";
  if (/\bpa\b|\bprotected\s*area(s)?\b|\bprotectedarea(s)?\b|\bnipas\b/.test(t)) return "PA";
  if (/\bngp\b|\bnational\s*greening\b/.test(t)) return "NGP";
  if (/\bsifma\b/.test(t)) return "SIFMA";
  if (/\bfire\b/.test(t)) return "FIRE";

  // acronym-only => PA
  const PA_ACRONYMS = new Set(["pipls", "ppls", "mpl", "bwfr", "wwfr"]);
  const tokens = t.split(" ").filter(Boolean);
  if (tokens.length === 1 && PA_ACRONYMS.has(tokens[0])) return "PA";

  if (t.includes("protected are")) return "PA";

  return "UNKNOWN";
}

/**
 * dataset-aware parser (routes can keep calling this)
 * NOTE: returns extraWhereSql too
 */
export function parseUserMessageToQuery(dataset: DatasetKey, message: string) {
  if (dataset === "CBFMA") return parseCbfmaMessage(message);
  if (dataset === "PA") return parsePaMessage(message);
  if (dataset === "CSC") return parseCscMessage(message);

  // fallback: keyword-only
  const cleaned = normalizeText(message);
  return {
    normalized: `${dataset.toLowerCase()} ${cleaned}`.trim(),
    parsed: { mode: "keyword" as const, keyword: cleaned },
    extraWhereSql: "",
  };
}

export { searchDatasetGeoJSON };
