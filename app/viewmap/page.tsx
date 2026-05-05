// C:\Users\Yummie03\Desktop\onemap\app\viewmap\page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import ResultMap from "@/app/components/ResultMapClient";
import Image from "next/image";
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
  faChevronRight,
  faPalette,
  faEraser,
  faUserShield,
  faLocationCrosshairs,
  faArrowUp,
  faArrowDown,
  faAnglesUp,
  faAnglesDown,
  faPlus,
  faMinus,
  faBars,
  faSliders,
  faSun,
  faMoon,
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
  _geoMode?: "map" | "full";
};

/** default color (when no per-feature override) */
const DEFAULT_LAYER_COLOR = "#2563eb";
/** default color used by the table color picker */
const DEFAULT_TABLE_COLOR = "#2563eb";

/** pseudo layers */
const MY_LOC_LAYER_ID = "__my_location__";
const MEASURE_LAYER_ID = "__measure__";

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

  // ✅ keep __fid in rows for internal logic, but DO NOT show it as a table column
  const internalVisible = ["__idx"];          // shown
  const internalHidden = ["__fid"];           // hidden

  const rest = Array.from(keySet)
    .filter((c) => !internalVisible.includes(c) && !internalHidden.includes(c))
    .sort((a, b) => a.localeCompare(b));

  return { columns: [...internalVisible, ...rest], rows };
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

function clampSelected(selected: Set<number>, maxExclusive: number) {
  const out = new Set<number>();
  for (const i of selected) if (Number.isFinite(i) && i >= 0 && i < maxExclusive) out.add(i);
  return out;
}

function Ring({ size = 16 }: { size?: number }) {
  return <span className="ring" style={{ width: size, height: size }} aria-hidden="true" />;
}

function Shimmer({ h = 14, w = "100%" }: { h?: number; w?: string }) {
  return <span className="shimmer" style={{ height: h, width: w }} aria-hidden="true" />;
}

// ✅ GROUPING HELPERS (put ABOVE ViewMapPage)
function getLayerGroup(name: string) {
  const n = (name || "").trim().toUpperCase();

  if (n.startsWith("NGP_")) return "NGP";
  if (n.startsWith("CADT")) return "CADT";
  if (n.startsWith("CADC")) return "CADC";
  if (n.startsWith("CBFMA")) return "CBFMA";
  if (n.startsWith("PA_")) return "PA";
  if (n.startsWith("PACBRMA")) return "PACBRMA";
  if (n.startsWith("CSC")) return "CSC";
  if (n.startsWith("FLAG_")) return "FLAG";
  if (n.startsWith("FLAGT_")) return "FLAGT";
  if (n.startsWith("FLGMA_")) return "FLGMA";
  if (n.startsWith("FORESHORE_")) return "FORESHORE";
  if (n.startsWith("GSUP_")) return "GSUP";
  if (n.startsWith("SIFMA_")) return "SIFMA";
  if (n.startsWith("SLUP_")) return "SLUP";
  if (n.startsWith("TFLA_")) return "TFLA";
  if (n.startsWith("A&D")) return "A&D";
  return "OTHERS";
}

const GROUP_ORDER = [
  "A&D",
  "CADC",
  "CADT",
  "CBFMA",
  "CSC",
  "FLAG",
  "FLAGT",
  "FLGMA",
  "FORESHORE",
  "GSUP",
  "NGP",
  "PA",
  "PACBRMA",
  "SIFMA",
  "SLUP",
  "TFLA",
  "OTHERS"
] as const;

type GroupKey = (typeof GROUP_ORDER)[number];


function hashString(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

type ToastState = { show: false } | { show: true; type: "success" | "error" | "info"; message: string };

function SpinnerDot({ size = 16 }: { size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: "2px solid var(--stroke2)",
        borderTopColor: "var(--text)",
        display: "inline-block",
        animation: "spin .85s linear infinite",
      }}
    />
  );
}

function OverlaySpinner({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="overlaySaving" role="alert" aria-live="assertive" aria-busy="true">
      <div className="overlayCard">
        <div className="overlayTop">
          <div className="overlayIcon">
            <SpinnerDot size={18} />
          </div>
          <div className="overlayText">
            <div className="overlayTitle">{title}</div>
            {subtitle ? <div className="overlaySub">{subtitle}</div> : null}
          </div>
        </div>
        <div className="overlayHint">
          <span style={{ fontWeight: 700 }}>ℹ</span>
          Actions are temporarily disabled to prevent duplicate requests.
        </div>
      </div>
    </div>
  );
}

