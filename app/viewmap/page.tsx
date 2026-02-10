// C:\Users\Yummie03\Desktop\onemap\app\viewmap\page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ResultMap from "@/app/components/ResultMapClient";
import Image from "next/image";
import { faUserCircle, faUserShield, faGear } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLayerGroup,
  faRotateRight,
  faMagnifyingGlass,
  faXmark,
  faCheckSquare,
  faSquare,
  faEye,
  faEyeSlash,
  faArrowsRotate,
  faTable,
  faChevronDown,
  faPalette,
  faEraser,
} from "@fortawesome/free-solid-svg-icons";

type LayerRow = {
  id: string;
  name: string;
  source_filename: string | null;
  geom_type: string | null;
  srid: number | null;
  feature_count: number | null;
  created_at?: string | null;
};

type MapLayer = {
  id: string;
  name: string;
  geom_type: string | null;
  srid: number | null;
  visible: boolean;
  geojson: any | null;
  loading: boolean;
  error?: string;
};

/** default color (when no per-feature override) */
const DEFAULT_LAYER_COLOR = "#0b1220";
/** default color used by the table color picker */
const DEFAULT_TABLE_COLOR = "#d92d20"; // denr-ish red default

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text };
  }
}

function coerceFeatureCollection(payload: any): any | null {
  if (!payload) return null;
  if (payload?.type === "FeatureCollection") return payload;

  const candidates = [payload?.geojson, payload?.data, payload?.result, payload?.fc];
  for (const c of candidates) if (c?.type === "FeatureCollection") return c;

  let cur: any = payload;
  for (let i = 0; i < 6; i++) {
    if (!cur) break;
    if (cur?.type === "FeatureCollection") return cur;
    cur = cur.geojson ?? cur.data ?? cur.result ?? cur.fc ?? null;
  }
  return null;
}

function extractAttributesWithIds(fc: any): {
  columns: string[];
  rows: { __idx: number; __fid: string | number | null; [k: string]: any }[];
} {
  const features = Array.isArray(fc?.features) ? fc.features : [];

  const rows = features.map((f: any, idx: number) => {
    const props = f && typeof f === "object" ? f.properties ?? {} : {};
    const fid = (f && typeof f === "object" ? f.id ?? props?.__fid ?? null : null) as any;
    return { __idx: idx, __fid: fid ?? null, ...props };
  });

  const keySet = new Set<string>();
  keySet.add("__idx");
  keySet.add("__fid");
  for (const r of rows) for (const k of Object.keys(r)) keySet.add(k);

  const internal = ["__idx", "__fid"];
  const rest = Array.from(keySet)
    .filter((c) => !internal.includes(c))
    .sort((a, b) => a.localeCompare(b));

  return { columns: [...internal, ...rest], rows };
}

function stringifyCell(v: any) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** keep selected indices valid after reload */
function clampSelected(selected: Set<number>, maxExclusive: number) {
  const out = new Set<number>();
  for (const i of selected) if (Number.isFinite(i) && i >= 0 && i < maxExclusive) out.add(i);
  return out;
}

/** Loader ring */
function Ring({ size = 16 }: { size?: number }) {
  return <span className="ring" style={{ width: size, height: size }} aria-hidden="true" />;
}

/** Subtle shimmer block */
function Shimmer({ h = 14, w = "100%" }: { h?: number; w?: string }) {
  return <span className="shimmer" style={{ height: h, width: w }} aria-hidden="true" />;
}