/** --- distance helpers (meters) --- */
function toRad(d: number) {
  return (d * Math.PI) / 180;
}
function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}
function formatDistance(m: number) {
  if (!Number.isFinite(m)) return "-";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m >= 10000 ? 1 : 2)} km`;
}

export default function ViewMapPage() {
  const [layers, setLayers] = useState<MapLayer[]>([]);
  const layersRef = useRef<MapLayer[]>([]);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  /** Draw order (BOTTOM -> TOP). Includes real layer ids + pseudo ids */
  const [layerDrawOrder, setLayerDrawOrder] = useState<string[]>([]);

  const [loadingList, setLoadingList] = useState(false);
  const [booting, setBooting] = useState(true);

  const [search, setSearch] = useState("");
  const isFiltering = search.trim().length > 0;

  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"all" | "selected">("all");
  const [desktopTab, setDesktopTab] = useState<"all" | "selected">("all");

  const [showBasemap, setShowBasemap] = useState(true);
  const abortersRef = useRef<Record<string, AbortController>>({});

  const [toast, setToast] = useState<ToastState>({ show: false });
  const showToast = useCallback((type: "success" | "error" | "info", message: string) => {
    setToast({ show: true, type, message });
    window.setTimeout(() => setToast({ show: false }), 2200);
  }, []);

  /** ✅ RESIZE: left panel width (desktop only visually) */
  const [panelWidth, setPanelWidth] = useState(380); // px
  const resizingPanelRef = useRef(false);

  /** ✅ RESIZE: dock/table height (desktop only visually; mobile uses fixed sheet) */
  const [dockHeight, setDockHeight] = useState(320); // px
  const resizingDockRef = useRef(false);

  /** ✅ smoother resize (disable transitions while dragging + RAF throttle) */
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const [isResizingDock, setIsResizingDock] = useState(false);

  const rafRef = useRef<number | null>(null);
  const lastMoveRef = useRef<{ x: number; y: number } | null>(null);

  /** ✅ detect mobile breakpoint (used for behavior, not just CSS) */
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1280px)");
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  // ✅ Narrow sidebar (desktop only) — controls stacked layout
  const isNarrowSidebar = !isMobile && panelWidth <= 340;


  // ✅ group open/close
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    GROUP_ORDER.forEach((g) => (init[g] = false)); // ✅ default collapsed on fresh load
    return init;
  });

  // ✅ Accordion toggle (open one group, close others)
  const toggleGroup = useCallback((key: GroupKey) => {
    setGroupOpen((prev) => {
      const nextOpen = !(prev[key] ?? true);

      const next: Record<string, boolean> = {};
      GROUP_ORDER.forEach((g) => (next[g] = false)); // close all
      next[key] = nextOpen; // open (or close) clicked group

      return next;
    });
  }, []);



  const [zoomTo, setZoomTo] = useState<
  | { type: "layer"; layerId: string; nonce: number }
  | { type: "location"; nonce: number }
  | null
  >(null);


  useEffect(() => {
    function applyMove(x: number, y: number) {
      if (resizingPanelRef.current) {
        const leftPad = 12;
        const minW = 300;
        const maxW = 520;
        const next = Math.max(minW, Math.min(maxW, x - leftPad));
        setPanelWidth(next);
      }
      if (resizingDockRef.current) {
        const vh = window.innerHeight;
        const minH = 180;
        const maxH = Math.max(240, Math.floor(vh * 0.62));
        const bottomPad = 12;
        const next = Math.max(minH, Math.min(maxH, vh - y - bottomPad));
        setDockHeight(next);
      }
    }
    
    function onMove(e: MouseEvent) {
      lastMoveRef.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current != null) return;
    
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        const p = lastMoveRef.current;
        if (!p) return;
        applyMove(p.x, p.y);
      });
    }


    function onUp() {
      resizingPanelRef.current = false;
      resizingDockRef.current = false;
    
      setIsResizingPanel(false);
      setIsResizingDock(false);
    
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }


    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => {
    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      if (resizingPanelRef.current) {
        const leftPad = 12;
        const minW = 300;
        const maxW = 520;
        const next = Math.max(minW, Math.min(maxW, t.clientX - leftPad));
        setPanelWidth(next);
        e.preventDefault();
      }
      if (resizingDockRef.current) {
        const vh = window.innerHeight;
        const minH = 180;
        const maxH = Math.max(240, Math.floor(vh * 0.62));
        const bottomPad = 12;
        const next = Math.max(minH, Math.min(maxH, vh - t.clientY - bottomPad));
        setDockHeight(next);
        e.preventDefault();
      }
    }
    function onTouchEnd() {
      resizingPanelRef.current = false;
      resizingDockRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("touchmove", onTouchMove as any);
      window.removeEventListener("touchend", onTouchEnd as any);
      window.removeEventListener("touchcancel", onTouchEnd as any);
    };
  }, []);

  const beginResizePanel = useCallback(() => {
    resizingPanelRef.current = true;
    setIsResizingPanel(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);
  
  const beginResizeDock = useCallback(() => {
    resizingDockRef.current = true;
    setIsResizingDock(true);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    document.body.classList.toggle("resizingDock", isResizingDock);
    document.body.classList.toggle("resizingPanel", isResizingPanel);
    return () => {
      document.body.classList.remove("resizingDock", "resizingPanel");
    };
  }, [isResizingDock, isResizingPanel]);

  /** Helpers for draw order with pseudo layers */
  const ensureInDrawOrder = useCallback((id: string, toTop = true) => {
    setLayerDrawOrder((prev) => {
      const next = prev.filter((x) => x !== id);
      if (toTop) return [...next, id];
      return [id, ...next];
    });
  }, []);

  const removeFromDrawOrder = useCallback((id: string) => {
    setLayerDrawOrder((prev) => prev.filter((x) => x !== id));
  }, []);

  // ✅ USER LOCATION
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);

  // ✅ MEASURE TOOL
  const [measureActive, setMeasureActive] = useState(false);
  const [measureHover, setMeasureHover] = useState<{ lat: number; lng: number } | null>(null);
  const [measureFixedTo, setMeasureFixedTo] = useState<{ lat: number; lng: number } | null>(null);

  const requestUserLocation = useCallback(() => {
    if (typeof window === "undefined") return;

    if (!("geolocation" in navigator)) {
      showToast("error", "Geolocation is not supported by this browser.");
      return;
    }

    setLocLoading(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;

        setUserLoc({ lat, lng, accuracy });
        ensureInDrawOrder(MY_LOC_LAYER_ID, true);
        setDesktopTab("selected");
        showToast("success", "Location found.");
        requestZoomToLocation(); // ✅ ADD THIS
        setLocLoading(false);
      },
      (err) => {
        const msg =
          err?.code === 1
            ? "Location permission denied."
            : err?.code === 2
              ? "Location unavailable."
              : "Location request timed out.";

        showToast("error", msg);
        setLocLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  }, [showToast, ensureInDrawOrder]);



  
  const requestZoomToLocation = useCallback(() => {
    setZoomTo({ type: "location", nonce: Date.now() });
  }, []);

  
  // ✅ attribute table
  const [tableOpen, setTableOpen] = useState(true);
  const [tableCollapsed, setTableCollapsed] = useState(true);
  const [tableLayerId, setTableLayerId] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");

  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(50);

  const [selectedFeatureIdxByLayer, setSelectedFeatureIdxByLayer] = useState<Record<string, Set<number>>>({});
  const [featureColorByLayer, setFeatureColorByLayer] = useState<Record<string, Record<number, string>>>({});

  const [tableColor, setTableColor] = useState(DEFAULT_TABLE_COLOR);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await fetch("/api/layers", { cache: "no-store" });
      const text = await r.text();
      const j: any = safeJsonParse(text);
      if (!j.ok) throw new Error(j.error || "Failed to load layers");

      const rows: LayerRow[] = j.layers || [];

      setLayerDrawOrder((prev) => {
        const valid = new Set(rows.map((r) => r.id));
        return prev.filter((id) => id === MY_LOC_LAYER_ID || id === MEASURE_LAYER_ID || valid.has(id));
      });

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
            _geoMode: old?._geoMode,
          };
        });
      });

      showToast("info", "Layers refreshed.");
    } catch (e: any) {
      showToast("error", e?.message ?? "Failed to load layers");
    } finally {
      setLoadingList(false);
      setBooting(false);
    }
  }, [showToast]);

  const loadGeojson = useCallback(
    async (layerId: string, mode: "map" | "full" = "map") => {
      if (layerId === MY_LOC_LAYER_ID || layerId === MEASURE_LAYER_ID) return;

      abortersRef.current[layerId]?.abort();
      const ac = new AbortController();
      abortersRef.current[layerId] = ac;

      setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, loading: true, error: undefined } : l)));

      try {
        const r = await fetch(`/api/layers/${layerId}/geojson?mode=${mode}`, {
          cache: "no-store",
          signal: ac.signal,
        });

        const text = await r.text();
        const j: any = safeJsonParse(text);
        if (j?.ok === false) throw new Error(j.error || "Failed to load GeoJSON");

        const fc = coerceFeatureCollection(j);
        if (!fc) throw new Error("API did not return a GeoJSON FeatureCollection.");

        setLayers((prev) =>
          prev.map((l) =>
            l.id === layerId
              ? {
                  ...l,
                  geojson: fc,
                  loading: false,
                  _geoMode: mode,
                }
              : l
          )
        );

        setSelectedFeatureIdxByLayer((prev) => {
          const cur = prev[layerId] ?? new Set<number>();
          const max = Array.isArray(fc?.features) ? fc.features.length : 0;
          return { ...prev, [layerId]: clampSelected(cur, max) };
        });

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
        const msg = e?.message ?? "Failed to load";
        setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, loading: false, error: msg } : l)));
        showToast("error", msg);
      }
    },
    [showToast]
  );


  

  const requestZoomToLayer = useCallback(
    async (layerId: string) => {
      // if geojson missing, load it first
      const cur = layersRef.current.find((l) => l.id === layerId);
      if (!cur) return;
  
      if (!cur.geojson && !cur.loading) {
        await loadGeojson(layerId, "full");
      } else if (cur.geojson && cur._geoMode !== "full" && !cur.loading) {
        await loadGeojson(layerId, "full");
      }
  
      setZoomTo({ type: "layer", layerId, nonce: Date.now() });
    },
    [loadGeojson]
  );
  

  const toggleLayer = useCallback(
    async (layerId: string, nextVisible: boolean) => {
      if (layerId === MY_LOC_LAYER_ID) {
        if (!nextVisible) {
          setUserLoc(null);
          removeFromDrawOrder(MY_LOC_LAYER_ID);
          showToast("info", "My Location removed.");
        } else {
          if (!userLoc) {
            showToast("info", "Click the location button to get your location first.");
            return;
          }
          ensureInDrawOrder(MY_LOC_LAYER_ID, true);
        }
        return;
      }
      if (layerId === MEASURE_LAYER_ID) {
        if (!nextVisible) {
          setMeasureActive(false);
          setMeasureHover(null);
          setMeasureFixedTo(null);
          removeFromDrawOrder(MEASURE_LAYER_ID);
          showToast("info", "Measure removed.");
        } else {
          ensureInDrawOrder(MEASURE_LAYER_ID, true);
        }
        return;
      }

      setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, visible: nextVisible } : l)));

      setLayerDrawOrder((prev) => {
        if (nextVisible) {
          const without = prev.filter((id) => id !== layerId);
          return [...without, layerId];
        }
        return prev.filter((id) => id !== layerId);
      });

      if (nextVisible) {
        const cur = layersRef.current.find((l) => l.id === layerId);
        if (!cur) return;

        if (!cur.geojson && !cur.loading) {
          await loadGeojson(layerId, "full");
          return;
        }
        if (cur.geojson && cur._geoMode !== "full" && !cur.loading) {
          await loadGeojson(layerId, "full");
        }
      }
    },
    [loadGeojson, ensureInDrawOrder, removeFromDrawOrder, showToast, userLoc]
  );

  const selectFiltered = useCallback(
    (next: boolean, filteredIds: string[]) => {
      const ids = new Set(filteredIds);
      setLayers((prev) => prev.map((l) => (ids.has(l.id) ? { ...l, visible: next } : l)));

      if (next) {
        const snapshot = layersRef.current;
        const missing = snapshot
          .filter((l) => ids.has(l.id) && (!l.geojson || l._geoMode !== "full") && !l.loading)
          .slice(0, 10);
        missing.forEach((m) => loadGeojson(m.id, "full"));

        setLayerDrawOrder((prev) => {
          const base = prev.filter((id) => id === MY_LOC_LAYER_ID || id === MEASURE_LAYER_ID || !ids.has(id));
          const add = filteredIds.filter((id) => ids.has(id));
          const merged = [...base, ...add];
          const out: string[] = [];
          for (const id of merged) {
            const i = out.indexOf(id);
            if (i !== -1) out.splice(i, 1);
            out.push(id);
          }
          return out;
        });
      } else {
        setLayerDrawOrder((prev) => prev.filter((id) => !ids.has(id)));
      }
    },
    [loadGeojson]
  );

  const clearAll = useCallback(() => {
    setLayers((prev) => prev.map((l) => ({ ...l, visible: false })));
    setLayerDrawOrder((prev) => prev.filter((id) => id === MY_LOC_LAYER_ID || id === MEASURE_LAYER_ID));
  }, []);

  const moveLayer = useCallback((layerId: string, dir: "top" | "up" | "down" | "bottom") => {
    setLayerDrawOrder((prev) => {
      const cur = prev.length ? [...prev] : [];
      const idx0 = cur.indexOf(layerId);
      if (idx0 === -1) cur.push(layerId);

      const idx = cur.indexOf(layerId);
      if (idx === -1) return cur;

      cur.splice(idx, 1);

      if (dir === "top") cur.push(layerId);
      else if (dir === "bottom") cur.unshift(layerId);
      else if (dir === "up") cur.splice(Math.min(cur.length, idx + 1), 0, layerId);
      else cur.splice(Math.max(0, idx - 1), 0, layerId);

      return cur;
    });
  }, []);


  useEffect(() => {
    const t = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
    return () => window.clearTimeout(t);
  }, [panelWidth, dockHeight, tableCollapsed, isMobile, mobilePanelOpen]);

  useEffect(() => {
    if (!tableOpen) return;
    setTablePage(1);
  }, [tableOpen, tableLayerId, tableSearch]);

  const openAttributeTable = useCallback(
    (layerId: string) => {
      if (layerId === MY_LOC_LAYER_ID || layerId === MEASURE_LAYER_ID) return;

      setTableLayerId(layerId);
      setTableOpen(true);
      setTableCollapsed(false);
      setTableColor(DEFAULT_TABLE_COLOR);
      setTableSearch("");

      const cur = layersRef.current.find((l) => l.id === layerId);
      if (cur && (!cur.geojson || cur._geoMode !== "full") && !cur.loading) loadGeojson(layerId, "full");
    },
    [loadGeojson]
  );

  // ✅ when user clicks a layer in Selected: zoom + auto-open table
  const activateSelectedLayer = useCallback(
    async (layerId: string) => {
      if (layerId === MY_LOC_LAYER_ID) {
        if (userLoc) requestZoomToLocation();
        else showToast("info", "Click the location button first.");
        return;
      }
      if (layerId === MEASURE_LAYER_ID) return;

      await requestZoomToLayer(layerId); // ensures geojson full + zoom request
      openAttributeTable(layerId);       // opens + loads attribute table
    },
    [requestZoomToLayer, openAttributeTable, userLoc, requestZoomToLocation, showToast]
  );


  const toggleFeatureSelection = useCallback((layerId: string, idx: number, next: boolean) => {
    setSelectedFeatureIdxByLayer((prev) => {
      const cur = new Set(prev[layerId] ?? []);
      if (next) cur.add(idx);
      else cur.delete(idx);
      return { ...prev, [layerId]: cur };
    });
  }, []);

  const clearSelectedFeaturesInLayer = useCallback((layerId: string) => {
    setSelectedFeatureIdxByLayer((prev) => ({ ...prev, [layerId]: new Set<number>() }));
  }, []);

  const colorRows = useCallback((layerId: string, idxs: number[], color: string) => {
    if (!layerId || !idxs.length) return;
    setFeatureColorByLayer((prev) => {
      const cur = { ...(prev[layerId] ?? {}) };
      for (const idx of idxs) cur[idx] = color;
      return { ...prev, [layerId]: cur };
    });
  }, []);

  const clearColorForRows = useCallback((layerId: string, idxs: number[]) => {
    if (!layerId || !idxs.length) return;
    setFeatureColorByLayer((prev) => {
      const cur = { ...(prev[layerId] ?? {}) };
      for (const idx of idxs) delete cur[idx];
      return { ...prev, [layerId]: cur };
    });
  }, []);

  const colorRow = useCallback((layerId: string, idx: number, color: string) => {
    setFeatureColorByLayer((prev) => {
      const cur = { ...(prev[layerId] ?? {}) };
      cur[idx] = color;
      return { ...prev, [layerId]: cur };
    });
  }, []);

  const clearRowColor = useCallback((layerId: string, idx: number) => {
    setFeatureColorByLayer((prev) => {
      const cur = { ...(prev[layerId] ?? {}) };
      delete cur[idx];
      return { ...prev, [layerId]: cur };
    });
  }, []);

  const clearAllColorsForLayer = useCallback((layerId: string) => {
    setFeatureColorByLayer((prev) => ({ ...prev, [layerId]: {} }));
  }, []);

  useEffect(() => {
    refreshList();
    return () => Object.values(abortersRef.current).forEach((a) => a.abort());
  }, [refreshList]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    const base = !q
      ? layers
      : layers.filter((l) => `${l.name} ${l.geom_type ?? ""} ${l.srid ?? ""}`.toLowerCase().includes(q));

    return [...base].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [layers, search]);

  const filteredIds = useMemo(() => filtered.map((l) => l.id), [filtered]);

  // ✅ GROUPED LIST (based on filtered/search result)
const groupedFiltered = useMemo(() => {
  const map = new Map<GroupKey, MapLayer[]>();

  for (const l of filtered) {
    const g = getLayerGroup(l.name) as GroupKey;
    const arr = map.get(g) ?? [];
    arr.push(l);
    map.set(g, arr);
  }

  // sort inside each group
  for (const [k, arr] of map.entries()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    map.set(k, arr);
  }

  // output ordered groups (only those with items)
  return GROUP_ORDER.map((k) => ({ key: k, items: map.get(k) ?? [] })).filter((g) => g.items.length > 0);
}, [filtered]);

  const measureTo = measureFixedTo ?? measureHover;

  const userLocGeojson = useMemo(() => {
    if (!userLoc) return null;

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "me",
          properties: {
            __fid: "me",
            __color: "#ef4444",
            __marker: "dot",
            label: "My Location",
            accuracy_m: userLoc.accuracy ?? null,
          },
          geometry: { type: "Point", coordinates: [userLoc.lng, userLoc.lat] },
        },
      ],
    };
  }, [userLoc]);

  const measureLineGeojson = useMemo(() => {
    if (!measureActive) return null;
    if (!userLoc) return null;
    if (!measureTo) return null;

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "measure-line",
          properties: { __fid: "measure-line", __color: "#ef4444", label: "Distance" },
          geometry: {
            type: "LineString",
            coordinates: [
              [userLoc.lng, userLoc.lat],
              [measureTo.lng, measureTo.lat],
            ],
          },
        },
        {
          type: "Feature",
          id: "measure-to",
          properties: { __fid: "measure-to", __color: "#ef4444", __marker: "dot", label: "Destination" },
          geometry: { type: "Point", coordinates: [measureTo.lng, measureTo.lat] },
        },
      ],
    };
  }, [measureActive, userLoc, measureTo]);

  useEffect(() => {
    if (measureLineGeojson) ensureInDrawOrder(MEASURE_LAYER_ID, true);
    else removeFromDrawOrder(MEASURE_LAYER_ID);
  }, [measureLineGeojson, ensureInDrawOrder, removeFromDrawOrder]);

  useEffect(() => {
    if (userLocGeojson) ensureInDrawOrder(MY_LOC_LAYER_ID, true);
    else removeFromDrawOrder(MY_LOC_LAYER_ID);
  }, [userLocGeojson, ensureInDrawOrder, removeFromDrawOrder]);

  const measureDistance = useMemo(() => {
    if (!userLoc || !measureTo) return null;
    return haversineMeters({ lat: userLoc.lat, lng: userLoc.lng }, { lat: measureTo.lat, lng: measureTo.lng });
  }, [userLoc, measureTo]);

  const visibleLayers = useMemo(() => {
    const byId = new Map(layers.map((l) => [l.id, l] as const));
    const orderedReal: MapLayer[] = [];

    for (const id of layerDrawOrder) {
      const l = byId.get(id);
      if (l?.visible && l.geojson) orderedReal.push(l);
    }
    for (const l of layers) {
      if (l.visible && l.geojson && !layerDrawOrder.includes(l.id)) orderedReal.push(l);
    }

    const processed = orderedReal.map((l) => {
      const fc = l.geojson;
      const features = Array.isArray(fc?.features) ? fc.features : [];
      const selected = selectedFeatureIdxByLayer[l.id] ?? new Set<number>();
      const colorOverrides = featureColorByLayer[l.id] ?? {};

      const needsFilter = selected.size > 0;
      const hasOverrides = Object.keys(colorOverrides).length > 0;

      if (!needsFilter && !hasOverrides) return l;

      const nextFeatures: any[] = [];
      for (let idx = 0; idx < features.length; idx++) {
        if (needsFilter && !selected.has(idx)) continue;

        const f = features[idx];
        const c = colorOverrides[idx];
        if (c) nextFeatures.push({ ...f, properties: { ...(f?.properties ?? {}), __color: c } });
        else nextFeatures.push(f);
      }

      return { ...l, geojson: { ...fc, features: nextFeatures } };
    });

    return processed;
  }, [layers, layerDrawOrder, selectedFeatureIdxByLayer, featureColorByLayer]);

  const mapLayersInput = useMemo(() => {
    type Input = {
      id: string;
      name?: string;
      color?: string;
      geom_type?: string | null;
      geojson: any;
      orderNo?: number;
    };

    const byReal = new Map(
      visibleLayers.map((v) => [
        v.id,
        {
          id: v.id,
          name: v.name,
          color: DEFAULT_LAYER_COLOR,
          geom_type: v.geom_type,
          geojson: v.geojson,
        } as Input,
      ])
    );

    const pseudo: Record<string, Input | null> = {
      [MY_LOC_LAYER_ID]: userLocGeojson
        ? {
            id: MY_LOC_LAYER_ID,
            name: "My Location",
            color: "#ef4444",
            geom_type: "Point",
            geojson: userLocGeojson,
          }
        : null,
      [MEASURE_LAYER_ID]: measureLineGeojson
        ? {
            id: MEASURE_LAYER_ID,
            name: "Measure",
            color: "#ef4444",
            geom_type: "LineString",
            geojson: measureLineGeojson,
          }
        : null,
    };

    const orderedIds: string[] = [];

    for (const id of layerDrawOrder) {
      if (byReal.has(id)) orderedIds.push(id);
      else if (pseudo[id]) orderedIds.push(id);
    }

    for (const v of visibleLayers) if (!orderedIds.includes(v.id)) orderedIds.push(v.id);
    if (pseudo[MY_LOC_LAYER_ID] && !orderedIds.includes(MY_LOC_LAYER_ID)) orderedIds.push(MY_LOC_LAYER_ID);
    if (pseudo[MEASURE_LAYER_ID] && !orderedIds.includes(MEASURE_LAYER_ID)) orderedIds.push(MEASURE_LAYER_ID);

    const out: Input[] = [];
    orderedIds.forEach((id, i) => {
      if (byReal.has(id)) out.push({ ...(byReal.get(id) as any), orderNo: i + 1 });
      else if (pseudo[id]) out.push({ ...(pseudo[id] as any), orderNo: i + 1 });
    });

    return out;
  }, [visibleLayers, userLocGeojson, measureLineGeojson, layerDrawOrder]);

  const visibleCount = useMemo(() => layers.filter((l) => l.visible).length, [layers]);
  const loadedCount = useMemo(() => layers.filter((l) => l.visible && l.geojson).length, [layers]);

  const layerOrderNumberById = useMemo(() => {
    const byId = new Map(layers.map((l) => [l.id, l] as const));
    const activeIds: string[] = [];

    for (const id of layerDrawOrder) {
      if (id === MY_LOC_LAYER_ID && userLocGeojson) activeIds.push(id);
      else if (id === MEASURE_LAYER_ID && measureLineGeojson) activeIds.push(id);
      else if (byId.get(id)?.visible) activeIds.push(id);
    }
    for (const l of layers) if (l.visible && !activeIds.includes(l.id)) activeIds.push(l.id);
    if (userLocGeojson && !activeIds.includes(MY_LOC_LAYER_ID)) activeIds.push(MY_LOC_LAYER_ID);
    if (measureLineGeojson && !activeIds.includes(MEASURE_LAYER_ID)) activeIds.push(MEASURE_LAYER_ID);

    const topToBottom = [...activeIds].reverse();
    const m: Record<string, number> = {};
    topToBottom.forEach((id, i) => (m[id] = i + 1));
    return m;
  }, [layers, layerDrawOrder, userLocGeojson, measureLineGeojson]);

  const hasAnyVisibleFiltered = useMemo(() => filtered.some((l) => l.visible), [filtered]);
  const hasAllVisibleFiltered = useMemo(() => filtered.length > 0 && filtered.every((l) => l.visible), [filtered]);

  const selectedLayersOrdered = useMemo(() => {
    const byId = new Map(layers.map((l) => [l.id, l] as const));

    const idsBottomToTop: string[] = [];

    for (const id of layerDrawOrder) {
      if (id === MY_LOC_LAYER_ID) {
        if (userLocGeojson) idsBottomToTop.push(id);
        continue;
      }
      if (id === MEASURE_LAYER_ID) {
        if (measureLineGeojson) idsBottomToTop.push(id);
        continue;
      }
      const l = byId.get(id);
      if (l?.visible) idsBottomToTop.push(id);
    }

    for (const l of layers) {
      if (l.visible && !idsBottomToTop.includes(l.id)) idsBottomToTop.push(l.id);
    }
    if (userLocGeojson && !idsBottomToTop.includes(MY_LOC_LAYER_ID)) idsBottomToTop.push(MY_LOC_LAYER_ID);
    if (measureLineGeojson && !idsBottomToTop.includes(MEASURE_LAYER_ID)) idsBottomToTop.push(MEASURE_LAYER_ID);

    const topToBottom = [...idsBottomToTop].reverse();

    return topToBottom
      .map((id) => {
        if (id === MY_LOC_LAYER_ID) {
          return {
            id: MY_LOC_LAYER_ID,
            name: "My Location",
            geom_type: "Point" as any,
            srid: null as any,
            visible: true,
            geojson: userLocGeojson,
            loading: locLoading,
            _geoMode: "map" as any,
          } as MapLayer;
        }
        if (id === MEASURE_LAYER_ID) {
          return {
            id: MEASURE_LAYER_ID,
            name: "Measure",
            geom_type: "LineString" as any,
            srid: null as any,
            visible: true,
            geojson: measureLineGeojson,
            loading: false,
            _geoMode: "map" as any,
          } as MapLayer;
        }
        return byId.get(id) as MapLayer;
      })
      .filter(Boolean);
  }, [layers, layerDrawOrder, userLocGeojson, measureLineGeojson, locLoading]);

  const tableLayer = useMemo(() => layers.find((l) => l.id === tableLayerId) ?? null, [layers, tableLayerId]);

  const tableData = useMemo(() => {
    if (!tableOpen) return { columns: [] as string[], rows: [] as any[] };
    if (!tableLayer?.geojson) return { columns: [] as string[], rows: [] as any[] };
    return extractAttributesWithIds(tableLayer.geojson);
  }, [tableOpen, tableLayer?.geojson]);

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

  const tableFilteredCount = tableFilteredRows.length;

  const tablePageCount = useMemo(() => {
    return Math.max(1, Math.ceil(tableFilteredCount / Math.max(1, tablePageSize)));
  }, [tableFilteredCount, tablePageSize]);

  const tablePageSafe = useMemo(() => {
    return Math.min(Math.max(1, tablePage), tablePageCount);
  }, [tablePage, tablePageCount]);

  const tablePagedRows = useMemo(() => {
    const start = (tablePageSafe - 1) * tablePageSize;
    const end = start + tablePageSize;
    return tableFilteredRows.slice(start, end);
  }, [tableFilteredRows, tablePageSafe, tablePageSize]);

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

    const locSig = userLoc ? `${userLoc.lat.toFixed(6)},${userLoc.lng.toFixed(6)}` : "none";
    const measureSig = `${measureActive ? "1" : "0"}|${measureTo ? `${measureTo.lat.toFixed(6)},${measureTo.lng.toFixed(6)}` : "none"}`;

    return `${mapLayersInput.length}-${hashString(selSig)}-${hashString(clrSig)}-${hashString(locSig)}-${hashString(measureSig)}`;
  }, [mapLayersInput.length, selectedFeatureIdxByLayer, featureColorByLayer, userLoc, measureActive, measureTo]);

  const overlayTitle = useMemo(() => {
    if (booting) return "Loading layers…";
    if (loadingList) return "Refreshing layers…";
    return "";
  }, [booting, loadingList]);

  const showOverlay = booting || loadingList;

  const pickAllRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!pickAllRef.current) return;
    pickAllRef.current.indeterminate = !allFilteredSelected && someFilteredSelected;
  }, [allFilteredSelected, someFilteredSelected]);

  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme") === "dark";
    setDarkMode(saved);
    document.documentElement.setAttribute("data-theme", saved ? "dark" : "light");
  }, []);
  
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

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

  const handleFeatureClick = useCallback(
    (fid: string) => {
      if (fid !== "me") return;
      if (!userLoc) {
        showToast("info", "Click the location button first.");
        return;
      }
      setMeasureActive(true);
      setMeasureFixedTo(null);
      setMeasureHover(null);
      showToast("info", "Move your mouse on the map, then click to set destination.");
    },
    [userLoc, showToast]
  );

  const onMapMouseMove = useCallback(
    (lat: number, lng: number) => {
      if (!measureActive) return;
      if (measureFixedTo) return;
      setMeasureHover({ lat, lng });
    },
    [measureActive, measureFixedTo]
  );

  const onMapClick = useCallback(
    (lat: number, lng: number) => {
      if (!measureActive) return;
      if (!userLoc) return;
      setMeasureFixedTo({ lat, lng });
      const d = haversineMeters({ lat: userLoc.lat, lng: userLoc.lng }, { lat, lng });
      showToast("success", `Distance: ${formatDistance(d)}`);
    },
    [measureActive, userLoc, showToast]
  );

  const clearMeasure = useCallback(() => {
    setMeasureActive(false);
    setMeasureHover(null);
    setMeasureFixedTo(null);
  }, []);

  const selectedCountForLayer = useCallback(
    (layerId: string) => selectedFeatureIdxByLayer[layerId]?.size ?? 0,
    [selectedFeatureIdxByLayer]
  );

  const addLayerFromAllList = useCallback(
    async (layerId: string) => {
      const cur = layersRef.current.find((l) => l.id === layerId);
      if (!cur) return;
  
      // if already visible, just open the table
      if (cur.visible) {
        openAttributeTable(layerId);
        setDesktopTab("selected");
        return;
      }
  
      // turn it on, then auto-open table
      await toggleLayer(layerId, true);
      setDesktopTab("selected");
      openAttributeTable(layerId);
    },
    [toggleLayer, openAttributeTable]
  );

  /** ✅ Mobile: don’t let “Layers” floating button cover the table */
  const showMobileFab = useMemo(() => {
    if (!isMobile) return false;
    // Hide FAB when attribute table sheet is open/expanded to avoid overlap
    if (!tableCollapsed && tableLayerId) return false;
    // Also hide when layers sheet is already open
    if (mobilePanelOpen) return false;
    return true;
  }, [isMobile, tableCollapsed, tableLayerId, mobilePanelOpen]);

  return (
    <div className="shell">
      {toast.show ? (
        <div className="toast" role="status" aria-live="polite">
          <span className={`dot ${toast.type}`} />
          <div style={{ lineHeight: 1.2 }}>{toast.message}</div>
        </div>
      ) : null}

      {showOverlay && overlayTitle ? (
        <OverlaySpinner title={overlayTitle} subtitle="Please wait… we’re processing your request." />
      ) : null}

      <style>{`
        :root{
          --bg0:#ffffff;
          --bg1:#f6f7fb;

          --panel:#ffffff;

          --text:#0b1220;
          --muted: rgba(11,18,32,.58);

          --stroke: rgba(11,18,32,.10);
          --stroke2: rgba(11,18,32,.16);

          --shadow: 0 14px 40px rgba(11,18,32,.10);
          --shadow2: 0 30px 90px rgba(11,18,32,.14);

          --primary:#0f7a3a;
          --primaryBg: rgba(15,122,58,.10);

          --blue:#1166cc;
          --blueBg: rgba(17,102,204,.10);

          --danger:#d92d20;
          --dangerBg: rgba(217,45,32,.10);
        }

        [data-theme="dark"] {
  --bg0: #0d1117;
  --bg1: #161b22;
  --panel: #161b22;
  --text: #e6edf3;
  --muted: rgba(230,237,243,.55);
  --stroke: rgba(230,237,243,.10);
  --stroke2: rgba(230,237,243,.18);
  --shadow: 0 14px 40px rgba(0,0,0,.40);
  --shadow2: 0 30px 90px rgba(0,0,0,.50);
  --primaryBg: rgba(15,122,58,.18);
  --blueBg: rgba(17,102,204,.18);
  --dangerBg: rgba(217,45,32,.18);
}

[data-theme="dark"] body {
  background:
    radial-gradient(900px 560px at 14% 0%, rgba(15,122,58,.10), transparent 60%),
    radial-gradient(900px 560px at 88% 12%, rgba(17,102,204,.10), transparent 60%),
    linear-gradient(180deg, var(--bg0), var(--bg1));
}

[data-theme="dark"] .topBar,
[data-theme="dark"] .mapHead,
[data-theme="dark"] .dockTop,
[data-theme="dark"] .tableBar {
  background: rgba(22,27,34,.88);
}

[data-theme="dark"] .panel,
[data-theme="dark"] .mapStack,
[data-theme="dark"] .dock {
  background: rgba(22,27,34,.92);
}

[data-theme="dark"] .miniItem,
[data-theme="dark"] .btn,
[data-theme="dark"] .pill,
[data-theme="dark"] .chip,
[data-theme="dark"] .searchWrap,
[data-theme="dark"] .seg,
[data-theme="dark"] .groupBlock,
[data-theme="dark"] .groupHeader {
  background: rgba(22,27,34,.92);
  border-color: rgba(230,237,243,.10);
  color: var(--text);
}

[data-theme="dark"] .seg.active {
  background: rgba(30,37,48,.96);
  border-color: rgba(230,237,243,.14);
  color: var(--text);
}