/** small stable hash -> forces map redraw even if color-count doesn't change */
function hashString(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

export default function ViewMapPage() {
  const [layers, setLayers] = useState<MapLayer[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [booting, setBooting] = useState(true);

  const [search, setSearch] = useState("");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  // attribute table viewer state
  const [tableOpen, setTableOpen] = useState(false);
  const [tableLayerId, setTableLayerId] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");

  // selection per layer (indices) -> controls FILTERING (what is shown on map)
  const [selectedFeatureIdxByLayer, setSelectedFeatureIdxByLayer] = useState<Record<string, Set<number>>>({});

  // per-layer per-feature color overrides
  // key: layerId -> { [__idx]: "#rrggbb" }
  const [featureColorByLayer, setFeatureColorByLayer] = useState<Record<string, Record<number, string>>>({});

  // attribute-table color picker (bulk applies)
  const [tableColor, setTableColor] = useState(DEFAULT_TABLE_COLOR);

  const abortersRef = useRef<Record<string, AbortController>>({});
  const isFiltering = search.trim().length > 0;

  async function refreshList() {
    setLoadingList(true);
    try {
      const r = await fetch("/api/layers", { cache: "no-store" });
      const text = await r.text();
      const j: any = safeJsonParse(text);
      if (!j.ok) throw new Error(j.error || "Failed to load layers");

      const rows: LayerRow[] = j.layers || [];
      setLayers((prev) => {
        const prevById = new Map(prev.map((p) => [p.id, p]));
        return rows.map((row) => {
          const old = prevById.get(row.id);
          return {
            id: row.id,
            name: row.name,
            geom_type: row.geom_type,
            srid: row.srid,
            visible: old?.visible ?? false,
            geojson: old?.geojson ?? null,
            loading: old?.loading ?? false,
            error: old?.error,
          };
        });
      });
    } finally {
      setLoadingList(false);
      setBooting(false);
    }
  }

  async function loadGeojson(layerId: string) {
    abortersRef.current[layerId]?.abort();
    const ac = new AbortController();
    abortersRef.current[layerId] = ac;

    setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, loading: true, error: undefined } : l)));

    try {
      const r = await fetch(`/api/layers/${layerId}/geojson`, { cache: "no-store", signal: ac.signal });
      const text = await r.text();
      const j: any = safeJsonParse(text);
      if (j?.ok === false) throw new Error(j.error || "Failed to load GeoJSON");

      const fc = coerceFeatureCollection(j);
      if (!fc) throw new Error("API did not return a GeoJSON FeatureCollection.");

      setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, geojson: fc, loading: false } : l)));

      // keep selection valid after reload
      setSelectedFeatureIdxByLayer((prev) => {
        const cur = prev[layerId] ?? new Set<number>();
        const max = Array.isArray(fc?.features) ? fc.features.length : 0;
        return { ...prev, [layerId]: clampSelected(cur, max) };
      });

      // keep per-feature colors valid after reload
      setFeatureColorByLayer((prev) => {
        const cur = prev[layerId] ?? {};
        const max = Array.isArray(fc?.features) ? fc.features.length : 0;
        const next: Record<number, string> = {};
        for (const k of Object.keys(cur)) {
          const idx = Number(k);
          if (Number.isFinite(idx) && idx >= 0 && idx < max) next[idx] = cur[idx];
        }
        return { ...prev, [layerId]: next };
      });
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setLayers((prev) =>
        prev.map((l) => (l.id === layerId ? { ...l, loading: false, error: e?.message ?? "Failed to load" } : l))
      );
    }
  }

  async function toggleLayer(layerId: string, nextVisible: boolean) {
    setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, visible: nextVisible } : l)));
    if (nextVisible) {
      const cur = layers.find((l) => l.id === layerId);
      if (!cur?.geojson && !cur?.loading) await loadGeojson(layerId);
    }
  }

  function selectFiltered(next: boolean, filteredIds: string[]) {
    const ids = new Set(filteredIds);
    setLayers((prev) => prev.map((l) => (ids.has(l.id) ? { ...l, visible: next } : l)));

    if (next) {
      const missing = layers.filter((l) => ids.has(l.id) && !l.geojson && !l.loading).slice(0, 10);
      missing.forEach((m) => loadGeojson(m.id));
    }
  }

  function clearAll() {
    setLayers((prev) => prev.map((l) => ({ ...l, visible: false })));
  }

  function openAttributeTable(layerId: string) {
    setTableLayerId(layerId);
    setTableOpen(true);
    setTableColor(DEFAULT_TABLE_COLOR);
    setTableSearch("");

    const cur = layers.find((l) => l.id === layerId);
    if (cur && !cur.geojson && !cur.loading) loadGeojson(layerId);
  }

  // selection = FILTERING on map
  function toggleFeatureSelection(layerId: string, idx: number, next: boolean) {
    setSelectedFeatureIdxByLayer((prev) => {
      const cur = new Set(prev[layerId] ?? []);
      if (next) cur.add(idx);
      else cur.delete(idx);
      return { ...prev, [layerId]: cur };
    });
  }

  function clearSelectedFeaturesInLayer(layerId: string) {
    setSelectedFeatureIdxByLayer((prev) => ({ ...prev, [layerId]: new Set<number>() }));
  }

  // apply color to rows (bulk) -> IMPORTANT: only affects passed idxs (so older red stays red)
  function colorRows(layerId: string, idxs: number[], color: string) {
    if (!layerId) return;
    if (!idxs.length) return;
    setFeatureColorByLayer((prev) => {
      const cur = { ...(prev[layerId] ?? {}) };
      for (const idx of idxs) cur[idx] = color;
      return { ...prev, [layerId]: cur };
    });
  }

  // clear per-feature color for rows
  function clearColorForRows(layerId: string, idxs: number[]) {
    if (!layerId) return;
    if (!idxs.length) return;
    setFeatureColorByLayer((prev) => {
      const cur = { ...(prev[layerId] ?? {}) };
      for (const idx of idxs) delete cur[idx];
      return { ...prev, [layerId]: cur };
    });
  }

  // per-row set/clear
  function colorRow(layerId: string, idx: number, color: string) {
    setFeatureColorByLayer((prev) => {
      const cur = { ...(prev[layerId] ?? {}) };
      cur[idx] = color;
      return { ...prev, [layerId]: cur };
    });
  }
  function clearRowColor(layerId: string, idx: number) {
    setFeatureColorByLayer((prev) => {
      const cur = { ...(prev[layerId] ?? {}) };
      delete cur[idx];
      return { ...prev, [layerId]: cur };
    });
  }

  // clear all color overrides for the layer
  function clearAllColorsForLayer(layerId: string) {
    setFeatureColorByLayer((prev) => ({ ...prev, [layerId]: {} }));
  }

  useEffect(() => {
    refreshList();
    return () => Object.values(abortersRef.current).forEach((a) => a.abort());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return layers;
    return layers.filter((l) => `${l.name} ${l.geom_type ?? ""} ${l.srid ?? ""}`.toLowerCase().includes(q));
  }, [layers, search]);

  const filteredIds = useMemo(() => filtered.map((l) => l.id), [filtered]);

  /**
   * Visible layers:
   * - If NO selection for that layer => show ALL features
   * - If there is selection => show ONLY selected features
   * - Inject per-feature color override into properties.__color
   */
  const visibleLayers = useMemo(() => {
    const base = layers.filter((l) => l.visible && l.geojson);

    return base.map((l) => {
      const fc = l.geojson;
      const features = Array.isArray(fc?.features) ? fc.features : [];
      const selected = selectedFeatureIdxByLayer[l.id] ?? new Set<number>();
      const colorOverrides = featureColorByLayer[l.id] ?? {};

      const nextFeatures: any[] = [];
      for (let idx = 0; idx < features.length; idx++) {
        if (selected.size > 0 && !selected.has(idx)) continue;

        const f = features[idx];
        const c = colorOverrides[idx];

        if (c) {
          nextFeatures.push({ ...f, properties: { ...(f?.properties ?? {}), __color: c } });
        } else {
          // ensure no stale __color stuck
          if (f?.properties && "__color" in f.properties) {
            const { __color, ...rest } = f.properties;
            nextFeatures.push({ ...f, properties: rest });
          } else {
            nextFeatures.push(f);
          }
        }
      }

      return { ...l, geojson: { ...fc, features: nextFeatures } };
    });
  }, [layers, selectedFeatureIdxByLayer, featureColorByLayer]);

  const visibleCount = layers.filter((l) => l.visible).length;
  const loadedCount = layers.filter((l) => l.visible && l.geojson).length;

  const hasAnyVisibleFiltered = useMemo(() => filtered.some((l) => l.visible), [filtered]);
  const hasAllVisibleFiltered = useMemo(() => filtered.length > 0 && filtered.every((l) => l.visible), [filtered]);

  const tableLayer = useMemo(() => layers.find((l) => l.id === tableLayerId) ?? null, [layers, tableLayerId]);

  const tableData = useMemo(() => {
    if (!tableLayer?.geojson) return { columns: [] as string[], rows: [] as any[] };
    return extractAttributesWithIds(tableLayer.geojson);
  }, [tableLayer?.geojson]);

  const tableSelectedSet = useMemo(() => {
    if (!tableLayerId) return new Set<number>();
    return selectedFeatureIdxByLayer[tableLayerId] ?? new Set<number>();
  }, [selectedFeatureIdxByLayer, tableLayerId]);

  const tableColorOverrides = useMemo(() => {
    if (!tableLayerId) return {} as Record<number, string>;
    return featureColorByLayer[tableLayerId] ?? {};
  }, [featureColorByLayer, tableLayerId]);

  const tableFilteredRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return tableData.rows.filter((r) => {
      if (!q) return true;
      return Object.values(r).some((v) => stringifyCell(v).toLowerCase().includes(q));
    });
  }, [tableData.rows, tableSearch]);

  const tableMax = tableData.rows.length;

  const tableFilteredIdxs = useMemo(
    () => tableFilteredRows.map((r: any) => Number(r.__idx)).filter((n) => Number.isFinite(n)),
    [tableFilteredRows]
  );

  const allFilteredSelected = useMemo(() => {
    if (!tableLayerId) return false;
    if (tableFilteredIdxs.length === 0) return false;
    const sel = tableSelectedSet;
    for (const idx of tableFilteredIdxs) if (!sel.has(idx)) return false;
    return true;
  }, [tableLayerId, tableFilteredIdxs, tableSelectedSet]);

  const someFilteredSelected = useMemo(() => {
    if (!tableLayerId) return false;
    if (tableFilteredIdxs.length === 0) return false;
    const sel = tableSelectedSet;
    let any = false;
    let anyNot = false;
    for (const idx of tableFilteredIdxs) {
      if (sel.has(idx)) any = true;
      else anyNot = true;
      if (any && anyNot) return true;
    }
    return false;
  }, [tableLayerId, tableFilteredIdxs, tableSelectedSet]);

  // ✅ IMPORTANT: apply color only to CURRENT FILTER GROUP (if tableSearch has text),
  // otherwise apply to all selected.
  const idxsToColorNow = useMemo(() => {
    if (!tableLayerId) return [] as number[];
    const q = tableSearch.trim();
    if (!q) return Array.from(tableSelectedSet);
    return tableFilteredIdxs.filter((i) => tableSelectedSet.has(i));
  }, [tableLayerId, tableSearch, tableFilteredIdxs, tableSelectedSet]);

  const idxsToClearColorNow = useMemo(() => {
    if (!tableLayerId) return [] as number[];
    const q = tableSearch.trim();
    if (!q) return Array.from(tableSelectedSet);
    return tableFilteredIdxs.filter((i) => tableSelectedSet.has(i));
  }, [tableLayerId, tableSearch, tableFilteredIdxs, tableSelectedSet]);

  // ✅ FORCE map redraw on real color changes (not just count)
  const mapKey = useMemo(() => {
    const selSig = Object.entries(selectedFeatureIdxByLayer)
      .map(([id, s]) => `${id}:${Array.from(s).sort((a, b) => a - b).join(",")}`)
      .join("|");

    const clrSig = Object.entries(featureColorByLayer)
      .map(([id, m]) => {
        const entries = Object.entries(m)
          .map(([k, v]) => `${k}:${v}`)
          .sort((a, b) => a.localeCompare(b))
          .join(",");
        return `${id}:${entries}`;
      })
      .join("|");

    return `${visibleLayers.length}-${hashString(selSig)}-${hashString(clrSig)}`;
  }, [visibleLayers.length, selectedFeatureIdxByLayer, featureColorByLayer]);

  const loadingAny = layers.some((l) => l.loading);
  const loadingCount = layers.filter((l) => l.loading).length;
  const showHUD = loadingCount >= 2;

  const colorCountForTableLayer = useMemo(() => Object.keys(tableColorOverrides).length, [tableColorOverrides]);

  const pickAllRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!pickAllRef.current) return;
    pickAllRef.current.indeterminate = !allFilteredSelected && someFilteredSelected;
  }, [allFilteredSelected, someFilteredSelected]);

  // ✅ map action buttons moved to Map header (per your screenshot)
  const canReloadVisible = useMemo(() => layers.some((l) => l.visible), [layers]);
  const reloadVisibleLayers = async () => {
    const ids = layers.filter((l) => l.visible).map((l) => l.id);
    for (const id of ids) await loadGeojson(id);
  };

  const [profileOpen, setProfileOpen] = useState(false);
  const profileWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!profileWrapRef.current) return;
      if (!profileWrapRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);


  return (
    <div className="shell">
      <style>{`
        :root{
          --bg0:#ffffff;
          --bg1:#f6f8fb;

          --panel:#ffffff;
          --panel2:#ffffff;

          --text:#0b1220;
          --muted: rgba(11,18,32,.60);

          --stroke: rgba(11,18,32,.10);
          --stroke2: rgba(11,18,32,.18);

          --shadow: 0 14px 40px rgba(11,18,32,.10);
          --shadow2: 0 30px 90px rgba(11,18,32,.14);

          --primary:#0f7a3a;
          --primaryBg: rgba(15,122,58,.12);

          --blue:#1166cc;
          --blueBg: rgba(17,102,204,.10);

          --danger:#d92d20;
          --dangerBg: rgba(217,45,32,.12);

          --good:#12a150;
          --goodBg: rgba(18,161,80,.12);
        }

        html, body { height:100%; margin:0; }

      html, body{
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial,
          "Apple Color Emoji","Segoe UI Emoji";
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

        body{
          color: var(--text);
          overflow:hidden;
          background:
            radial-gradient(900px 560px at 14% 0%, rgba(15,122,58,.10), transparent 60%),
            radial-gradient(900px 560px at 88% 12%, rgba(17,102,204,.10), transparent 60%),
            linear-gradient(180deg, var(--bg0), var(--bg1));
        }

        *{ box-sizing:border-box; }
        ::selection{ background: rgba(15,122,58,.18); }

        .shell{ height:100vh; width:100%; display:flex; flex-direction:column; }

        /* loaders */
        .ring{
          display:inline-block;
          border-radius: 999px;
          border: 2px solid rgba(11,18,32,.16);
          border-top-color: rgba(15,122,58,.95);
          box-shadow: 0 0 0 6px rgba(15,122,58,.10);
          animation: spin .75s linear infinite;
        }
        @keyframes spin{ to{ transform: rotate(360deg); } }

        .shimmer{
          display:inline-block;
          border-radius: 10px;
          background: linear-gradient(90deg, rgba(11,18,32,.06), rgba(11,18,32,.12), rgba(11,18,32,.06));
          background-size: 200% 100%;
          animation: shimmer 1.2s ease-in-out infinite;
        }
        @keyframes shimmer{ 0%{ background-position: 200% 0; } 100%{ background-position: -200% 0; } }

        .bootOverlay{
          position: fixed; inset: 0;
          z-index: 50000;
          display:flex;
          align-items:center;
          justify-content:center;
          background:
            radial-gradient(900px 600px at 30% 20%, rgba(15,122,58,.12), transparent 60%),
            radial-gradient(900px 600px at 70% 80%, rgba(17,102,204,.10), transparent 60%),
            rgba(255,255,255,.86);
          backdrop-filter: blur(18px);
        }
        .bootCard{
          width: min(520px, 92vw);
          padding: 18px;
          border-radius: 22px;
          border: 1px solid var(--stroke);
          background: rgba(255,255,255,.92);
          box-shadow: var(--shadow2);
          display:flex;
          gap:14px;
          align-items:center;
        }
        .bootIcon{
          width: 46px; height: 46px;
          border-radius: 16px;
          border: 1px solid rgba(11,18,32,.10);
          background:
            radial-gradient(18px 18px at 35% 35%, rgba(15,122,58,.28), transparent 70%),
            radial-gradient(18px 18px at 70% 70%, rgba(17,102,204,.22), transparent 70%),
            rgba(255,255,255,.92);
          display:flex; align-items:center; justify-content:center;
          box-shadow: 0 18px 44px rgba(11,18,32,.12);
        }
        .bootText{ display:flex; flex-direction:column; gap:8px; flex:1; min-width:0; }
        .bootLine{ display:flex; gap:10px; align-items:center; }
        .bootTitle{ font-weight: 1000; letter-spacing: -.35px; white-space:nowrap; overflow:hidden; text-overflow: ellipsis; }

        /* top bar */
        .topBar{
  height: 58px;
  padding: 0 12px;
  border-bottom: 1px solid var(--stroke);
  background: rgba(255,255,255,.88);
  backdrop-filter: blur(14px);
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;

  position: relative;     /* ✅ creates stacking context */
  z-index: 70000;         /* ✅ above Leaflet controls */
  overflow: visible;      /* ✅ allow profile dropdown */
}
        .brand{ display:flex; align-items:center; gap:10px; min-width:0; }
        .appIcon{
          width: 36px; height: 36px;
          border-radius: 14px;
          border: 1px solid rgba(11,18,32,.10);
          background:
            radial-gradient(14px 14px at 30% 30%, rgba(15,122,58,.22), transparent 70%),
            radial-gradient(14px 14px at 70% 70%, rgba(17,102,204,.20), transparent 70%),
            rgba(255,255,255,.92);
          box-shadow: 0 16px 40px rgba(11,18,32,.10);
          display:flex; align-items:center; justify-content:center;
        }
        .titleWrap{ display:flex; flex-direction:column; gap:1px; min-width:0; }
        .title{ font-size: 13px; font-weight: 1000; letter-spacing: -.25px; line-height: 1.1; white-space:nowrap; overflow:hidden; text-overflow: ellipsis; }
        .subtitle{ font-size: 11px; font-weight: 900; color: var(--muted); white-space:nowrap; overflow:hidden; text-overflow: ellipsis; }

        .pill{
          font-size: 11px;
          font-weight: 600;                 /* ✅ not bold */
          color: rgba(11,18,32,.74);
          border: 1px solid var(--stroke);
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,.90);
          display:inline-flex;
          align-items:center;
          gap:8px;
          white-space:nowrap;
        }


        /* buttons */
     .btn{
  border: 1px solid var(--stroke);
  background: rgba(255,255,255,.92);
  color: var(--text);
  font-weight: 650;                 /* ✅ not bold */
  cursor: pointer;
  display:inline-flex;
  align-items:center;
  gap:8px;
  user-select:none;
  transition: transform .10s ease, border-color .15s ease, box-shadow .15s ease, background .15s ease;
  padding: 8px 10px;
  border-radius: 14px;
  font-size: 11px;                  /* ✅ smaller */
}

        .btn:hover{
          border-color: var(--stroke2);
          box-shadow: 0 12px 28px rgba(11,18,32,.10);
          transform: translateY(-1px);
        }
        .btn:active{ transform: translateY(0); }
        .btn:focus-visible{
          outline: 3px solid rgba(15,122,58,.22);
          outline-offset: 2px;
        }
        .btn[disabled]{ opacity: .55; cursor: not-allowed; transform:none; box-shadow:none; }
        .btnPrimary{
          border-color: rgba(15,122,58,.28);
          background: linear-gradient(180deg, rgba(15,122,58,.10), rgba(255,255,255,.92));
        }
        .btnDanger{
          border-color: rgba(217,45,32,.25);
          background: linear-gradient(180deg, rgba(217,45,32,.08), rgba(255,255,255,.92));
        }
        .btnGhost{ background: rgba(255,255,255,.92); }
        .iconBtn{
          width: 40px;
          height: 40px;
          padding: 0;
          justify-content:center;
          border-radius: 14px;
        }
        .miniIconBtn{
          width: 34px;
          height: 34px;
          padding: 0;
          justify-content:center;
          border-radius: 999px; /* ✅ round buttons in table */
        }

        /* layout */
        .main{
          flex:1;
          min-height:0;
          display:grid;
          grid-template-columns: minmax(320px, 410px) 1fr;
          gap: 12px;
          padding: 12px;
        }

        .panel, .mapCard{
          border: 1px solid var(--stroke);
          border-radius: 20px;
          background: rgba(255,255,255,.92);
          box-shadow: var(--shadow);
          display:flex;
          flex-direction:column;
          min-height:0;
          overflow:hidden;
        }

        .panelHead{
          padding: 12px;
          border-bottom: 1px solid var(--stroke);
          display:flex;
          flex-direction:column;
          gap:10px;
        }

        .headRow{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .headLeft{ display:flex; align-items:center; gap:10px; min-width:0; }
     .sectionTitle{
        font-size: 15px;                  /* ✅ smaller */
        font-weight: 700;                 /* ✅ softer */
        letter-spacing: -0.15px;
        display:flex;
        align-items:center;
        gap:10px;
      }


        .searchWrap{
          display:flex;
          align-items:center;
          gap:10px;
          padding: 10px 10px;
          border-radius: 16px;
          border: 1px solid var(--stroke);
          background: rgba(255,255,255,.92);
        }
        .searchWrap:focus-within{
          border-color: rgba(15,122,58,.35);
          box-shadow: 0 0 0 5px rgba(15,122,58,.10);
        }
  .searchInput{
  width:100%;
  border:0;
  outline:0;
  background:transparent;
  font-weight: 600;                 /* ✅ softer */
  color: var(--text);
  font-size: 12px;                  /* ✅ smaller */
}

        .list{
          overflow:auto;
          flex:1;
          min-height:0;
          -webkit-overflow-scrolling: touch;
          padding: 12px;
          display:flex;
          flex-direction:column;
          gap:10px;
        }

        .card{
          border: 1px solid rgba(11,18,32,.10);
          border-radius: 18px;
          padding: 12px;
          background:
            radial-gradient(520px 240px at 18% 0%, rgba(15,122,58,.10), transparent 60%),
            radial-gradient(520px 240px at 85% 100%, rgba(17,102,204,.08), transparent 60%),
            rgba(255,255,255,.94);
          transition: transform .12s ease, box-shadow .15s ease, border-color .15s ease;
          display:grid;
          gap:10px;
        }
        .card:hover{ transform: translateY(-1px); border-color: rgba(15,122,58,.18); box-shadow: 0 16px 44px rgba(11,18,32,.12); }

        .cardTop{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
        .name{
  font-weight: 650;                 /* ✅ not bold */
  letter-spacing: -0.10px;
  font-size: 12px;                  /* ✅ smaller */
  line-height: 1.2;
  word-break: break-word;
}

      .meta{
  font-size: 10.5px;                /* ✅ smaller */
  font-weight: 500;                 /* ✅ not bold */
  color: rgba(11,18,32,.62);
  margin-top: 4px;
}

        .row{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .leftRow{ display:flex; align-items:center; gap:10px; min-width:0; }

        .layerChk{ width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary); }

        .statusDot{
          width: 10px; height: 10px; border-radius: 999px;
          border: 1px solid rgba(11,18,32,.16);
          background: rgba(11,18,32,.08);
          box-shadow: 0 0 0 8px rgba(11,18,32,.04);
        }
        .statusDot.on{ background: rgba(18,161,80,.70); box-shadow: 0 0 0 8px rgba(18,161,80,.14); border-color: rgba(18,161,80,.28); }
        .statusDot.loading{ background: rgba(17,102,204,.70); box-shadow: 0 0 0 8px rgba(17,102,204,.14); border-color: rgba(17,102,204,.28); }

        .err{
          font-size: 11px;
          font-weight: 950;
          color: #7a0b1a;
          background: rgba(217,45,32,.08);
          border: 1px solid rgba(217,45,32,.16);
          padding: 8px 10px;
          border-radius: 14px;
        }

        .mapHead{
          padding: 12px;
          border-bottom: 1px solid var(--stroke);
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          flex-wrap:wrap;
          background: rgba(255,255,255,.92);
        }
        .mapTitle{
          font-weight: 700;
          letter-spacing: -.25px;
          display:flex;
          align-items:center;
          gap:10px;
          font-size: 15px;
        }
   .chip{
  font-size: 10.5px;                /* ✅ smaller */
  font-weight: 650;                 /* ✅ softer */
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--stroke);
  background: rgba(255,255,255,.92);
  color: rgba(11,18,32,.78);
  display:inline-flex;
  align-items:center;
  gap:8px;
}


        .mapArea{ position:relative; flex:1; min-height:0; }
        .mapInner{ position:absolute; inset:0; border-radius: 18px; overflow:hidden; }

        /* mobile */
        @media (max-width: 980px){
          body{ overflow:hidden; }
          .main{ grid-template-columns: 1fr; padding: 0; gap: 0; }
          .panel{ display:none; }
          .mapCard{ border:0; border-radius:0; box-shadow:none; background: transparent; }
          .mapHead{ position: sticky; top: 0; z-index: 50; background: rgba(255,255,255,.92); backdrop-filter: blur(14px); }
          .mapInner{ border-radius: 0; }
        }

        /* FAB */
        .fab{
          position: fixed;
          right: 14px;
          bottom: 14px;
          z-index: 9000;
          width: 56px;
          height: 56px;
          border-radius: 20px;
          border: 1px solid var(--stroke);
          background: rgba(255,255,255,.92);
          box-shadow: 0 18px 52px rgba(11,18,32,.14);
          display:none;
          align-items:center;
          justify-content:center;
          cursor:pointer;
          transition: transform .12s ease, box-shadow .15s ease, border-color .15s ease;
        }
        .fab:hover{ transform: translateY(-2px); border-color: rgba(15,122,58,.22); box-shadow: 0 24px 62px rgba(11,18,32,.16); }
        .fab:active{ transform: translateY(0); }
        .fabIcon{
          width: 28px; height: 28px;
          border-radius: 12px;
          background: rgba(15,122,58,.12);
          border: 1px solid rgba(15,122,58,.18);
          display:flex; align-items:center; justify-content:center;
          color: var(--primary);
        }
        .fabBadge{
          position:absolute;
          top: -6px;
          right: -6px;
          min-width: 22px;
          height: 22px;
          padding: 0 7px;
          border-radius: 999px;
          background: var(--primary);
          color: white;
          font-weight: 1000;
          font-size: 12px;
          display:flex;
          align-items:center;
          justify-content:center;
          border: 2px solid #fff;
          box-shadow: 0 12px 20px rgba(11,18,32,.18);
        }
        @media (max-width: 980px){ .fab{ display:flex; } }

        /* Bottom sheet */
        .sheetOverlay{
          position: fixed; inset: 0;
          background: rgba(11,18,32,.42);
          z-index: 9999;
          display:flex;
          align-items:flex-end;
          justify-content:center;
          padding: 10px;
        }
        .sheet{
          width: min(760px, 100%);
          height: min(84vh, 860px);
          background: rgba(255,255,255,.96);
          border: 1px solid var(--stroke);
          border-radius: 24px;
          box-shadow: var(--shadow2);
          overflow:hidden;
          display:flex;
          flex-direction:column;
          transform: translateY(14px);
          opacity: 0;
          animation: sheetIn .18s ease-out forwards;
        }
        @keyframes sheetIn{ to{ transform: translateY(0); opacity: 1; } }
        .grab{
          width: 52px;
          height: 5px;
          border-radius: 999px;
          background: rgba(11,18,32,.18);
          align-self:center;
          margin: 12px 0 6px;
        }
        .sheetTop{
          padding: 10px 12px 12px;
          border-bottom: 1px solid var(--stroke);
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
        }
        .sheetTitle{ font-weight: 1000; display:flex; align-items:center; gap:10px; }

        /* Attribute modal */
      .modalOverlay{
        position: fixed;
        inset: 0;
        background: rgba(11,18,32,.50);

        z-index: 90000;          /* ✅ ABOVE topBar (70000) */
        display:flex;
        align-items:flex-end;
        justify-content:center;
        padding: 10px;
      }

        .modal{
          width: min(1180px, 100%);
          height: min(86vh, 920px);
          background: rgba(255,255,255,.96);
          border: 1px solid var(--stroke);
          border-radius: 24px;
          box-shadow: var(--shadow2);
          overflow:hidden;
          display:flex;
          flex-direction:column;
          transform: translateY(14px);
          opacity: 0;
          animation: sheetIn .18s ease-out forwards;
        }

        @media (min-width: 900px){ .modalOverlay{ align-items:center; } }

        .modalTop{
          padding: 12px;
          border-bottom: 1px solid var(--stroke);
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap;
          background: rgba(255,255,255,.96);
        }
        .rowTools{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .emptyState{
          padding: 18px 12px;
          color: rgba(11,18,32,.65);
          font-weight: 950;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:12px;
          min-height: 140px;
        }

        /* Table bar */
        .tableBar{
          padding: 10px 12px;
          border-bottom: 1px solid var(--stroke);
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          align-items:center;
          background: rgba(255,255,255,.94);
        }
        .tableBarRight{
          margin-left:auto;
          display:flex;
          gap:8px;
          align-items:center;
          flex-wrap:wrap;
          justify-content:flex-end;
        }
        .smallHint{
          font-size:12px;
          font-weight: 900;
          color: rgba(11,18,32,.62);
          display:inline-flex;
          align-items:center;
          gap:8px;
          white-space:nowrap;
        }

        /* ✅ circular color button */
        .colorPickWrap{ display:inline-flex; align-items:center; gap:8px; }
        .colorCircle{
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(11,18,32,.14);
          background: rgba(255,255,255,.92);
          box-shadow: 0 12px 26px rgba(11,18,32,.08);
          display:inline-flex;
          align-items:center;
          justify-content:center;
          cursor:pointer;
          transition: transform .10s ease, border-color .15s ease, box-shadow .15s ease;
        }
        .colorCircle:hover{ transform: translateY(-1px); border-color: rgba(15,122,58,.22); box-shadow: 0 16px 34px rgba(11,18,32,.10); }
        .colorCircle:active{ transform: translateY(0); }
        .colorCircle:focus-visible{ outline: 3px solid rgba(15,122,58,.22); outline-offset: 2px; }
        .colorSwatch{
          width: 14px; height: 14px;
          border-radius: 999px;
          border: 1px solid rgba(11,18,32,.18);
          box-shadow: 0 0 0 7px rgba(11,18,32,.04);
          background: var(--text);
        }
        .hiddenColorInput{
          position:absolute;
          opacity:0;
          width:1px;
          height:1px;
          pointer-events:none;
        }

      .tableWrap{
        flex: 1;                 /* ✅ fills remaining modal space */
        min-height: 0;           /* ✅ prevents pushing under header */
        overflow: auto;
        -webkit-overflow-scrolling: touch;
        background: rgba(11,18,32,.03);
      }

        table{
          border-collapse: separate;
          border-spacing: 0;
          width: max(100%, 980px);
          font-size: 11px;
        }
        th, td{
          border-bottom: 1px solid rgba(11,18,32,.08);
          padding: 10px 10px;
          text-align:left;
          vertical-align: top;
          white-space: nowrap;
        }
        th{
         position: sticky;
          top: 0;                  /* stays inside tableWrap */
          z-index: 3;  
          background: rgba(255,255,255,.98);
          border-bottom: 1px solid rgba(11,18,32,.12);
          font-weight: 700;            /* ✅ header bold only */
          color: rgba(11,18,32,.92);
        }
        td{ font-weight: 450;  color: rgba(11,18,32,.82); } /* ✅ body not too bold */
        tbody tr:hover td{ background: rgba(15,122,58,.06); }

        /* ✅ selected row highlight */
        tbody tr.rowSelected td{
          background: rgba(15,122,58,.10) !important;
          border-bottom-color: rgba(15,122,58,.18);
        }
        tbody tr.rowSelected td:first-child{
          box-shadow: inset 4px 0 0 rgba(15,122,58,.75);
        }

        .rowChk{ width:16px; height:16px; cursor:pointer; accent-color: var(--primary); }

        /* HUD */
        .hud{
          position: fixed;
          top: 70px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 20000;
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid var(--stroke);
          background: rgba(255,255,255,.92);
          box-shadow: 0 18px 52px rgba(11,18,32,.14);
          display:flex;
          align-items:center;
          gap:10px;
        }
        .hudCount{
          min-width: 22px;
          height: 22px;
          padding: 0 7px;
          border-radius: 999px;
          border: 1px solid rgba(11,18,32,.12);
          background: rgba(255,255,255,.92);
          font-weight: 1000;
          display:flex;
          align-items:center;
          justify-content:center;
          color: rgba(11,18,32,.80);
        }
          
/* ───────────────────────── Profile (icon only) ───────────────────────── */
.profileWrap{
  position: relative;
  z-index: 70000; /* ✅ ensure wrapper is above map stacking contexts */
}

/* ✅ always on top of Leaflet / map controls + NOT clipped */
.profileMenu{
  position: absolute;
  top: calc(100% + 10px);
  right: 0;

  width: 240px;
  border-radius: 18px;
  border: 1px solid var(--stroke);
  background: rgba(255,255,255,.98);
  box-shadow: var(--shadow2);
  overflow: hidden;

  z-index: 70010;                 /* ✅ higher than map controls */
  transform: translateY(6px);
  opacity: 0;
  animation: menuIn .14s ease-out forwards;

  /* ✅ prevents weird stacking + keeps it from being clipped in some cases */
  isolation: isolate;
  will-change: transform, opacity;
}
@keyframes menuIn { to { transform: translateY(0); opacity: 1; } }

.profileMenu::before{
  content:"";
  position:absolute;
  top:-7px;
  right: 16px;
  width: 12px;
  height: 12px;
  background: rgba(255,255,255,.98);
  border-left: 1px solid var(--stroke);
  border-top: 1px solid var(--stroke);
  transform: rotate(45deg);
}

/* ✅ softer typography (no super bold) */
.profileHead{ padding: 12px; }
.profileName{
  font-size: 14px;
  font-weight: 750;
  letter-spacing: -0.1px;
}
.profileSub{
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
  margin-top: 2px;
}

.profileDivider{ height:1px; background: rgba(11,18,32,.08); }

.profileItem{
  width:100%;
  display:flex;
  align-items:center;
  gap:10px;
  padding: 11px 12px;

  border:0;
  background: transparent;
  cursor:pointer;

  font-size: 13px;
  font-weight: 500;               /* ✅ softer */
  color: var(--text);
}
.profileItem:hover{ background: rgba(15,122,58,.06); }
.profileItem svg{ opacity:.9; }

/* top right wrapper */
.topRight{
  display:flex;
  align-items:center;
  gap:10px;
}

/* ✅ avatar used inside the icon button */
.avatar{
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display:flex;
  align-items:center;
  justify-content:center;

  border: 1px solid rgba(11,18,32,.12);
  background: rgba(15,122,58,.10);
  color: var(--primary);

  font-size: 13px;
  font-weight: 700;               /* ✅ not too bold */
  overflow:hidden;
  line-height: 1;
}


      `}</style>

      {/* Boot loader */}
      {booting ? (
        <div className="bootOverlay" role="status" aria-live="polite">
          <div className="bootCard">
            <div className="bootIcon" aria-hidden="true">
              <FontAwesomeIcon icon={faLayerGroup} opacity={0.9} />
            </div>
            <div className="bootText">
              <div className="bootLine">
                <div className="bootTitle">Loading Layers..</div>
                <Ring size={16} />
              </div>
              <Shimmer h={10} w="78%" />
              <Shimmer h={10} w="58%" />
            </div>
          </div>
        </div>
      ) : null}

      {/* HUD loader */}
      {showHUD ? (
        <div className="hud" role="status" aria-live="polite" title="Background loading">
          <Ring size={16} />
          <div className="hudCount">{loadingCount}</div>
        </div>
      ) : null}

      {/* Top bar */}
      <div className="topBar">
        <div className="brand">
        <div className="appIcon" aria-hidden="true">
          <Image
            src="/images/denr.png"
            alt="DENR Logo"
            width={28}
            height={28}
            style={{ objectFit: "contain" }}
            priority
          />
        </div>

          <div className="titleWrap">
            <div className="title">One Control Map</div>
            <div className="subtitle">PENRO Cagayan</div>
          </div>
        </div>

      <div className="topRight">

  {/* Profile */}
{/* Profile */}
<div className="profileWrap" ref={profileWrapRef}>
  <button
    className="btn btnGhost iconBtn"
    type="button"
    onClick={() => setProfileOpen((v) => !v)}
    aria-expanded={profileOpen}
    aria-haspopup="menu"
    title="Profile"
    style={{ borderRadius: 999 }}
  >
    <span className="avatar" aria-hidden="true">U</span>
  </button>

  {profileOpen ? (
    <div className="profileMenu" role="menu">
      <div className="profileHead">
        <div className="profileName">Guest User</div>
        {/* <div className="profileSub">PENRO Cagayan</div> */}
      </div>
      <div className="profileDivider" />

      <button
        className="profileItem"
        role="menuitem"
        type="button"
        onClick={() => {
          setProfileOpen(false);
          window.location.href = "/login";
        }}
      >
        <FontAwesomeIcon icon={faUserShield} />
        <span>Admin Login</span>
      </button>
    </div>
  ) : null}
</div>


</div>



      </div>

      <div className="main">
        {/* LEFT PANEL */}
        <div className="panel">
          <div className="panelHead">
            <div className="headRow">
              <div className="headLeft">
                <div className="sectionTitle">
                  <span className="dot" />
                  Layers
                </div>
                <div className="pill">{filtered.length}</div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {isFiltering ? (
                  <button
                    className="btn btnPrimary"
                    onClick={() => selectFiltered(!hasAllVisibleFiltered, filteredIds)}
                    disabled={filtered.length === 0}
                    title="Select all filtered"
                    type="button"
                  >
                    <FontAwesomeIcon icon={hasAllVisibleFiltered ? faCheckSquare : faSquare} />
                  </button>
                ) : null}

                <button
                  className="btn btnDanger"
                  onClick={() => (isFiltering ? selectFiltered(false, filteredIds) : clearAll())}
                  disabled={isFiltering ? !hasAnyVisibleFiltered : layers.filter((l) => l.visible).length === 0}
                  title="Clear visible"
                  type="button"
                >
                  <FontAwesomeIcon icon={faEyeSlash} />
                </button>
              </div>
            </div>

            <div className="searchWrap">
              <FontAwesomeIcon icon={faMagnifyingGlass} opacity={0.8} />
              <input
                className="searchInput"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search layers…"
              />
              {isFiltering ? (
                <button className="btn btnGhost iconBtn" onClick={() => setSearch("")} title="Clear" type="button">
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="list">
            {loadingList && layers.length === 0 ? (
              <>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="card">
                    <div className="cardTop">
                      <div style={{ flex: 1 }}>
                        <Shimmer h={12} w="70%" />
                        <div style={{ height: 8 }} />
                        <Shimmer h={10} w="46%" />
                      </div>
                      <Ring size={16} />
                    </div>
                    <div className="row">
                      <div className="leftRow">
                        <span className="statusDot" />
                        <Shimmer h={12} w="90px" />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Shimmer h={40} w="40px" />
                        <Shimmer h={40} w="40px" />
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : filtered.length === 0 ? (
              <div className="pill" style={{ alignSelf: "flex-start" }}>
                No results
              </div>
            ) : (
              filtered.map((l) => {
                const selectedCount = selectedFeatureIdxByLayer[l.id]?.size ?? 0;
                const ready = l.visible && l.geojson;
                return (
                  <div key={l.id} className="card">
                    <div className="cardTop">
                      <div style={{ minWidth: 0 }}>
                        <div className="name" title={l.name}>
                          {l.name}
                        </div>
                        <div className="meta">
                          {l.geom_type ?? "-"} • SRID {l.srid ?? "-"}
                          {selectedCount > 0 ? ` • ${selectedCount}` : ""}
                        </div>
                      </div>
                      {l.loading ? <Ring size={16} /> : <span className={`statusDot ${ready ? "on" : ""}`} aria-hidden="true" />}
                    </div>

                    <div className="row">
                      <div className="leftRow">
                        <input
                          className="layerChk"
                          type="checkbox"
                          checked={l.visible}
                          onChange={(e) => toggleLayer(l.id, e.target.checked)}
                          aria-label={`Toggle ${l.name}`}
                        />
                        <span className={`statusDot ${l.loading ? "loading" : ready ? "on" : ""}`} aria-hidden="true" />
                      </div>

                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="btn btnPrimary iconBtn"
                          onClick={() => loadGeojson(l.id)}
                          disabled={l.loading}
                          title="Reload GeoJSON"
                          type="button"
                        >
                          {l.loading ? <Ring size={16} /> : <FontAwesomeIcon icon={faArrowsRotate} />}
                        </button>
                        <button
                          className="btn btnGhost iconBtn"
                          onClick={() => openAttributeTable(l.id)}
                          title="Attribute table"
                          type="button"
                        >
                          <FontAwesomeIcon icon={faTable} />
                        </button>
                      </div>
                    </div>

                    {l.error ? <div className="err">⚠ {l.error}</div> : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* MAP */}
        <div className="mapCard">
          <div className="mapHead">
            <div className="mapTitle">
              Map
              <span className="chip">
                <FontAwesomeIcon icon={faEye} /> <b>{visibleLayers.length}</b>
              </span>
              {loadingAny ? (
                <span className="chip" title="Loading">
                  <Ring size={14} />
                </span>
              ) : null}
            </div>

            {/* ✅ "reload/remove" moved here (as per screenshot) */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div className="pill" title="Visible / loaded">
              <b>{visibleCount}</b> • <b>{loadedCount}</b>

              <button
            className="btn btnPrimary"
            onClick={refreshList}
            disabled={loadingList}
            title="Refresh layer list"
            type="button"
          >
            {loadingList ? <Ring size={16} /> : <FontAwesomeIcon icon={faRotateRight} />}
            <span style={{ display: "none" }}>Refresh</span>
          </button>
            </div>


            
            </div>
          </div>

          <div className="mapArea">
            <div className="mapInner">
              <ResultMap
                key={mapKey}
                layers={visibleLayers.map((v) => ({
                  id: v.id,
                  name: v.name,
                  color: DEFAULT_LAYER_COLOR,
                  geom_type: v.geom_type,
                  geojson: v.geojson,
                }))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE FAB */}
      <button className="fab" onClick={() => setMobilePanelOpen(true)} aria-label="Open layers" type="button">
        <span className="fabIcon">
          <FontAwesomeIcon icon={faLayerGroup} />
        </span>
        <span className="fabBadge" title="Visible layers">
          {visibleCount}
        </span>
      </button>

      {/* MOBILE SHEET */}
      {mobilePanelOpen ? (
        <div className="sheetOverlay" onClick={() => setMobilePanelOpen(false)} role="dialog" aria-modal="true">
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <div className="sheetTop">
              <div className="sheetTitle">
                <FontAwesomeIcon icon={faLayerGroup} />
                Layers
                <span className="pill" style={{ padding: "5px 9px" }}>
                  {filtered.length}
                </span>
              </div>

              <button className="btn btnGhost iconBtn" onClick={() => setMobilePanelOpen(false)} title="Close" type="button">
                <FontAwesomeIcon icon={faChevronDown} />
              </button>
            </div>

            <div className="panelHead" style={{ borderRadius: 0 }}>
  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
    <div className="searchWrap" style={{ flex: 1 }}>
      <FontAwesomeIcon icon={faMagnifyingGlass} opacity={0.8} />
      <input
        className="searchInput"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search layers…"
      />
      {isFiltering ? (
        <button className="btn btnGhost iconBtn" onClick={() => setSearch("")} title="Clear" type="button">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      ) : null}
    </div>

    {/* ✅ Eye button beside search */}
    <button
      className="btn btnDanger iconBtn"
      onClick={() => (isFiltering ? selectFiltered(false, filteredIds) : clearAll())}
      disabled={isFiltering ? !hasAnyVisibleFiltered : visibleCount === 0}
      title="Hide all"
      type="button"
    >
      <FontAwesomeIcon icon={faEyeSlash} />
    </button>
  </div>

  {/* keep the rest buttons below (select filtered, etc.) */}
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {isFiltering ? (
      <button
        className="btn btnPrimary"
        onClick={() => selectFiltered(!hasAllVisibleFiltered, filteredIds)}
        disabled={filtered.length === 0}
        title="Select filtered"
        type="button"
      >
        <FontAwesomeIcon icon={hasAllVisibleFiltered ? faCheckSquare : faSquare} />
      </button>
    ) : null}
  </div>
</div>


            <div className="list" style={{ paddingBottom: 18 }}>
              {filtered.length === 0 ? (
                <div className="pill" style={{ alignSelf: "flex-start" }}>
                  No results
                </div>
              ) : (
                filtered.map((l) => {
                  const selectedCount = selectedFeatureIdxByLayer[l.id]?.size ?? 0;
                  const ready = l.visible && l.geojson;
                  return (
                    <div key={l.id} className="card">
                      <div className="cardTop">
                        <div style={{ minWidth: 0 }}>
                          <div className="name" title={l.name}>
                            {l.name}
                          </div>
                          <div className="meta">
                            {l.geom_type ?? "-"} • SRID {l.srid ?? "-"}
                            {selectedCount > 0 ? ` • ${selectedCount}` : ""}
                          </div>
                        </div>
                        {l.loading ? <Ring size={16} /> : <span className={`statusDot ${ready ? "on" : ""}`} aria-hidden="true" />}
                      </div>

                      <div className="row">
                        <div className="leftRow">
                          <input className="layerChk" type="checkbox" checked={l.visible} onChange={(e) => toggleLayer(l.id, e.target.checked)} />
                          <span className={`statusDot ${l.loading ? "loading" : ready ? "on" : ""}`} aria-hidden="true" />
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn btnPrimary iconBtn" onClick={() => loadGeojson(l.id)} disabled={l.loading} title="Reload" type="button">
                            {l.loading ? <Ring size={16} /> : <FontAwesomeIcon icon={faArrowsRotate} />}
                          </button>
                          <button className="btn btnGhost iconBtn" onClick={() => openAttributeTable(l.id)} title="Attribute table" type="button">
                            <FontAwesomeIcon icon={faTable} />
                          </button>
                        </div>
                      </div>

                      {l.error ? <div className="err">⚠ {l.error}</div> : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ATTRIBUTE TABLE */}
      {tableOpen ? (
        <div className="modalOverlay" onClick={() => setTableOpen(false)} role="dialog" aria-modal="true">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div className="pill" style={{ border: "none", padding: 0, background: "transparent" }}>
                <FontAwesomeIcon icon={faTable} />
                <span style={{ fontWeight: 1000, color: "var(--text)" }}>{tableLayer?.name ?? "Attributes"}</span>
                {tableLayerId ? (
                  <span className="smallHint" style={{ marginLeft: 10 }}>
                    {tableSelectedSet.size > 0 ? `${tableSelectedSet.size}` : "0"}
                  </span>
                ) : null}
              </div>

              <div className="rowTools" style={{ width: "100%", justifyContent: "space-between" }}>
  {/* LEFT → Search */}
  <div className="searchWrap" style={{ flex: 1, maxWidth: "70%" }}>
    <FontAwesomeIcon icon={faMagnifyingGlass} opacity={0.8} />
    <input
      className="searchInput"
      value={tableSearch}
      onChange={(e) => setTableSearch(e.target.value)}
      placeholder="Search…"
    />
  </div>

  {/* RIGHT → X + Reload + Close */}
  <div style={{ display: "flex", gap: 8 }}>
    {/* ✅ Clear search moved here */}
    {/* <button
      className="btn btnGhost iconBtn"
      onClick={() => setTableSearch("")}
      disabled={!tableSearch.trim()}
      title="Clear search"
      type="button"
    >
      <FontAwesomeIcon icon={faXmark} />
    </button> */}

    {/* Reload */}
    <button
      className="btn btnPrimary iconBtn"
      onClick={() => tableLayerId && loadGeojson(tableLayerId)}
      disabled={!tableLayerId || !!tableLayer?.loading}
      title="Reload"
      type="button"
    >
      {tableLayer?.loading ? <Ring size={16} /> : <FontAwesomeIcon icon={faArrowsRotate} />}
    </button>

    {/* Close modal */}
    <button
      className="btn btnGhost iconBtn"
      onClick={() => setTableOpen(false)}
      title="Close"
      type="button"
    >
      <FontAwesomeIcon icon={faXmark} />
    </button>
  </div>
</div>

            </div>

            {!tableLayer ? (
              <div className="emptyState">
                <Ring size={18} />
              </div>
            ) : tableLayer.loading ? (
              <div className="emptyState">
                <Ring size={18} />
              </div>
            ) : !tableLayer.geojson ? (
              <div className="emptyState">
                <Ring size={18} />
              </div>
            ) : tableData.rows.length === 0 ? (
              <div className="emptyState">
                <Ring size={18} />
              </div>
            ) : (
              <>
                <div className="tableBar">
                  <div className="pill">
                    <b>{tableSelectedSet.size}</b> / <b>{tableMax}</b>
                  </div>

                  <div className="smallHint">
                    <b>{tableFilteredIdxs.length}</b>
                    <span style={{ marginLeft: 10, opacity: 0.9 }}>
                      {colorCountForTableLayer > 0 ? `${colorCountForTableLayer}` : "0"}
                    </span>
                  </div>

                  <div className="tableBarRight">
                    {/* ✅ circular color picker */}
                    <div className="colorPickWrap" title="Pick color">
                      <label className="colorCircle">
                        <span className="colorSwatch" style={{ background: tableColor }} />
                        <input
                          className="hiddenColorInput"
                          type="color"
                          value={tableColor}
                          onChange={(e) => setTableColor(e.target.value)}
                          aria-label="Pick color"
                        />
                      </label>
                    </div>

                    <button
                      className="btn btnPrimary miniIconBtn"
                      onClick={() => {
                        if (!tableLayerId) return;
                        colorRows(tableLayerId, idxsToColorNow, tableColor);
                      }}
                      disabled={!tableLayerId || idxsToColorNow.length === 0}
                      title="Color selected"
                      type="button"
                    >
                      <FontAwesomeIcon icon={faPalette} />
                    </button>

                    <button
                      className="btn btnGhost miniIconBtn"
                      onClick={() => {
                        if (!tableLayerId) return;
                        clearColorForRows(tableLayerId, idxsToClearColorNow);
                      }}
                      disabled={!tableLayerId || idxsToClearColorNow.length === 0}
                      title="Clear selected color"
                      type="button"
                    >
                      <FontAwesomeIcon icon={faEraser} />
                    </button>

                    <button
                      className="btn btnDanger miniIconBtn"
                      onClick={() => tableLayerId && clearSelectedFeaturesInLayer(tableLayerId)}
                      disabled={!tableLayerId || tableSelectedSet.size === 0}
                      title="Clear selection"
                      type="button"
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </button>

                    <button
                      className="btn btnDanger miniIconBtn"
                      onClick={() => tableLayerId && clearAllColorsForLayer(tableLayerId)}
                      disabled={!tableLayerId || Object.keys(tableColorOverrides).length === 0}
                      title="Clear all colors"
                      type="button"
                    >
                      <FontAwesomeIcon icon={faEyeSlash} />
                    </button>
                  </div>
                </div>

                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>
                          <input
                            ref={pickAllRef}
                            className="rowChk"
                            type="checkbox"
                            checked={allFilteredSelected}
                            onChange={() => {
                              if (!tableLayerId) return;
                              if (tableFilteredIdxs.length === 0) return;

                              if (allFilteredSelected) {
                                setSelectedFeatureIdxByLayer((prev) => {
                                  const cur = new Set(prev[tableLayerId] ?? []);
                                  for (const idx of tableFilteredIdxs) cur.delete(idx);
                                  return { ...prev, [tableLayerId]: cur };
                                });
                              } else {
                                setSelectedFeatureIdxByLayer((prev) => {
                                  const cur = new Set(prev[tableLayerId] ?? []);
                                  for (const idx of tableFilteredIdxs) cur.add(idx);
                                  return { ...prev, [tableLayerId]: cur };
                                });
                              }
                            }}
                            aria-label="Select all filtered rows"
                            title="Select filtered"
                          />
                        </th>

                        {/* ✅ row header not too wide */}
                        <th style={{ width: 150 }}>Row</th>

                        {tableData.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {tableFilteredRows.map((r: any) => {
                        const idx = Number(r.__idx);
                        const checked = tableLayerId ? selectedFeatureIdxByLayer[tableLayerId]?.has(idx) ?? false : false;

                        const override = Number.isFinite(idx) ? tableColorOverrides[idx] : undefined;
                        const rowColor = override ?? DEFAULT_LAYER_COLOR;

                        return (
                          <tr key={idx} className={checked ? "rowSelected" : ""}>
                            <td>
                              <input
                                className="rowChk"
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => tableLayerId && toggleFeatureSelection(tableLayerId, idx, e.target.checked)}
                                aria-label={`Select row ${idx + 1}`}
                              />
                            </td>

                            {/* ✅ row tools: circle color + round buttons */}
                            <td style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div className="colorPickWrap" title={override ? "Override color" : "Default color"}>
                                <label className="colorCircle" style={{ width: 32, height: 32 }}>
                                  <span className="colorSwatch" style={{ background: rowColor }} />
                                  <input
                                    className="hiddenColorInput"
                                    type="color"
                                    value={override ?? DEFAULT_LAYER_COLOR}
                                    onChange={(e) => {
                                      if (!tableLayerId) return;
                                      if (!Number.isFinite(idx)) return;
                                      colorRow(tableLayerId, idx, e.target.value);
                                    }}
                                    aria-label="Set row color"
                                  />
                                </label>
                              </div>

                              <button
                                className="btn btnGhost miniIconBtn"
                                onClick={() => {
                                  if (!tableLayerId) return;
                                  if (!Number.isFinite(idx)) return;
                                  clearRowColor(tableLayerId, idx);
                                }}
                                disabled={!override}
                                title="Clear row color"
                                type="button"
                              >
                                <FontAwesomeIcon icon={faEraser} />
                              </button>
                            </td>

                            {tableData.columns.map((c) => (
                              <td key={c}>{stringifyCell(r?.[c])}</td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