[data-theme="dark"] th {
  background: rgba(22,27,34,.98);
  color: rgba(230,237,243,.88);
  border-bottom-color: rgba(230,237,243,.12);
}

[data-theme="dark"] td {
  color: rgba(230,237,243,.80);
  border-bottom-color: rgba(230,237,243,.08);
}

[data-theme="dark"] tbody tr:hover td {
  background: rgba(15,122,58,.08);
}

[data-theme="dark"] tbody tr.rowSelected td {
  background: rgba(15,122,58,.14) !important;
}

[data-theme="dark"] .toast,
[data-theme="dark"] .profileMenu,
[data-theme="dark"] .overlayCard {
  background: rgba(22,27,34,.96);
  border-color: rgba(230,237,243,.10);
  color: var(--text);
}

[data-theme="dark"] .profileName,
[data-theme="dark"] .profileItem {
  color: var(--text);
}

[data-theme="dark"] .profileItem:hover {
  background: rgba(15,122,58,.10);
}

[data-theme="dark"] .profileDivider {
  background: rgba(230,237,243,.08);
}

[data-theme="dark"] .searchInput {
  color: var(--text);
}

[data-theme="dark"] .tableWrap {
  background: rgba(13,17,23,.04);
}

[data-theme="dark"] .featureCard {
  background: #161b22;
  border-color: rgba(230,237,243,.10);
}

[data-theme="dark"] .sheet {
  background: rgba(22,27,34,.98);
}

[data-theme="dark"] .tab {
  background: rgba(22,27,34,.92);
  border-color: rgba(230,237,243,.10);
  color: var(--text);
}

[data-theme="dark"] .tab.active {
  border-color: rgba(15,122,58,.28);
  background: rgba(15,122,58,.14);
}

[data-theme="dark"] .avatar {
  background: rgba(15,122,58,.18);
}

[data-theme="dark"] select.btn {
  background: rgba(22,27,34,.92);
  color: var(--text);
}
[data-theme="dark"] .overlaySaving {
  background: rgba(0,0,0,.65);
}

[data-theme="dark"] .overlayCard {
  background: rgba(22,27,34,.98);
  border-color: rgba(230,237,243,.12);
}

[data-theme="dark"] .overlayTitle {
  color: rgba(230,237,243,.92);
}

[data-theme="dark"] .overlaySub {
  color: rgba(230,237,243,.58);
}

[data-theme="dark"] .overlayHint {
  background: rgba(255,255,255,.04);
  border-color: rgba(230,237,243,.12);
  color: rgba(230,237,243,.55);
}

[data-theme="dark"] .overlayIcon {
  background: rgba(255,255,255,.04);
  border-color: rgba(230,237,243,.10);
}

[data-theme="dark"] .shimmer {
  background: linear-gradient(90deg, rgba(230,237,243,.06), rgba(230,237,243,.12), rgba(230,237,243,.06));
  background-size: 200% 100%;
}

[data-theme="dark"] .ring {
  border-color: rgba(230,237,243,.14);
  border-top-color: var(--blue);
}

[data-theme="dark"] .listWrap > div {
  color: var(--text);
}
[data-theme="dark"] .groupToggle {
  color: rgba(230,237,243,.55);
}

[data-theme="dark"] .groupTitle {
  color: rgba(230,237,243,.88);
}

[data-theme="dark"] .groupBadge {
  background: rgba(15,122,58,.18);
  border-color: rgba(15,122,58,.30);
  color: rgba(15,122,58,.95);
}

[data-theme="dark"] .groupBlock {
  background: rgba(22,27,34,.75);
  border-color: rgba(230,237,243,.08);
}

[data-theme="dark"] .groupHeader {
  background: rgba(22,27,34,.92);
}

[data-theme="dark"] .groupHeader:hover {
  background: rgba(15,122,58,.10);
}

[data-theme="dark"] .miniName {
  color: rgba(230,237,243,.88);
}

[data-theme="dark"] .miniMeta {
  color: rgba(230,237,243,.45);
}

[data-theme="dark"] .miniNameBtn {
  color: var(--text);
}

[data-theme="dark"] .badgeOn {
  background: rgba(15,122,58,.18);
  border-color: rgba(15,122,58,.30);
  color: rgba(15,122,58,.95);
}

[data-theme="dark"] .err {
  background: rgba(217,45,32,.12);
  border-color: rgba(217,45,32,.22);
  color: rgba(255,180,170,.90);
}




        html, body { height:100%; margin:0; }
        html, body{
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial,
            "Apple Color Emoji","Segoe UI Emoji";
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        body{
          color: var(--text);
          overflow:hidden;
          background:
            radial-gradient(900px 560px at 14% 0%, rgba(15,122,58,.08), transparent 60%),
            radial-gradient(900px 560px at 88% 12%, rgba(17,102,204,.08), transparent 60%),
            linear-gradient(180deg, var(--bg0), var(--bg1));
        }
        *{ box-sizing:border-box; }
        b{ font-weight: 650; }
        ::selection{ background: rgba(15,122,58,.16); }

        .shell{ height:100vh; width:100%; display:flex; flex-direction:column; }

        .ring{
          display:inline-block;
          border-radius: 999px;
          border: 2px solid rgba(11,18,32,.14);
          border-top-color: var(--blue);
          box-shadow: 0 0 0 6px var(--blueBg);
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

        .topBar{
          height: 56px;
          padding: 0 12px;
          border-bottom: 1px solid var(--stroke);
          background: rgba(255,255,255,.86);
          backdrop-filter: blur(14px);
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          position: relative;
          z-index: 70000;
        }
        .brand{ display:flex; align-items:center; gap:10px; min-width:0; }
        .appIcon{
          width: 36px; height: 36px;
          border-radius: 14px;
          border: 1px solid rgba(11,18,32,.10);
          background: rgba(255,255,255,.92);
          box-shadow: 0 16px 40px rgba(11,18,32,.10);
          display:flex; align-items:center; justify-content:center;
        }
        .titleWrap{ display:flex; flex-direction:column; gap:1px; min-width:0; }
        .title{ font-size: 14px; font-weight: 650; letter-spacing: -.2px; line-height: 1.1; white-space:nowrap; overflow:hidden; text-overflow: ellipsis; }
        .subtitle{ font-size: 11px; font-weight: 520; color: var(--muted); white-space:nowrap; overflow:hidden; text-overflow: ellipsis; }

        .pill{
          font-size: 11px;
          font-weight: 520;
          color: rgba(11,18,32,.72);
          border: 1px solid var(--stroke);
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,.90);
          display:inline-flex;
          align-items:center;
          gap:8px;
          white-space:nowrap;
        }

        .btn{
          border: 1px solid var(--stroke);
          background: rgba(255,255,255,.92);
          color: var(--text);
          font-weight: 560;
          cursor: pointer;
          display:inline-flex;
          align-items:center;
          gap:8px;
          user-select:none;
          transition: transform .10s ease, border-color .15s ease, box-shadow .15s ease, background .15s ease;
          padding: 8px 10px;
          border-radius: 14px;
          font-size: 11px;
        }
        .btn:hover{
          border-color: var(--stroke2);
          box-shadow: 0 12px 28px rgba(11,18,32,.10);
          transform: translateY(-1px);
        }
        .btn:active{ transform: translateY(0); }
        .btn:focus-visible{
          outline: 3px solid rgba(15,122,58,.20);
          outline-offset: 2px;
        }
        .btn[disabled]{ opacity: .55; cursor: not-allowed; transform:none; box-shadow:none; }
        .btnPrimary{
          border-color: rgba(15,122,58,.24);
          background: linear-gradient(180deg, rgba(15,122,58,.08), rgba(255,255,255,.92));
        }
        .btnDanger{
          border-color: rgba(217,45,32,.22);
          background: linear-gradient(180deg, rgba(217,45,32,.07), rgba(255,255,255,.92));
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
          border-radius: 999px;
        }

        .main{
          flex:1;
          min-height:0;
          display:grid;
          grid-template-columns: 1fr;
          gap: 12px;
          padding: 12px;
          position: relative;
        }

        .panel, .mapStack{
          border: 1px solid var(--stroke);
          border-radius: 20px;
          background: rgba(255,255,255,.92);
          box-shadow: var(--shadow);
          display:flex;
          flex-direction:column;
          min-height:0;
          overflow:hidden;
        }

        /* ✅ Desktop split layout (resizable) */
        .split{
          flex:1;
          min-height:0;
          display:grid;
          grid-template-columns: var(--panelW) 10px 1fr;
          gap: 0;
        }
        .split > .panel{ grid-column: 1; }
        .split > .splitterWrap{ grid-column: 2; display:flex; align-items:stretch; justify-content:center; }
        .split > .mapStack{ grid-column: 3; }

        .splitter{
          width: 10px;
          cursor: col-resize;
          position: relative;
          display:flex;
          align-items:center;
          justify-content:center;
        }
        .splitter::before{
          content:"";
          width: 4px;
          height: 100%;
          border-radius: 999px;
          background: rgba(11,18,32,.08);
          transition: background .15s ease;
        }
        .splitter:hover::before{
          background: rgba(15,122,58,.22);
        }
        .splitterGrip{
          position:absolute;
          width: 8px;
          height: 52px;
          border-radius: 999px;
          border: 1px solid rgba(11,18,32,.10);
          background: rgba(255,255,255,.92);
          box-shadow: 0 12px 26px rgba(11,18,32,.10);
          display:flex;
          align-items:center;
          justify-content:center;
          opacity: .85;
        }
        .splitterDots{
          width: 3px;
          height: 24px;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(11,18,32,.18), rgba(11,18,32,.04));
        }

        .panelHead{
          padding: 12px;
          border-bottom: 1px solid var(--stroke);
          display:flex;
          flex-direction:column;
          gap:10px;
        }

        .headRow{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .headLeft{ display:flex; align-items:center; gap:10px; min-width:0; flex-wrap:wrap; }
        .sectionTitle{
          font-size: 13px;
          font-weight: 650;
          letter-spacing: -0.12px;
          display:flex;
          align-items:center;
          gap:10px;
        }

        /* ✅ Apple-like compact toolbar in header (fixes clutter in circled area) */
        .toolbar{
          display:flex;
          gap:8px;
          align-items:center;
          padding: 6px;
          border: 1px solid var(--stroke);
          border-radius: 16px;
          background: rgba(11,18,32,.03);
        }
        .toolbar .iconBtn{ width: 38px; height: 38px; border-radius: 14px; }
        .toolbar .btn{ box-shadow:none; transform:none; }
        .toolbar .btn:hover{ transform:none; box-shadow:none; }

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
          border-color: rgba(15,122,58,.28);
          box-shadow: 0 0 0 5px rgba(15,122,58,.08);
        }
        .searchInput{
          width:100%;
          border:0;
          outline:0;
          background:transparent;
          font-weight: 520;
          color: var(--text);
          font-size: 12px;
        }

        .segWrap{
          display:flex;
          gap:6px;
          padding: 6px;
          border: 1px solid var(--stroke);
          border-radius: 14px;
          background: rgba(11,18,32,.03);
          width: fit-content;
        }
        .seg{
          border: 1px solid transparent;
          background: transparent;
          padding: 8px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 560;
          cursor: pointer;
          color: rgba(11,18,32,.72);
          display:flex;
          align-items:center;
          gap:8px;
        }
        .seg.active{
          background: rgba(255,255,255,.96);
          border-color: rgba(11,18,32,.10);
          box-shadow: 0 10px 24px rgba(11,18,32,.10);
          color: rgba(11,18,32,.92);
        }

        .listWrap{
          flex:1;
          min-height:0;
          overflow:auto;
          -webkit-overflow-scrolling: touch;
          padding: 10px;
          display:flex;
          flex-direction:column;
          gap:8px;
        }

        
        .miniItem{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          padding: 10px 10px;
          border-radius: 14px;
          border: 1px solid rgba(11,18,32,.08);
          background: rgba(255,255,255,.92);
          transition: transform .10s ease, border-color .15s ease, box-shadow .15s ease, background .15s ease;
        }
        .miniItem:hover{
          border-color: rgba(15,122,58,.14);
          box-shadow: 0 12px 30px rgba(11,18,32,.10);
          transform: translateY(-1px);
        }
        .miniNameBtn{
          border:0;
          background: transparent;
          cursor:pointer;
          padding:0;
          text-align:left;
          min-width:0;
          flex:1;
          display:flex;
          flex-direction:column;
          gap:2px;
        }
        .miniName{
          font-size: 11px;
          font-weight: 620;
          letter-spacing: -.08px;
          white-space:nowrap;
          overflow:hidden;
          text-overflow: ellipsis;
        }
        .miniMeta{
          font-size: 10px;
          font-weight: 480;
          color: rgba(11,18,32,.58);
          white-space:nowrap;
          overflow:hidden;
          text-overflow: ellipsis;
        }

        /* ✅ Narrow sidebar layout: Title on top, buttons below */
        .miniItem.stacked{
          flex-direction: column;
          align-items: stretch;
          gap: 10px;
        }

        .miniItem.stacked .miniNameBtn{
          width: 100%;
        }

        /* allow name to take 2 lines instead of disappearing */
        .miniItem.stacked .miniName{
          white-space: normal;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;      /* ✅ 2 lines max */
          -webkit-box-orient: vertical;
        }

        /* buttons become a second row */
        .miniItem.stacked .miniActions{
          width: 100%;
          justify-content: flex-start;
          flex-wrap: wrap;            /* ✅ wrap buttons if needed */
          overflow: visible;          /* ✅ no horizontal hiding */
          padding-top: 8px;
          border-top: 1px dashed rgba(11,18,32,.12);
        }

        /* ✅ actions stay clean even if panel is narrow */
          .miniActions{
            display:flex;
            align-items:center;
            gap:8px;
            flex: 0 0 auto;
            flex-wrap: nowrap;
            justify-content:flex-end;
            overflow: visible;         /* ✅ no clipping */
          }

          .miniActions::-webkit-scrollbar{ display:none; } /* Chrome */


        .badgeOn{
          font-size: 10px;
          font-weight: 600;
          padding: 5px 8px;
          border-radius: 999px;
          border: 1px solid rgba(15,122,58,.20);
          background: rgba(15,122,58,.10);
          color: rgba(15,122,58,.92);
          white-space:nowrap;
        }

        .err{
          font-size: 11px;
          font-weight: 600;
          color: #7a0b1a;
          background: rgba(217,45,32,.07);
          border: 1px solid rgba(217,45,32,.14);
          padding: 8px 10px;
          border-radius: 14px;
          margin-top: 6px;
        }

        .mapStack{
          display:flex;
          flex-direction:column;
          min-height:0;
          overflow:hidden;
        }
        .mapCard{
          flex: 1;
          min-height: 0;
          display:flex;
          flex-direction:column;
          border-bottom: 1px solid var(--stroke);
          overflow:hidden;
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
          font-weight: 650;
          letter-spacing: -.2px;
          display:flex;
          align-items:center;
          gap:10px;
          font-size: 13px;
          flex-wrap:wrap;
        }
        .chip{
          font-size: 10.5px;
          font-weight: 520;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid var(--stroke);
          background: rgba(255,255,255,.92);
          color: rgba(11,18,32,.76);
          display:inline-flex;
          align-items:center;
          gap:8px;
        }

        .mapArea{ position:relative; flex:1; min-height:0; }
        .mapInner{ position:absolute; inset:0; border-radius: 18px; overflow:hidden; }

        .dock{
          flex: 0 0 auto;
          display:flex;
          flex-direction:column;
          background: rgba(255,255,255,.92);
          overflow:hidden;
          position: relative;
        }

        .dockResizer{
          position:absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 10px;
          cursor: row-resize;
          z-index: 10;
          display:flex;
          align-items:center;
          justify-content:center;
        }
        .dockResizer::before{
          content:"";
          width: 74px;
          height: 4px;
          border-radius: 999px;
          background: rgba(11,18,32,.12);
          transition: background .15s ease;
        }
        .dockResizer:hover::before{
          background: rgba(15,122,58,.25);
        }

        .dockTop{
          padding: 10px 12px;
          border-bottom: 1px solid var(--stroke);
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap;
          background: rgba(255,255,255,.94);
        }
        .dockTitle{
          font-weight: 650;
          letter-spacing: -.15px;
          display:flex;
          align-items:center;
          gap:10px;
          min-width:0;
          white-space:nowrap;
          overflow:hidden;
          text-overflow: ellipsis;
          font-size: 12px;
        }

        .dockBody{
          height: var(--dockH);
          min-height: 180px;
          max-height: 62vh;
          display:flex;
          flex-direction:column;
          overflow:hidden;
          transition: height .18s ease;
          will-change: height;
        }

        /* ✅ while resizing, remove transition so it tracks the pointer smoothly */
        body.resizingDock .dockBody{ transition: none; }
        body.resizingPanel .split{ transition: none; }
          
        .dockBody.collapsed{
          height: 0px;
          min-height: 0;
          border-top: 0;
        }

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
          font-size: 11px;
          font-weight: 520;
          color: rgba(11,18,32,.60);
          display:inline-flex;
          align-items:center;
          gap:8px;
          white-space:nowrap;
        }

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
        .colorCircle:hover{ transform: translateY(-1px); border-color: rgba(15,122,58,.20); box-shadow: 0 16px 34px rgba(11,18,32,.10); }
        .colorSwatch{
          width: 14px; height: 14px;
          border-radius: 999px;
          border: 1px solid rgba(11,18,32,.18);
          box-shadow: 0 0 0 7px rgba(11,18,32,.04);
        }
        .hiddenColorInput{
          position:absolute;
          opacity:0;
          width:1px;
          height:1px;
          pointer-events:none;
        }

        .tableWrap{
          flex: 1;
          min-height: 0;
          overflow: auto;
          -webkit-overflow-scrolling: touch;
          background: rgba(11,18,32,.03);
        }

        table{
          border-collapse: separate;
          border-spacing: 0;
          width: 100%;
          font-size: 10.5px;
          min-width: 980px;
        }
        th, td{
          border-bottom: 1px solid rgba(11,18,32,.08);
          padding: 8px 10px;
          text-align:left;
          vertical-align: middle; /* ✅ important */
        }
        th{
          position: sticky;
          top: 0;
          z-index: 3;
          background: rgba(255,255,255,.98);
          border-bottom: 1px solid rgba(11,18,32,.12);
          font-weight: 600;
          color: rgba(11,18,32,.88);
          white-space: nowrap;
        }
        td{
          font-weight: 420;
          color: rgba(11,18,32,.82);

          /* ✅ prevent wrapping (keeps row height small) */
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;

          max-width: 260px; /* adjust if you want wider */
        }

        td.col-remarks,
        td.col-po_add{
          white-space: normal;
          word-break: break-word;
        }

        /* ✅ Fix ugly wrapping for __fid (circled in your screenshot) */
        td.col-fid{
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          white-space: nowrap;
          word-break: normal;
          max-width: none;
        }
        td.col-idx{
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          white-space: nowrap;
          max-width: none;
        }

        tbody tr:hover td{ background: rgba(15,122,58,.05); }

        tbody tr.rowSelected td{
          background: rgba(15,122,58,.09) !important;
          border-bottom-color: rgba(15,122,58,.16);
        }
        tbody tr.rowSelected td:first-child{
          box-shadow: inset 4px 0 0 rgba(15,122,58,.70);
        }

        /* ✅ keep highlight continuous even with controls inside cells */
        tbody tr.rowSelected .btn,
        tbody tr.rowSelected .colorCircle{
          background: rgba(15,122,58,.06) !important;
          border-color: rgba(15,122,58,.22) !important;
          box-shadow: none !important;
        }

        tbody tr.rowSelected .colorSwatch{
          box-shadow: 0 0 0 6px rgba(15,122,58,.10) !important;
        }


        .rowActionsCell{
            white-space: nowrap;
            vertical-align: middle;
            width: 150px; /* optional */
          }

          .rowActions{
            display:flex;
            align-items:center;
            gap:10px;
          }


        .rowChk{ width:16px; height:16px; cursor:pointer; accent-color: var(--primary); }

        .profileWrap{ position: relative; z-index: 70000; }
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
          z-index: 70010;
          transform: translateY(6px);
          opacity: 0;
          animation: menuIn .14s ease-out forwards;
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
        .profileHead{ padding: 12px; }
        .profileName{ font-size: 13px; font-weight: 620; letter-spacing: -0.08px; }
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
          font-weight: 520;
          color: var(--text);
        }
        .profileItem:hover{ background: rgba(15,122,58,.05); }

        .topRight{ display:flex; align-items:center; gap:10px; }
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
          font-size: 12px;
          font-weight: 650;
          overflow:hidden;
          line-height: 1;
        }

        @keyframes toastIn { from { transform: translateY(-6px); opacity: 0;} to { transform: translateY(0); opacity: 1;} }
        @keyframes popIn { from { transform: translateY(6px) scale(.98); opacity: 0;} to { transform: translateY(0) scale(1); opacity: 1;} }

        .toast{
          position: fixed;
          top: 14px;
          right: 14px;
          z-index: 99999;
          border-radius: 16px;
          border: 1px solid var(--stroke);
          background: rgba(255,255,255,.92);
          backdrop-filter: blur(12px);
          box-shadow: 0 18px 60px rgba(11,18,32,.18);
          padding: 10px 12px;
          display:flex;
          align-items:center;
          gap:10px;
          min-width: 240px;
          max-width: 360px;
          animation: toastIn .16s ease-out;
          font-size: 12px;
          font-weight: 600;
          color: rgba(11,18,32,.90);
        }
        .dot{ width: 10px; height: 10px; border-radius: 999px; background: rgba(11,18,32,.45); }
        .dot.success{ background: rgba(15,122,58,.85); }
        .dot.error{ background: rgba(180,35,24,.95); }
        .dot.info{ background: rgba(17,102,204,.90); }

        .overlaySaving{
          position: fixed;
          inset: 0;
          z-index: 9998;
          background: rgba(255,255,255,.55);
          backdrop-filter: blur(6px);
          display:flex;
          align-items:center;
          justify-content:center;
          padding: 18px;
        }
        .overlayCard{
          width: min(520px, 100%);
          border: 1px solid var(--stroke);
          background: rgba(255,255,255,.92);
          border-radius: 22px;
          box-shadow: 0 24px 90px rgba(11,18,32,.18);
          padding: 14px 14px;
          animation: popIn .14s ease-out;
        }
        .overlayTop{ display:flex; gap:12px; align-items:center; }
        .overlayIcon{
          width: 44px;
          height: 44px;
          border-radius: 16px;
          border: 1px solid var(--stroke);
          display:flex;
          align-items:center;
          justify-content:center;
          background: rgba(11,18,32,.03);
          flex: 0 0 auto;
        }
        .overlayTitle{ font-size: 13px; font-weight: 650; letter-spacing: -.14px; }
        .overlaySub{
          margin-top: 3px;
          font-size: 12px;
          font-weight: 520;
          color: rgba(11,18,32,.62);
          line-height: 1.25;
        }
        .overlayHint{
          margin-top: 10px;
          display:flex;
          gap:8px;
          align-items:center;
          font-size: 11px;
          font-weight: 520;
          color: rgba(11,18,32,.62);
          padding: 8px 10px;
          border-radius: 14px;
          border: 1px dashed rgba(11,18,32,.16);
          background: rgba(255,255,255,.72);
        }

        /* ✅ Mobile: remove the “adjustable line” (splitter) completely and use a floating table sheet */
          @media (max-width: 1280px){
            body{ overflow:hidden; }
            .main{ padding: 0; gap: 0; }

            .split{
              grid-template-columns: 1fr !important;
            }

          /* ✅ when the LEFT panel itself becomes narrow */
          @container (max-width: 340px){
            .miniIconBtn{ width: 30px; height: 30px; }
            .miniActions{ gap: 6px; }
            .miniMeta{ display:none; } /* optional: gives more space */
            .badgeOn{ display:none; }  /* optional */
          }

          .panel{ 
          container-type: inline-size;
          display:none !important; 
          }

          .splitterWrap, .splitter{ display:none !important; }
          .mapStack{ 
          border:0; 
          border-radius:0; 
          box-shadow:none; 
          background: transparent; 
          grid-column: 1 / -1 !important;
          width: 100%;
          }
          .mapInner{ border-radius: 0; }

          .mapHead{
            position: sticky;
            top: 0;
            z-index: 50;
            background: rgba(255,255,255,.92);
            backdrop-filter: blur(14px);
          }

          /* ✅ turn dock into bottom sheet (better UX, no overlap with layer button) */
          .dock{
            position: fixed;
            left: 10px;
            right: 10px;
            bottom: 10px;
            z-index: 6000;
            border-radius: 24px;
            border: 1px solid var(--stroke);
            box-shadow: 0 24px 90px rgba(11,18,32,.18);
            overflow: hidden;
          }

          .dockResizer{ display:none !important; cursor: default; }
          .dockBody{ max-height: 60vh; height: auto; }
          .dockBody.collapsed{ height: 0; }

          table{ min-width: 920px; font-size: 10px; }
          th, td{ padding: 8px 9px; }
          }

          .fab{
            position: fixed;
            right: 14px;
            bottom: var(--fabBottom, 14px); /* ✅ was 14px */
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

        .fab:hover{ transform: translateY(-2px); border-color: rgba(15,122,58,.18); box-shadow: 0 24px 62px rgba(11,18,32,.16); }
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
          font-weight: 650;
          font-size: 12px;
          display:flex;
          align-items:center;
          justify-content:center;
          border: 2px solid #fff;
          box-shadow: 0 12px 20px rgba(11,18,32,.18);
        }
        @media (max-width: 1100px){ .fab{ display:flex; } }

        .sheetOverlay{
          position: fixed; inset: 0;
          background: rgba(11,18,32,.42);
          z-index: 80000;
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
          position: relative;
          z-index: 80001;
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
        .sheetTitle{ font-weight: 650; display:flex; align-items:center; gap:10px; font-size: 13px; }
        .tabRow{
          padding: 10px 12px 0;
          display:flex;
          gap:8px;
          flex-wrap:wrap;
        }
        .tab{
          border: 1px solid var(--stroke);
          border-radius: 999px;
          padding: 8px 10px;
          font-size: 12px;
          font-weight: 560;
          background: rgba(255,255,255,.92);
          cursor:pointer;
        }
        .tab.active{
          border-color: rgba(15,122,58,.24);
          background: rgba(15,122,58,.10);
          color: rgba(15,122,58,.95);
        }
          /* ✅ active icon style (same vibe as the green layered button) */
          .iconActive{
            border-color: rgba(15,122,58,.26) !important;
            background: rgba(15,122,58,.10) !important;
            color: rgba(15,122,58,.95) !important;
          }

          /* GROUP WRAPPER */
.groupBlock{
  border: 1px solid rgba(11,18,32,.08);
  border-radius: 16px;
  background: rgba(255,255,255,.75);
}


/* ✅ header becomes a compact row */
.groupHeader{
  width: 100%;
  border: 0;
  background: rgba(255,255,255,.92);
  padding: 9px 10px;          /* ✅ smaller */
  display:flex;
  align-items:center;
  justify-content:space-between;
  cursor:pointer;
  border-radius: 14px;        /* ✅ slightly tighter */
  transition: background .15s ease, box-shadow .15s ease, transform .10s ease;
}

.groupHeader:hover{
  background: rgba(15,122,58,.06);
  box-shadow: 0 10px 26px rgba(11,18,32,.08);
  transform: translateY(-1px);
}


.groupLeft{
  display:flex;
  align-items:center;
  gap:8px;                    /* ✅ smaller gap */
  min-width:0;
}

.groupTitle{
  font-size: 11.5px;          /* ✅ smaller text */
  font-weight: 700;
  letter-spacing: -.15px;
  line-height: 1;
}

.groupBadge{
  font-size: 10px;            /* ✅ smaller badge */
  font-weight: 650;
  padding: 2px 6px;           /* ✅ smaller badge padding */
  border-radius: 999px;
  background: rgba(15,122,58,.08);
  border: 1px solid rgba(15,122,58,.18);
  color: rgba(15,122,58,.95);
  line-height: 1.1;
}

.groupToggle{
  font-size: 11px;            /* ✅ smaller chevron */
  color: rgba(11,18,32,.6);
}


      .groupItems{
        max-height: 55vh;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 10px 14px 10px 10px;   /* ✅ RIGHT padding increased */
      }

/* nicer scrollbar (optional) */
.groupItems::-webkit-scrollbar{ width: 10px; }
.groupItems::-webkit-scrollbar-thumb{
  background: rgba(11,18,32,.12);
  border-radius: 999px;
  border: 3px solid rgba(255,255,255,.65);
}

.profileFooter {
  margin-top: 10px;
  padding-top: 8px;
  font-size: 12px;
  color: #888;
  text-align: center;
  border-top: 1px solid #eee;
}

.profileFooter a {
  color: inherit;        /* same color as "Developed by" */
  text-decoration: none; /* remove underline */
}

.profileFooter a:hover {
  text-decoration: underline; /* subtle hover effect */
}

      `}</style>

      {/* HEADER */}
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
            {/* Dark Mode Toggle */}
            {/* <button
              className="btn btnGhost iconBtn"
              type="button"
              onClick={() => setDarkMode((v) => !v)}
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              style={{ borderRadius: 999 }}
            >
              <FontAwesomeIcon icon={darkMode ? faSun : faMoon} />
            </button> */}
  
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
              <span className="avatar" aria-hidden="true">
                U
              </span>
            </button>

            {profileOpen ? (
      
            <div className="profileMenu" role="menu">
          <div className="profileHead" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div className="profileName">Guest User</div>
            <button
              className="btn btnGhost"
              type="button"
              onClick={() => setDarkMode((v) => !v)}
              title={darkMode ? "Light mode" : "Dark mode"}
              style={{
                borderRadius: 999,
                padding: "6px 10px",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexShrink: 0,
              }}
            >
              <FontAwesomeIcon icon={darkMode ? faSun : faMoon} />
              <span style={{ fontSize: 11, fontWeight: 560, color: "var(--muted)" }}>
                {darkMode ? "Light" : "Dark"}
              </span>
            </button>
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
            
              {/* Footer */}
              <div className="profileFooter">
                Developed by{" "}
                <a
                  href="https://www.facebook.com/arnold.mendoza.5283166/directory_privacy_and_legal_info"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Arnold G. Mendoza
                </a>
              </div>
            </div>

      
            ) : null}
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div
          className="main"
          style={
            {
              ["--panelW" as any]: `${panelWidth}px`,
              ["--dockH" as any]: `${dockHeight}px`,

              // ✅ Move FAB above the dock top bar on mobile
              ["--fabBottom" as any]: isMobile
              ? tableCollapsed
                ? "90px"
                : `calc(14px + min(60vh, ${dockHeight}px))` // stays above expanded dock
              : "14px",
            } as any
          }
        >
        <div className="split">
          {/* LEFT PANEL (Desktop) */}
          <div className="panel">
            <div className="panelHead">
              <div className="headRow">
                <div className="headLeft">
                  <div className="sectionTitle">
                    <FontAwesomeIcon icon={faLayerGroup} />
                    Layers
                  </div>
                  <div className="pill" title="Total in list">
                    {filtered.length}
                  </div>
                  <div className="pill" title="Selected / loaded">
                    {visibleCount} • {loadedCount}
                  </div>
                </div>

                {/* ✅ cleaner toolbar (fixes your circled top-left clutter) */}
                <div className="toolbar" aria-label="Layers toolbar">
                  {isFiltering ? (
                    <button
                      className="btn btnPrimary iconBtn"
                      onClick={() => selectFiltered(!hasAllVisibleFiltered, filteredIds)}
                      disabled={filtered.length === 0}
                      title={hasAllVisibleFiltered ? "Unselect filtered" : "Select filtered"}
                      type="button"
                    >
                      <FontAwesomeIcon icon={hasAllVisibleFiltered ? faCheckSquare : faSquare} />
                    </button>
                  ) : null}

                  <button
                    className="btn btnDanger iconBtn"
                    onClick={() => (isFiltering ? selectFiltered(false, filteredIds) : clearAll())}
                    disabled={isFiltering ? !hasAnyVisibleFiltered : visibleCount === 0}
                    title="Clear"
                    type="button"
                  >
                    <FontAwesomeIcon icon={faEyeSlash} />
                  </button>

                  <button
                    className="btn btnPrimary iconBtn"
                    onClick={refreshList}
                    disabled={loadingList}
                    title="Refresh layers"
                    type="button"
                  >
                    {loadingList ? <Ring size={16} /> : <FontAwesomeIcon icon={faRotateRight} />}
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
                  <button className="btn btnGhost iconBtn" onClick={() => setSearch("")} title="Clear search" type="button">
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                ) : null}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div className="segWrap" role="tablist" aria-label="Layer tabs">
                  <button
                    className={`seg ${desktopTab === "all" ? "active" : ""}`}
                    onClick={() => setDesktopTab("all")}
                    type="button"
                    role="tab"
                    aria-selected={desktopTab === "all"}
                  >
                    <FontAwesomeIcon icon={faBars} />
                    All
                    <span style={{ opacity: 0.75 }}>({filtered.length})</span>
                  </button>
                  <button
                    className={`seg ${desktopTab === "selected" ? "active" : ""}`}
                    onClick={() => setDesktopTab("selected")}
                    type="button"
                    role="tab"
                    aria-selected={desktopTab === "selected"}
                  >
                    <FontAwesomeIcon icon={faEye} />
                    Selected
                    <span style={{ opacity: 0.75 }}>
                      ({visibleCount + (userLoc ? 1 : 0) + (measureLineGeojson ? 1 : 0)})
                    </span>
                  </button>
                </div>

                {/* <div className="pill" title="Tip">
                  {desktopTab === "all" ? "Tap a layer name to add" : "Reorder + open table"}
                </div> */}
              </div>
            </div>

            {/* LIST AREA */}
            <div className="listWrap">
              {desktopTab === "all" ? (
                <>
                  {loadingList && layers.length === 0 ? (
                    <>
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="miniItem">
                          <div style={{ flex: 1 }}>
                            <Shimmer h={12} w="70%" />
                            <div style={{ height: 6 }} />
                            <Shimmer h={10} w="48%" />
                          </div>
                          <Ring size={16} />
                        </div>
                      ))}
                    </>
                  ) : filtered.length === 0 ? (
                    <div className="pill" style={{ alignSelf: "flex-start" }}>
                      No results
                    </div>
                  ) : (

                    groupedFiltered.map((g) => {
                      const isOpen = groupOpen[g.key] ?? true;
                    
                      return (
                        <div key={g.key} className="groupBlock">
                               {/* ✅ GROUP HEADER */}

                         <button
                            type="button"
                            onClick={() => setGroupOpen((p) => ({ ...p, [g.key]: !isOpen }))}
                            className="groupHeader"
                          >
                            <div className="groupLeft">
                              <span className="groupTitle">{g.key === "OTHERS" ? "Others" : g.key}</span>
                              <span className="groupBadge">{g.items.length}</span>
                            </div>

                            <span className="groupToggle" aria-hidden="true">
                              <FontAwesomeIcon icon={isOpen ? faChevronDown : faChevronRight} />
                            </span>
                          </button>
                    
                          {/* ✅ GROUP ITEMS */}
                          {isOpen ? (
                            <div className="groupItems" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {g.items.map((l) => {
                                const isOn = !!l.visible;
                                return (
                                  <div key={l.id} className={`miniItem ${isNarrowSidebar ? "stacked" : ""}`}>
                                    <button
                                      className="miniNameBtn"
                                      onClick={() => addLayerFromAllList(l.id)}
                                      title={isOn ? "Already selected — click to open table" : "Click to add"}
                                      type="button"
                                    >
                                      <div className="miniName">{l.name}</div>
                                      <div className="miniMeta">
                                        {l.geom_type ?? "-"} • SRID {l.srid ?? "-"}
                                      </div>
                                    </button>
                    
                                    <div className="miniActions">
                                      {isOn ? <span className="badgeOn">Selected</span> : null}
                    
                                      <button
                                        className="btn btnPrimary miniIconBtn"
                                        onClick={() => toggleLayer(l.id, !isOn)}
                                        disabled={l.loading}
                                        title={isOn ? "Remove" : "Add"}
                                        type="button"
                                      >
                                        {l.loading ? <Ring size={14} /> : <FontAwesomeIcon icon={isOn ? faMinus : faPlus} />}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })


                  )}
                </>
              ) : (
                <>
                  {selectedLayersOrdered.length === 0 ? (
                    <div style={{ padding: 10, color: "rgba(11,18,32,.65)", fontWeight: 500 }}>
                      Select a layer from List first.
                    </div>
                  ) : (
                    selectedLayersOrdered.map((l) => {
                      const orderNo = layerOrderNumberById[l.id];
                      const isPseudo = l.id === MY_LOC_LAYER_ID || l.id === MEASURE_LAYER_ID;

                      const selectedCount = !isPseudo ? selectedCountForLayer(l.id) : 0;
                      const ready = isPseudo ? true : l.visible && l.geojson;

                      return (
                        <div key={l.id} className={`miniItem ${isNarrowSidebar ? "stacked" : ""}`}>
                          <button
                            className="miniNameBtn"
                            onClick={() => activateSelectedLayer(l.id)}
                            title={isPseudo ? "Pseudo layer" : "Open attribute table"}
                            type="button"
                            style={{ cursor: isPseudo ? "default" : "pointer" }}
                          >
                            <div className="miniName">
                              {l.name}
                              {orderNo ? (
                                <span className="pill" style={{ padding: "3px 7px", fontSize: 10, marginLeft: 8 }} title="Draw order">
                                  #{orderNo}
                                </span>
                              ) : null}
                            </div>
                            <div className="miniMeta">
                              {l.geom_type ?? "-"}
                              {l.srid ? ` • SRID ${l.srid}` : ""}
                              {selectedCount > 0 ? ` • selected: ${selectedCount}` : ""}
                              {!isPseudo ? (l.loading ? " • loading…" : ready ? " • ready" : "") : ""}
                            </div>
                          </button>

                          <div className="miniActions">

                            <button className="btn btnGhost miniIconBtn" onClick={() => moveLayer(l.id, "up")} title="Up" type="button">
                              <FontAwesomeIcon icon={faArrowUp} />
                            </button>
                            <button className="btn btnGhost miniIconBtn" onClick={() => moveLayer(l.id, "down")} title="Down" type="button">
                              <FontAwesomeIcon icon={faArrowDown} />
                            </button>
  

                            {!isPseudo ? (
                              <>
                                <button
                                  className="btn btnPrimary miniIconBtn"
                                  onClick={() => loadGeojson(l.id, "map")}
                                  disabled={l.loading}
                                  title="Reload GeoJSON"
                                  type="button"
                                >
                                  {l.loading ? <Ring size={14} /> : <FontAwesomeIcon icon={faArrowsRotate} />}
                                </button>

                                {/* <button className="btn btnGhost miniIconBtn" onClick={() => openAttributeTable(l.id)} title="Table" type="button">
                                  <FontAwesomeIcon icon={faTable} />
                                </button> */}
                              </>
                            ) : null}

                            <button
                              className="btn btnDanger miniIconBtn"
                              onClick={() => toggleLayer(l.id, false)}
                              title={l.id === MY_LOC_LAYER_ID ? "Remove My Location" : l.id === MEASURE_LAYER_ID ? "Remove Measure" : "Remove"}
                              type="button"
                            >
                              <FontAwesomeIcon icon={faXmark} />
                            </button>
                          </div>

                          {!isPseudo && l.error ? <div className="err">⚠ {l.error}</div> : null}
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>
          </div>

          {/* SPLITTER (Desktop) */}
          <div className="splitterWrap">
            <div
              className="splitter"
              onMouseDown={beginResizePanel}
              onTouchStart={(e) => {
                e.preventDefault();
                beginResizePanel();
              }}
              title="Drag to resize panel"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panel"
            >
              <span className="splitterGrip" aria-hidden="true">
                <span className="splitterDots" />
              </span>
            </div>
          </div>

          {/* RIGHT: MAP + TABLE */}
          <div className="mapStack">
            {/* MAP */}
            <div className="mapCard">
              <div className="mapHead">
                <div className="mapTitle">
                  Map
                  <span className="chip">
                    <FontAwesomeIcon icon={faEye} /> {mapLayersInput.length}
                  </span>
                  <span className="chip" title="Selected / loaded">
                    {visibleCount} • {loadedCount}
                  </span>

                  {measureActive && userLoc && measureTo ? (
                    <span className="chip" title="Distance from My Location">
                      {formatDistance(measureDistance ?? NaN)}
                    </span>
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {/* ✅ Mobile quick Layers button (so you don’t rely on a bottom FAB) */}
                  <button
                    className="btn btnGhost iconBtn"
                    onClick={() => {
                      setMobileTab("all");
                      setMobilePanelOpen(true);
                    }}
                    title="Layers"
                    type="button"
                    style={{ display: isMobile ? "inline-flex" : "none" }}
                  >
                    <FontAwesomeIcon icon={faLayerGroup} />
                  </button>

                  <button
                    className={`btn ${showBasemap ? "iconActive" : "btnGhost"}`}
                    onClick={() => setShowBasemap((v) => !v)}
                    title={showBasemap ? "Basemap ON" : "Basemap OFF"}
                    type="button"
                  >
                    {showBasemap ? "Basemap: ON" : "Basemap: OFF"}
                  </button>

                  {/* <button
                    className={`btn iconBtn ${userLoc ? "iconActive" : "btnGhost"}`}
                    onClick={requestUserLocation}
                    disabled={locLoading}
                    title={userLoc ? "My location is ON (tap to update)" : "Show my location"}
                    type="button"
                  >
                    {locLoading ? <Ring size={16} /> : <FontAwesomeIcon icon={faLocationCrosshairs} />}
                  </button> */}

                  {measureActive ? (
                    <button
                      className="btn btnDanger"
                      onClick={() => {
                        clearMeasure();
                        showToast("info", "Measure cleared.");
                      }}
                      title="Clear distance tool"
                      type="button"
                    >
                      <FontAwesomeIcon icon={faXmark} />
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mapArea">
                <div className="mapInner">
                  <ResultMap
                    key={mapKey}
                    showBasemap={showBasemap}
                    backgroundColor="#ffffff"
                    onFeatureFidClick={handleFeatureClick}
                    onMapMouseMove={onMapMouseMove}
                    onMapClick={onMapClick}
                    layers={mapLayersInput}
                    zoomTo={zoomTo}       
                  />
                </div>
              </div>
            </div>

            {/* DOCKED ATTRIBUTE TABLE */}
            <div className="dock">
              {!tableCollapsed && !isMobile ? (
                <div
                  className="dockResizer"
                  onMouseDown={beginResizeDock}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    beginResizeDock();
                  }}
                  title="Drag to resize table"
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize table"
                />
              ) : null}

              <div className="dockTop">
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                  <div className="dockTitle" title={tableLayer?.name ?? "Attribute Table"}>
                    <FontAwesomeIcon icon={faTable} />
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {tableLayer?.name ? `${tableLayer.name} — Attribute Table` : "Attribute Table"}
                    </span>
                  </div>

                  {tableLayerId ? (
                    <span className="pill" title="Selected rows">
                      {tableSelectedSet.size}
                    </span>
                  ) : (
                    <span className="pill" title="Tip">
                      Open a layer → table
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <div className="searchWrap" style={{ width: "min(520px, 46vw)" }}>
                    <FontAwesomeIcon icon={faMagnifyingGlass} opacity={0.8} />
                    <input
                      className="searchInput"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder="Search data in table…"
                      disabled={!tableLayerId}
                    />
                  </div>

                  <button
                    className="btn btnGhost iconBtn"
                    onClick={() => setTableCollapsed((v) => !v)}
                    title={tableCollapsed ? "Expand table" : "Collapse table"}
                    type="button"
                  >
                    <FontAwesomeIcon icon={tableCollapsed ? faChevronDown : faSliders} />
                  </button>

                  <button
                    className="btn btnPrimary iconBtn"
                    onClick={() => tableLayerId && loadGeojson(tableLayerId, "full")}
                    disabled={!tableLayerId || !!tableLayer?.loading}
                    title="Reload"
                    type="button"
                  >
                    {tableLayer?.loading ? <Ring size={16} /> : <FontAwesomeIcon icon={faArrowsRotate} />}
                  </button>

                  <button
                    className="btn btnDanger iconBtn"
                    onClick={() => {
                      setTableLayerId(null);
                      setTableSearch("");
                      setTableCollapsed(true);
                    }}
                    disabled={!tableLayerId}
                    title="Close table"
                    type="button"
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </div>
              </div>

              <div className={`dockBody ${tableCollapsed ? "collapsed" : ""}`}>
                {!tableLayerId ? (
                  <div style={{ padding: 16, color: "rgba(11,18,32,.65)", fontWeight: 520 }}>
                    Open a layer’s table from <b>Selected</b>.
                  </div>
                ) : !tableLayer || tableLayer.loading || !tableLayer.geojson || tableData.rows.length === 0 ? (
                  <div style={{ padding: 16, display: "flex", alignItems: "center", gap: 10 }}>
                    <Ring size={18} />
                    <div style={{ fontWeight: 520, color: "rgba(11,18,32,.65)" }}>Loading attributes…</div>
                  </div>
                ) : (
                  <>
                    <div className="tableBar">
                      <div className="pill">
                        {tableSelectedSet.size} / {tableMax}
                      </div>

                      <div className="smallHint" title="Filtered rows / current page">
                        {tableFilteredIdxs.length}
                        <span style={{ marginLeft: 10, opacity: 0.9 }}>
                          Page {tablePageSafe} / {tablePageCount}
                        </span>
                      </div>

                      <div className="tableBarRight">
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <button className="btn btnGhost miniIconBtn" type="button" onClick={() => setTablePage(1)} disabled={tablePageSafe <= 1} title="First">
                            {"<<"}
                          </button>
                          <button className="btn btnGhost miniIconBtn" type="button" onClick={() => setTablePage((p) => Math.max(1, p - 1))} disabled={tablePageSafe <= 1} title="Prev">
                            {"<"}
                          </button>
                          <button className="btn btnGhost miniIconBtn" type="button" onClick={() => setTablePage((p) => Math.min(tablePageCount, p + 1))} disabled={tablePageSafe >= tablePageCount} title="Next">
                            {">"}
                          </button>
                          <button className="btn btnGhost miniIconBtn" type="button" onClick={() => setTablePage(tablePageCount)} disabled={tablePageSafe >= tablePageCount} title="Last">
                            {">>"}
                          </button>

                          <select
                            value={tablePageSize}
                            onChange={(e) => {
                              const next = Math.max(1, Number(e.target.value) || 50);
                              setTablePageSize(next);
                              setTablePage(1);
                            }}
                            className="btn"
                            style={{ padding: "8px 10px", borderRadius: 14 }}
                            title="Rows per page"
                          >
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={200}>200</option>
                            <option value={500}>500</option>
                          </select>
                        </div>

                        <div className="colorPickWrap" title="Pick color">
                          <label className="colorCircle">
                            <span className="colorSwatch" style={{ background: tableColor }} />
                            <input className="hiddenColorInput" type="color" value={tableColor} onChange={(e) => setTableColor(e.target.value)} aria-label="Pick color" />
                          </label>
                        </div>

                        <button className="btn btnPrimary miniIconBtn" onClick={() => tableLayerId && colorRows(tableLayerId, idxsToColorNow, tableColor)} disabled={!tableLayerId || idxsToColorNow.length === 0} title="Color selected" type="button">
                          <FontAwesomeIcon icon={faPalette} />
                        </button>

                        <button className="btn btnGhost miniIconBtn" onClick={() => tableLayerId && clearColorForRows(tableLayerId, idxsToClearColorNow)} disabled={!tableLayerId || idxsToClearColorNow.length === 0} title="Clear selected color" type="button">
                          <FontAwesomeIcon icon={faEraser} />
                        </button>

                        <button className="btn btnDanger miniIconBtn" onClick={() => tableLayerId && clearSelectedFeaturesInLayer(tableLayerId)} disabled={!tableLayerId || tableSelectedSet.size === 0} title="Clear selection" type="button">
                          <FontAwesomeIcon icon={faXmark} />
                        </button>

                        <button className="btn btnDanger miniIconBtn" onClick={() => tableLayerId && clearAllColorsForLayer(tableLayerId)} disabled={!tableLayerId || Object.keys(tableColorOverrides).length === 0} title="Clear all colors" type="button">
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
                                aria-label="Select all filtered rows across all pages"
                                title="Select all filtered (all pages)"
                              />
                            </th>

                            <th style={{ width: 150 }}>Row</th>

                            {tableData.columns.filter((c) => c !== "__fid").map((c) => (
                              <th key={c}>{c}</th>
                            ))}
                          </tr>
                        </thead>

                        <tbody>
                          {tablePagedRows.map((r: any) => {
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

                                <td className="rowActionsCell">
                                  <div className="rowActions">
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
                                      onClick={() => tableLayerId && Number.isFinite(idx) && clearRowColor(tableLayerId, idx)}
                                      disabled={!override}
                                      title="Clear row color"
                                      type="button"
                                    >
                                      <FontAwesomeIcon icon={faEraser} />
                                    </button>
                                  </div>
                                </td>

                                {tableData.columns.filter((c) => c !== "__fid").map((c) => {
                                  const v = stringifyCell(r?.[c]);
                                  const cls =
                                    c === "__fid" ? "col-fid" : c === "__idx" ? "col-idx" : "";
                                  return (
                                    <td key={c} className={cls}>
                                      {v}
                                    </td>
                                  );
                                })}
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
          </div>
        </div>

        {/* MOBILE FAB (only when safe; never covers table now) */}
        {/* {showMobileFab ? (
          <button
            className="fab"
            onClick={() => {
              setMobileTab("all");
              setMobilePanelOpen(true);
            }}
            aria-label="Open layers"
            type="button"
          >
            <span className="fabIcon">
              <FontAwesomeIcon icon={faLayerGroup} />
            </span>
            <span className="fabBadge" title="Selected layers">
              {visibleCount}
            </span>
          </button>
        ) : null} */}

        {/* MOBILE SHEET (tabs: All / Selected) */}
        {mobilePanelOpen ? (
          <div className="sheetOverlay" onClick={() => setMobilePanelOpen(false)} role="dialog" aria-modal="true">
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="grab" />
              <div className="sheetTop">
                <div className="sheetTitle">
                  <FontAwesomeIcon icon={faLayerGroup} />
                  Layers
                  <span className="pill" style={{ padding: "5px 9px" }} title="Selected">
                    {visibleCount}
                  </span>
                </div>

                <button className="btn btnGhost iconBtn" onClick={() => setMobilePanelOpen(false)} title="Close" type="button">
                  <FontAwesomeIcon icon={faChevronDown} />
                </button>
              </div>

              <div className="tabRow">
                <button className={`tab ${mobileTab === "all" ? "active" : ""}`} onClick={() => setMobileTab("all")} type="button">
                  All Layers ({filtered.length})
                </button>
                <button className={`tab ${mobileTab === "selected" ? "active" : ""}`} onClick={() => setMobileTab("selected")} type="button">
                  Selected ({visibleCount})
                </button>
              </div>

              <div className="panelHead" style={{ borderRadius: 0 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div className="searchWrap" style={{ flex: 1 }}>
                    <FontAwesomeIcon icon={faMagnifyingGlass} opacity={0.8} />
                    <input className="searchInput" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search layers…" />
                    {isFiltering ? (
                      <button className="btn btnGhost iconBtn" onClick={() => setSearch("")} title="Clear" type="button">
                        <FontAwesomeIcon icon={faXmark} />
                      </button>
                    ) : null}
                  </div>

                  <button className="btn btnPrimary iconBtn" onClick={refreshList} disabled={loadingList} title="Refresh" type="button">
                    {loadingList ? <Ring size={16} /> : <FontAwesomeIcon icon={faRotateRight} />}
                  </button>

                  <button
                    className="btn btnDanger iconBtn"
                    onClick={() => (isFiltering ? selectFiltered(false, filteredIds) : clearAll())}
                    disabled={isFiltering ? !hasAnyVisibleFiltered : visibleCount === 0}
                    title="Clear selected"
                    type="button"
                  >
                    <FontAwesomeIcon icon={faEyeSlash} />
                  </button>
                </div>

                {isFiltering ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btnPrimary" onClick={() => selectFiltered(!hasAllVisibleFiltered, filteredIds)} disabled={filtered.length === 0} title="Select filtered" type="button">
                      <FontAwesomeIcon icon={hasAllVisibleFiltered ? faCheckSquare : faSquare} />
                      Select filtered
                    </button>
                  </div>
                ) : null}
              </div>

              <div style={{ padding: 12, minHeight: 0, overflow: "auto" }}>
              {mobileTab === "all" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {filtered.length === 0 ? (
                    <div className="pill" style={{ alignSelf: "flex-start" }}>
                      No results
                    </div>
                  ) : (
                    groupedFiltered.map((g) => {
                      const isOpen = groupOpen[g.key] ?? false;

                      return (
                        <div key={g.key} className="groupBlock">
                          {/* GROUP HEADER */}
                          <button
                            type="button"
                            onClick={() => toggleGroup(g.key)}   // ✅ use accordion behavior
                            className="groupHeader"
                          >
                            <div className="groupLeft">
                              <span className="groupTitle">{g.key === "OTHERS" ? "Others" : g.key}</span>
                              <span className="groupBadge">{g.items.length}</span>
                            </div>

                            <span className="groupToggle" aria-hidden="true">
                              <FontAwesomeIcon icon={isOpen ? faChevronDown : faChevronRight} />
                            </span>
                          </button>

                          {/* GROUP ITEMS */}
                          {isOpen ? (
                            <div className="groupItems" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {g.items.map((l) => {
                                const isOn = !!l.visible;

                                return (
                                  <div key={l.id} className="miniItem">
                                    <button className="miniNameBtn" onClick={() => addLayerFromAllList(l.id)} type="button">
                                      <div className="miniName">{l.name}</div>
                                      <div className="miniMeta">
                                        {l.geom_type ?? "-"} • SRID {l.srid ?? "-"}
                                      </div>
                                    </button>

                                    <div className="miniActions">
                                      {isOn ? <span className="badgeOn">Selected</span> : null}
                                      <button
                                        className="btn btnPrimary miniIconBtn"
                                        onClick={() => toggleLayer(l.id, !isOn)}
                                        disabled={l.loading}
                                        title={isOn ? "Remove" : "Add"}
                                        type="button"
                                      >
                                        {l.loading ? <Ring size={14} /> : <FontAwesomeIcon icon={isOn ? faMinus : faPlus} />}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {selectedLayersOrdered.length === 0 ? (
                      <div style={{ color: "rgba(11,18,32,.65)", fontWeight: 520 }}>
                        No selected layers yet. Go to <b>All Layers</b> and tap a layer name.
                      </div>
                    ) : (
                      selectedLayersOrdered.map((l) => (
                        <div key={l.id} className={`miniItem ${isNarrowSidebar ? "stacked" : ""}`}>
                          <button
                            className="miniNameBtn"
                            onClick={() => activateSelectedLayer(l.id)}
                            type="button"
                            style={{ cursor: l.id === MY_LOC_LAYER_ID || l.id === MEASURE_LAYER_ID ? "default" : "pointer" }}
                          >
                            <div className="miniName">{l.name}</div>
                            <div className="miniMeta">
                              Order #{layerOrderNumberById[l.id] ?? "-"} • {l.geom_type ?? "-"}
                            </div>
                          </button>

                          <div className="miniActions">
                            <button className="btn btnGhost miniIconBtn" onClick={() => moveLayer(l.id, "top")} title="Top" type="button">
                              <FontAwesomeIcon icon={faAnglesUp} />
                            </button>
                            <button className="btn btnGhost miniIconBtn" onClick={() => moveLayer(l.id, "up")} title="Up" type="button">
                              <FontAwesomeIcon icon={faArrowUp} />
                            </button>
                            <button className="btn btnGhost miniIconBtn" onClick={() => moveLayer(l.id, "down")} title="Down" type="button">
                              <FontAwesomeIcon icon={faArrowDown} />
                            </button>
                            <button className="btn btnGhost miniIconBtn" onClick={() => moveLayer(l.id, "bottom")} title="Bottom" type="button">
                              <FontAwesomeIcon icon={faAnglesDown} />
                            </button>
                            {l.id !== MY_LOC_LAYER_ID && l.id !== MEASURE_LAYER_ID ? (
                              <button className="btn btnGhost miniIconBtn" onClick={() => openAttributeTable(l.id)} title="Table" type="button">
                                <FontAwesomeIcon icon={faTable} />
                              </button>
                            ) : null}
                            <button className="btn btnDanger miniIconBtn" onClick={() => toggleLayer(l.id, false)} title="Remove" type="button">
                              <FontAwesomeIcon icon={faXmark} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
