"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import AutoLogout from "@/app/components/AutoLogout";

type Row = {
  __fid: string;
  __idx: number;
  props: Record<string, any>;
};

type ToastState =
  | { show: false }
  | { show: true; type: "success" | "error" | "info"; message: string };

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text };
  }
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

/** QGIS-like: user can type text/number/true/false/null or JSON */
function parseValueSmart(raw: string): any {
  const s = raw.trim();
  if (s === "") return "";
  if (s === "null") return null;
  if (s === "true") return true;
  if (s === "false") return false;

  if (!Number.isNaN(Number(s)) && /^[+-]?\d+(\.\d+)?$/.test(s)) return Number(s);

  if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
    try {
      return JSON.parse(s);
    } catch {}
  }
  return raw;
}

function isValidFieldName(name: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

// ---------- tiny inline icons (no deps) ----------
function Icon({
  name,
  size = 16,
}: {
  name:
    | "search"
    | "filter"
    | "clear"
    | "reload"
    | "save"
    | "trash"
    | "apply"
    | "first"
    | "prev"
    | "next"
    | "last"
    | "info"
    | "lock"
    | "chevUp"
    | "chevDown"
    | "sliders";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg" as const,
  };
  const stroke = {
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "search":
      return (
        <svg {...common}>
          <path {...stroke} d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
          <path {...stroke} d="M16 16l5 5" />
        </svg>
      );
    case "filter":
      return (
        <svg {...common}>
          <path {...stroke} d="M4 5h16" />
          <path {...stroke} d="M7 12h10" />
          <path {...stroke} d="M10 19h4" />
        </svg>
      );
    case "clear":
      return (
        <svg {...common}>
          <path {...stroke} d="M6 6l12 12" />
          <path {...stroke} d="M18 6L6 18" />
        </svg>
      );
    case "reload":
      return (
        <svg {...common}>
          <path {...stroke} d="M21 12a9 9 0 1 1-3-6.7" />
          <path {...stroke} d="M21 3v6h-6" />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path {...stroke} d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
          <path {...stroke} d="M17 21v-8H7v8" />
          <path {...stroke} d="M7 3v5h8" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path {...stroke} d="M3 6h18" />
          <path {...stroke} d="M8 6V4h8v2" />
          <path {...stroke} d="M19 6l-1 14H6L5 6" />
          <path {...stroke} d="M10 11v6" />
          <path {...stroke} d="M14 11v6" />
        </svg>
      );
    case "apply":
      return (
        <svg {...common}>
          <path {...stroke} d="M20 6L9 17l-5-5" />
        </svg>
      );
    case "first":
      return (
        <svg {...common}>
          <path {...stroke} d="M7 6v12" />
          <path {...stroke} d="M18 18l-6-6 6-6" />
        </svg>
      );
    case "prev":
      return (
        <svg {...common}>
          <path {...stroke} d="M15 18l-6-6 6-6" />
        </svg>
      );
    case "next":
      return (
        <svg {...common}>
          <path {...stroke} d="M9 6l6 6-6 6" />
        </svg>
      );
    case "last":
      return (
        <svg {...common}>
          <path {...stroke} d="M17 6v12" />
          <path {...stroke} d="M6 6l6 6-6 6" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <path {...stroke} d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />
          <path {...stroke} d="M12 10v6" />
          <path {...stroke} d="M12 7h.01" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <path {...stroke} d="M7 11V8a5 5 0 0 1 10 0v3" />
          <path {...stroke} d="M6 11h12v10H6V11Z" />
          <path {...stroke} d="M12 15v3" />
        </svg>
      );
    case "chevUp":
      return (
        <svg {...common}>
          <path {...stroke} d="M18 15l-6-6-6 6" />
        </svg>
      );
    case "chevDown":
      return (
        <svg {...common}>
          <path {...stroke} d="M6 9l6 6 6-6" />
        </svg>
      );
    case "sliders":
      return (
        <svg {...common}>
          <path {...stroke} d="M4 21v-7" />
          <path {...stroke} d="M4 10V3" />
          <path {...stroke} d="M12 21v-9" />
          <path {...stroke} d="M12 8V3" />
          <path {...stroke} d="M20 21v-5" />
          <path {...stroke} d="M20 12V3" />
          <path {...stroke} d="M2 14h4" />
          <path {...stroke} d="M10 8h4" />
          <path {...stroke} d="M18 16h4" />
        </svg>
      );
  }
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: "2px solid rgba(11,18,32,.18)",
        borderTopColor: "rgba(11,18,32,.78)",
        display: "inline-block",
        animation: "spin .85s linear infinite",
      }}
    />
  );
}

function OverlaySpinner({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="overlay" role="alert" aria-live="assertive" aria-busy="true">
      <div className="overlayCard">
        <div className="overlayTop">
          <div className="overlayIcon">
            <Spinner size={18} />
          </div>
          <div className="overlayText">
            <div className="overlayTitle">{title}</div>
            {subtitle ? <div className="overlaySub">{subtitle}</div> : null}
          </div>
        </div>

        <div className="overlayHint">
          <Icon name="lock" size={14} />
          Actions are temporarily disabled to prevent duplicate updates.
        </div>
      </div>
    </div>
  );
}

export default function LayerEditPage() {
  const params = useParams<{ layerId: string }>();
  const layerId = params.layerId;

  const sp = useSearchParams();
const nameFromUrl = sp.get("name") || "";

  const [layerName, setLayerName] = useState<string>("");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [err, setErr] = useState("");

  const [toast, setToast] = useState<ToastState>({ show: false });
  function showToast(type: "success" | "error" | "info", message: string) {
    setToast({ show: true, type, message });
    window.setTimeout(() => setToast({ show: false }), 2500);
  }

  // table tools
  const [q, setQ] = useState("");
  const [selectedSet, setSelectedSet] = useState<Record<string, boolean>>({});
  const selectedCount = useMemo(() => Object.values(selectedSet).filter(Boolean).length, [selectedSet]);

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // field calculator
  const [applyScope, setApplyScope] = useState<"selected" | "filtered" | "all">("selected");
  const [calcMode, setCalcMode] = useState<"update" | "add">("update");
  const [activeCol, setActiveCol] = useState<string>("");
  const [newCol, setNewCol] = useState<string>("");
  const [newValue, setNewValue] = useState<string>("");

  // inline editor
  const [editing, setEditing] = useState<{ fid: string; col: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");

  // staged unsaved edits: fid -> { col: value }
  const [pending, setPending] = useState<Record<string, Record<string, any>>>({});

  const pendingCount = useMemo(() => {
    let n = 0;
    for (const fid of Object.keys(pending)) n += Object.keys(pending[fid] || {}).length;
    return n;
  }, [pending]);

  // 🔒 lock everything while saving/loading
  const uiLocked = saving || loading;

  // ✅ mobile: controls as a bottom sheet to give table more height
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  // union of columns from rows + pending edits
  const columns = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r.props || {})) if (k !== "__fid") set.add(k);
    for (const fid of Object.keys(pending)) for (const k of Object.keys(pending[fid] || {})) if (k !== "__fid") set.add(k);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, pending]);

  const filteredRows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      if (r.__fid.toLowerCase().includes(qq)) return true;

      for (const [k, v] of Object.entries(r.props || {})) {
        if (`${k}:${stringifyCell(v)}`.toLowerCase().includes(qq)) return true;
      }

      const p = pending[r.__fid];
      if (p) {
        for (const [k, v] of Object.entries(p)) {
          if (`${k}:${stringifyCell(v)}`.toLowerCase().includes(qq)) return true;
        }
      }
      return false;
    });
  }, [rows, q, pending]);

  const filteredFids = useMemo(() => filteredRows.map((r) => r.__fid), [filteredRows]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(filteredRows.length / Math.max(1, pageSize))), [filteredRows.length, pageSize]);
  const pageSafe = useMemo(() => Math.min(Math.max(1, page), pageCount), [page, pageCount]);

  const pagedRows = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, pageSafe, pageSize]);

  useEffect(() => setPage(1), [q, pageSize, layerId]);

  const pickAllRef = useRef<HTMLInputElement | null>(null);

  const allFilteredSelected = useMemo(() => {
    if (filteredFids.length === 0) return false;
    for (const fid of filteredFids) if (!selectedSet[fid]) return false;
    return true;
  }, [filteredFids, selectedSet]);

  const someFilteredSelected = useMemo(() => {
    if (filteredFids.length === 0) return false;
    let any = false;
    let anyNot = false;
    for (const fid of filteredFids) {
      if (selectedSet[fid]) any = true;
      else anyNot = true;
      if (any && anyNot) return true;
    }
    return false;
  }, [filteredFids, selectedSet]);

  useEffect(() => {
    if (nameFromUrl) setLayerName(nameFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId, nameFromUrl]);



  useEffect(() => {
    try {
      const loggedIn = localStorage.getItem("is_logged_in") === "1";
      const userRaw = localStorage.getItem("auth_user");
      const loginTime = Number(localStorage.getItem("login_time") || "0");
  
      if (!loggedIn || !userRaw || !loginTime) {
        window.location.href = "/login";
        return;
      }
  
      // also ensure not expired
      const age = Date.now() - loginTime;
      if (age >= 5 * 60 * 1000) {
        window.location.href = "/login?reason=expired";
        return;
      }
    } catch {
      window.location.href = "/login";
    }
  }, []);


  useEffect(() => {
    if (!pickAllRef.current) return;
    pickAllRef.current.indeterminate = !allFilteredSelected && someFilteredSelected;
  }, [allFilteredSelected, someFilteredSelected]);

  function getDisplayValue(fid: string, base: any, col: string) {
    if (pending?.[fid] && Object.prototype.hasOwnProperty.call(pending[fid], col)) return pending[fid][col];
    return base;
  }

  async function load() {
    if (saving) return;
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/layers/${layerId}/geojson?mode=full`, { cache: "no-store" });
      const text = await r.text();
      const j: any = safeJsonParse(text);
      if (j?.ok === false) throw new Error(j.error || "Failed to load GeoJSON");

      const fc = j?.geojson ?? j?.data ?? j?.result ?? j?.fc ?? j;
      if (!fc || fc.type !== "FeatureCollection") throw new Error("API did not return a GeoJSON FeatureCollection");

   const apiName = (j?.layer?.name ?? "").trim();
if (apiName) setLayerName(apiName); // only overwrite if API actually has a name

      const feats: any[] = Array.isArray(fc.features) ? fc.features : [];
      const rws: Row[] = feats.map((f, idx) => {
        const fid = String(f?.properties?.__fid ?? f?.id ?? "");
        if (!fid) throw new Error("Missing __fid in GeoJSON feature properties.");
        return { __fid: fid, __idx: idx, props: { ...(f?.properties ?? {}) } };
      });

      setRows(rws);
      setSelectedSet({});
      setPending({});
      setEditing(null);
      setEditingValue("");
      showToast("info", "Layer loaded.");
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
      showToast("error", e?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId]);

  function toggleRow(fid: string, next?: boolean) {
    if (uiLocked) return;
    setSelectedSet((prev) => {
      const v = !!prev[fid];
      const n = typeof next === "boolean" ? next : !v;
      return { ...prev, [fid]: n };
    });
  }

  function selectFiltered() {
    if (uiLocked) return;
    const next: Record<string, boolean> = {};
    for (const fid of filteredFids) next[fid] = true;
    setSelectedSet(next);
  }

  function selectAllOnPage() {
    if (uiLocked) return;
    const next: Record<string, boolean> = { ...selectedSet };
    for (const r of pagedRows) next[r.__fid] = true;
    setSelectedSet(next);
  }

  function clearSelectionOnly() {
    if (uiLocked) return;
    setSelectedSet({});
  }

  function getTargets(): string[] {
    if (applyScope === "all") return rows.map((r) => r.__fid);
    if (applyScope === "filtered") return filteredFids;
    return Object.entries(selectedSet)
      .filter(([, v]) => v)
      .map(([k]) => k);
  }

  // ---------- Inline cell edit ----------
  function startEdit(fid: string, col: string, current: any) {
    if (uiLocked) return;
    setEditing({ fid, col });
    setEditingValue(stringifyCell(current));
  }

  function cancelEdit() {
    setEditing(null);
    setEditingValue("");
  }

  function commitEdit() {
    if (uiLocked) return;
    if (!editing) return;
    const { fid, col } = editing;
    const nextVal = parseValueSmart(editingValue);

    setPending((prev) => {
      const next = { ...prev };
      const byFid = { ...(next[fid] || {}) };
      byFid[col] = nextVal;
      next[fid] = byFid;
      return next;
    });

    setEditing(null);
    setEditingValue("");
  }

  function onEditorKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }

  // ---------- Field calculator (stage edits) ----------
  function applyStage() {
    if (uiLocked) return;

    const targets = new Set(getTargets());
    if (targets.size === 0) {
      showToast("info", "No target rows.");
      return;
    }

    const field = (calcMode === "add" ? newCol : activeCol).trim();
    if (!field) {
      showToast("info", "Choose a column.");
      return;
    }

    if (!isValidFieldName(field)) {
      showToast("error", "Invalid column name. Use letters/numbers/underscore only.");
      return;
    }

    const val = parseValueSmart(newValue);

    setPending((prev) => {
      const next = { ...prev };
      for (const fid of targets) {
        const byFid = { ...(next[fid] || {}) };
        byFid[field] = val;
        next[fid] = byFid;
      }
      return next;
    });

    showToast("success", `Staged ${targets.size} row(s).`);
  }

  function discardEdits() {
    if (uiLocked) return;
    if (!pendingCount) return;
    if (!confirm("Discard ALL unsaved edits?")) return;
    setPending({});
    cancelEdit();
    showToast("info", "Edits discarded.");
  }

  async function saveChanges() {
    if (uiLocked) return;
    if (pendingCount === 0) return;

    const fieldMap = new Map<string, Map<string, { value: any; fids: string[] }>>();

    for (const [fid, changes] of Object.entries(pending)) {
      for (const [field, value] of Object.entries(changes || {})) {
        const valueKey = JSON.stringify(value);
        if (!fieldMap.has(field)) fieldMap.set(field, new Map());
        const vmap = fieldMap.get(field)!;
        if (!vmap.has(valueKey)) vmap.set(valueKey, { value, fids: [] });
        vmap.get(valueKey)!.fids.push(fid);
      }
    }

    setSaving(true);
    setErr("");
    try {
      for (const [field, vmap] of fieldMap.entries()) {
        for (const { value, fids } of vmap.values()) {
          const r = await fetch(`/api/layers/${layerId}/features/bulk`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fids,
              properties: { [field]: value },
            }),
          });

          const text = await r.text();
          const j: any = safeJsonParse(text);
          if (!j?.ok) throw new Error(j?.error || `Save failed for ${field}`);
        }
      }

      await load();
      showToast("success", "Updates saved.");
      setMobilePanelOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
      showToast("error", e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AutoLogout />
    <div className="shell" aria-disabled={uiLocked ? "true" : "false"}>
      <style>{`
        :root{
          --bg0:#ffffff;
          --bg1:#f6f8fb;
          --panel:#ffffff;
          --text:#0b1220;
          --muted: rgba(11,18,32,.60);
          --stroke: rgba(11,18,32,.10);
          --stroke2: rgba(11,18,32,.18);
          --shadow: 0 14px 40px rgba(11,18,32,.10);
          --primary:#0f7a3a;
          --danger:#b42318;
        }
        html, body { height:100%; margin:0; }
        body{
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          color: var(--text);
          background:
            radial-gradient(900px 560px at 14% 0%, rgba(15,122,58,.10), transparent 60%),
            linear-gradient(180deg, var(--bg0), var(--bg1));
        }
        *{ box-sizing:border-box; }

        @keyframes spin { to { transform: rotate(360deg);} }
        @keyframes toastIn { from { transform: translateY(-6px); opacity: 0;} to { transform: translateY(0); opacity: 1;} }
        @keyframes popIn { from { transform: translateY(6px) scale(.98); opacity: 0;} to { transform: translateY(0) scale(1); opacity: 1;} }
        @keyframes sheetUp { from { transform: translateY(14px); opacity: 0;} to { transform: translateY(0); opacity: 1;} }

        /* ✅ use dynamic viewport units so mobile Safari doesn't steal height */
        .shell{ height: 100dvh; display:flex; flex-direction:column; }

        /* top bar */
        .topBar{
          padding: 10px 12px;
          border-bottom: 1px solid var(--stroke);
          background: rgba(255,255,255,.88);
          backdrop-filter: blur(14px);
          display:flex;
          align-items:flex-start;
          gap:10px;
          flex-wrap:wrap;
        }
        .title{
          font-weight: 1000;
          letter-spacing: -.25px;
          display:flex;
          flex-direction:column;
          line-height: 1.05;
          min-width: 160px;
        }
        .sub{
          font-size: 11px;
          color: var(--muted);
          font-weight: 650;
          margin-top: 4px;
          display:flex;
          flex-direction:column; /* ✅ layer name on top of layer id */
          gap:2px;
        }
        .subLine{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 64vw; }

        .pill{
          font-size: 11px;
          font-weight: 750;
          color: rgba(11,18,32,.74);
          border: 1px solid var(--stroke);
          padding: 6px 9px;
          border-radius: 999px;
          background: rgba(255,255,255,.92);
          display:inline-flex;
          align-items:center;
          gap:8px;
          white-space:nowrap;
        }

        .iconBtn{
          width: 40px;
          height: 40px;
          border-radius: 14px;
          border: 1px solid var(--stroke);
          background: rgba(255,255,255,.92);
          color: rgba(11,18,32,.86);
          display:inline-flex;
          align-items:center;
          justify-content:center;
          cursor:pointer;
          transition: transform .10s ease, border-color .15s ease, box-shadow .15s ease, background .15s ease;
          user-select:none;
        }
        .iconBtn:hover{
          border-color: var(--stroke2);
          box-shadow: 0 12px 28px rgba(11,18,32,.10);
          transform: translateY(-1px);
        }
        .iconBtn:active{ transform: translateY(0); }
        .iconBtn[disabled]{ opacity:.55; cursor:not-allowed; transform:none; box-shadow:none; }
        .iconBtnPrimary{
          border-color: rgba(15,122,58,.28);
          background: linear-gradient(180deg, rgba(15,122,58,.10), rgba(255,255,255,.92));
          color: rgba(11,18,32,.92);
        }
        .iconBtnDark{
          border-color: rgba(0,0,0,.18);
          background: #111;
          color: #fff;
        }
        .iconBtnDanger{
          border-color: rgba(180,35,24,.22);
          background: rgba(180,35,24,.06);
          color: rgba(180,35,24,.95);
        }

        .searchWrap{
          display:flex;
          align-items:center;
          gap:8px;
          padding: 0 10px;
          height: 40px;
          border-radius: 14px;
          border: 1px solid var(--stroke);
          background: rgba(255,255,255,.92);
          min-width: 320px;
          flex: 1 1 320px;
        }
        .search{
          border: none;
          outline: none;
          background: transparent;
          width: 100%;
          font-weight: 650;
          font-size: 12px;
          color: rgba(11,18,32,.92);
        }

        .topActions{
          margin-left:auto;
          display:flex;
          gap:8px;
          align-items:center;
          flex-wrap:wrap;
          justify-content:flex-end;
        }

        .main{
          flex: 1;
          min-height:0;
          padding: 12px;
          display:flex;
          flex-direction:column;
          gap: 12px;
        }

        .card{
          border: 1px solid var(--stroke);
          border-radius: 20px;
          background: rgba(255,255,255,.92);
          box-shadow: var(--shadow);
          overflow:hidden;
          min-height:0;
          display:flex;
          flex-direction:column;
        }

        .bar{
          padding: 10px 12px;
          border-bottom: 1px solid var(--stroke);
          display:flex;
          gap:10px;
          align-items:center;
          flex-wrap:wrap;
        }

        .barLeft{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .barRight{ margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:flex-end; }

        .error{
          padding: 10px 12px;
          border: 1px solid rgba(217,45,32,.18);
          background: rgba(217,45,32,.08);
          color: #7a0b1a;
          border-radius: 14px;
          font-weight: 800;
          font-size: 12px;
        }

        .select, .input{
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid var(--stroke);
          background: rgba(255,255,255,.92);
          font-weight: 700;
          outline:none;
          font-size: 12px;
        }
        .input{ min-width: 260px; }

        /* ✅ give table maximum height: it will stretch and take remaining space */
        .tableWrap{
          flex: 1;
          min-height:0;
          overflow:auto;
          background: rgba(11,18,32,.03);
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        table{
          border-collapse: separate;
          border-spacing: 0;
          width: max(100%, 1100px);
        }
        th, td{
          border-bottom: 1px solid rgba(11,18,32,.08);
          padding: 10px 10px;
          text-align:left;
          vertical-align: middle;
          white-space: nowrap;
          font-size: 12px;
          line-height: 1.2;
        }
        th{
          position: sticky;
          top: 0;
          z-index: 3;
          background: rgba(255,255,255,.98);
          border-bottom: 1px solid rgba(11,18,32,.12);
          font-weight: 900;
          color: rgba(11,18,32,.92);
        }
        td{
          font-weight: 500;
          color: rgba(11,18,32,.82);
        }
        tbody tr:hover td{ background: rgba(15,122,58,.06); }

        .rowSelected td{
          background: rgba(15,122,58,.10) !important;
          border-bottom-color: rgba(15,122,58,.18);
        }
        .rowChk{ width:16px; height:16px; cursor:pointer; accent-color: var(--primary); }

        .cellEdited{
          outline: 2px solid rgba(15,122,58,.28);
          outline-offset: -2px;
          background: rgba(15,122,58,.08);
        }
        .cellEditor{
          width: 100%;
          min-width: 140px;
          padding: 8px 9px;
          border-radius: 10px;
          border: 1px solid rgba(11,18,32,.16);
          background: rgba(255,255,255,.98);
          outline:none;
          font-size: 12px;
          font-weight: 650;
        }

        /* toast */
        .toast{
          position: fixed;
          top: 14px;
          right: 14px;
          z-index: 9999;
          border-radius: 16px;
          border: 1px solid var(--stroke);
          background: rgba(255,255,255,.92);
          backdrop-filter: blur(12px);
          box-shadow: 0 18px 60px rgba(11,18,32,.18);
          padding: 10px 12px;
          display:flex;
          align-items:center;
          gap:10px;
          min-width: 260px;
          max-width: 380px;
          animation: toastIn .16s ease-out;
          font-size: 12px;
          font-weight: 700;
          color: rgba(11,18,32,.90);
        }
        .dot{
          width: 10px; height: 10px; border-radius: 999px;
          background: rgba(11,18,32,.45);
        }
        .dot.success{ background: rgba(15,122,58,.85); }
        .dot.error{ background: rgba(180,35,24,.95); }
        .dot.info{ background: rgba(17,102,204,.90); }

        .helper{
          font-size: 11px;
          font-weight: 650;
          color: rgba(11,18,32,.62);
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding: 6px 9px;
          border-radius: 999px;
          border: 1px dashed rgba(11,18,32,.16);
          background: rgba(255,255,255,.72);
        }

        /* saving overlay */
        .overlay{
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
        .overlayTop{
          display:flex;
          gap:12px;
          align-items:center;
        }
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
        .overlayText{ min-width:0; }
        .overlayTitle{
          font-size: 14px;
          font-weight: 950;
          letter-spacing: -.2px;
        }
        .overlaySub{
          margin-top: 3px;
          font-size: 12px;
          font-weight: 650;
          color: rgba(11,18,32,.62);
          line-height: 1.25;
        }
        .overlayHint{
          margin-top: 10px;
          display:flex;
          gap:8px;
          align-items:center;
          font-size: 11px;
          font-weight: 700;
          color: rgba(11,18,32,.62);
          padding: 8px 10px;
          border-radius: 14px;
          border: 1px dashed rgba(11,18,32,.16);
          background: rgba(255,255,255,.72);
        }

        /* ✅ mobile bottom sheet controls */
        .mobileDock{
          display:none;
        }
        .sheet{
          display:none;
        }
        .sheetBackdrop{
          display:none;
        }

        /* ✅ mobile */
        @media (max-width: 520px){
          .main{ padding: 10px; gap: 10px; }
          .card{ border-radius: 18px; }
          .iconBtn{ width: 38px; height: 38px; border-radius: 13px; }
          .pill{ font-size: 10.5px; padding: 6px 8px; }

          /* Hide heavy bars on mobile to free height */
          .desktopBars{ display:none; }

          /* keep table tall; reserve space for bottom dock */
          .main{ padding-bottom: 88px; }
          .tableWrap{ border-top: 1px solid rgba(11,18,32,.06); }

          /* compact header layout */
          .topBar{ gap:8px; }
          .searchWrap{ width: 100%; min-width: 0; }
          .topActions{ width: 100%; justify-content:flex-start; }

          /* bottom dock */
          .mobileDock{
            display:flex;
            position: fixed;
            left: 10px;
            right: 10px;
            bottom: 10px;
            z-index: 40;
            gap: 10px;
            align-items:center;
            justify-content:space-between;
            padding: 10px 10px;
            border-radius: 18px;
            border: 1px solid var(--stroke);
            background: rgba(255,255,255,.92);
            backdrop-filter: blur(12px);
            box-shadow: 0 18px 70px rgba(11,18,32,.18);
          }
          .dockLeft{
            display:flex;
            gap:10px;
            align-items:center;
            min-width:0;
          }
          .dockMeta{
            display:flex;
            flex-direction:column;
            gap:2px;
            min-width:0;
          }
          .dockLine{
            font-size: 11px;
            font-weight: 800;
            color: rgba(11,18,32,.86);
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            max-width: 56vw;
          }
          .dockSub{
            font-size: 10.5px;
            font-weight: 700;
            color: rgba(11,18,32,.58);
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            max-width: 56vw;
          }
          .dockRight{
            display:flex;
            gap:8px;
            align-items:center;
          }

          /* sheet */
          .sheetBackdrop{
            display:block;
            position: fixed;
            inset: 0;
            z-index: 60;
            background: rgba(11,18,32,.24);
            backdrop-filter: blur(3px);
          }
          .sheet{
            display:block;
            position: fixed;
            left: 10px;
            right: 10px;
            bottom: 10px;
            z-index: 70;
            border-radius: 20px;
            border: 1px solid var(--stroke);
            background: rgba(255,255,255,.95);
            backdrop-filter: blur(12px);
            box-shadow: 0 18px 90px rgba(11,18,32,.22);
            overflow:hidden;
            animation: sheetUp .14s ease-out;
          }
          .sheetHead{
            display:flex;
            align-items:center;
            justify-content:space-between;
            padding: 10px 10px;
            border-bottom: 1px solid rgba(11,18,32,.08);
          }
          .sheetTitle{
            font-size: 12px;
            font-weight: 950;
            letter-spacing: -.2px;
          }
          .sheetBody{
            padding: 10px 10px;
            display:flex;
            flex-direction:column;
            gap:10px;
          }
          .sheetGrid{
            display:flex;
            flex-direction:column;
            gap:10px;
          }
          .sheetRow{
            display:flex;
            gap:10px;
            flex-wrap:wrap;
            align-items:center;
          }
          .sheetRow .select,
          .sheetRow .input{
            width: 100%;
            min-width: 0;
          }
          .sheetRowTight{
            display:flex;
            gap:8px;
            align-items:center;
            justify-content:space-between;
          }
          .sheetRowTight .select{
            width: auto;
            min-width: 90px;
            flex: 1 1 auto;
          }
        }
      `}</style>

      {saving ? (
        <OverlaySpinner
          title="Saving your updates…"
          subtitle="Please don’t close this page. We’re updating the selected records and refreshing the layer."
        />
      ) : null}

      {toast.show ? (
        <div className="toast" role="status" aria-live="polite">
          <span className={`dot ${toast.type}`} />
          <div style={{ lineHeight: 1.2 }}>{toast.message}</div>
        </div>
      ) : null}

      <div className="topBar">
        <div className="title">
          <div>GIS Attribute Editor</div>

          {/* ✅ layer name ABOVE layer id */}
          <div className="sub">
            <div className="subLine">Layer: {layerName || "—"}</div>
            <div className="subLine">{layerId}</div>
          </div>
        </div>

        <span className="pill" title="Total rows in this layer">
          {loading ? (
            <>
              <Spinner size={14} /> Loading…
            </>
          ) : (
            `${rows.length} rows`
          )}
        </span>

        <span className="pill" title="Selected rows (checkbox)">
          Selected: {selectedCount}
        </span>

        <span className="pill" title="Total staged edits not yet saved">
          Unsaved: {pendingCount}
        </span>

        <div className="topActions">
          <div className="searchWrap" title="Search in table values (and staged edits)">
            <Icon name="search" />
            <input
              className="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search table…"
              disabled={uiLocked}
            />
          </div>

          <button
            className="iconBtn iconBtnPrimary"
            onClick={selectFiltered}
            type="button"
            disabled={uiLocked || filteredFids.length === 0}
            title="Select all filtered rows"
            aria-label="Select filtered"
          >
            <Icon name="filter" />
          </button>

          <button
            className="iconBtn"
            onClick={clearSelectionOnly}
            type="button"
            disabled={uiLocked || selectedCount === 0}
            title="Clear selection"
            aria-label="Clear selection"
          >
            <Icon name="clear" />
          </button>

          <button
            className="iconBtn"
            onClick={load}
            type="button"
            title="Reload from database"
            aria-label="Reload"
            disabled={uiLocked}
          >
            <Icon name="reload" />
          </button>
        </div>
      </div>

      <div className="main">
        {err ? <div className="error">⚠ {err}</div> : null}

        <div className="card">
          {/* ✅ DESKTOP/TABLET BARS (hidden on mobile) */}
          <div className="desktopBars">
            {/* FIELD CALCULATOR + Save */}
            <div className="bar">
              <div className="pill">Field Calculator</div>

              <select
                className="select"
                value={applyScope}
                onChange={(e) => setApplyScope(e.target.value as any)}
                title="Where to apply"
                disabled={uiLocked}
              >
                <option value="selected">Apply to selected rows</option>
                <option value="filtered">Apply to ALL filtered rows</option>
                <option value="all">Apply to ALL rows</option>
              </select>

              <select
                className="select"
                value={calcMode}
                onChange={(e) => setCalcMode(e.target.value as any)}
                title="Mode"
                disabled={uiLocked}
              >
                <option value="update">Update existing column</option>
                <option value="add">Add new column</option>
              </select>

              {calcMode === "update" ? (
                <select
                  className="select"
                  value={activeCol}
                  onChange={(e) => setActiveCol(e.target.value)}
                  style={{ minWidth: 260 }}
                  title="Choose column"
                  disabled={uiLocked}
                >
                  <option value="">Choose column…</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  value={newCol}
                  onChange={(e) => setNewCol(e.target.value)}
                  placeholder="New column name (e.g. PO_NAME)"
                  style={{ minWidth: 260 }}
                  title="New column name"
                  disabled={uiLocked}
                />
              )}

              <input
                className="input"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder='New value (text/123/true/false/null or {"a":1})'
                style={{ flex: 1, minWidth: 320 }}
                title="New value"
                disabled={uiLocked}
              />

              <div className="barRight">
                <button
                  className="iconBtn iconBtnPrimary"
                  type="button"
                  onClick={applyStage}
                  disabled={
                    uiLocked ||
                    (applyScope === "selected" && selectedCount === 0) ||
                    (calcMode === "update" && !activeCol) ||
                    (calcMode === "add" && !newCol.trim())
                  }
                  title="Apply (stage)"
                  aria-label="Apply (stage)"
                >
                  <Icon name="apply" />
                </button>

                <button
                  className="iconBtn iconBtnDanger"
                  type="button"
                  onClick={discardEdits}
                  disabled={uiLocked || pendingCount === 0}
                  title="Discard all unsaved edits"
                  aria-label="Discard edits"
                >
                  <Icon name="trash" />
                </button>

                <button
                  className="iconBtn iconBtnDark"
                  type="button"
                  onClick={saveChanges}
                  disabled={uiLocked || pendingCount === 0}
                  title="Save all staged edits"
                  aria-label="Save changes"
                >
                  {saving ? <Spinner size={16} /> : <Icon name="save" />}
                </button>
              </div>
            </div>

            {/* TABLE BAR */}
            <div className="bar">
              <div className="barLeft">
                <span className="pill">
                  Showing <b>{filteredRows.length}</b> filtered • Page <b>{pageSafe}</b>/<b>{pageCount}</b>
                </span>

                <span className="helper" title="Double-click any cell. Enter = commit, Esc = cancel. Click outside to commit too.">
                  <Icon name="info" size={14} /> Double-click cell to edit
                </span>

                <button
                  className="iconBtn"
                  type="button"
                  onClick={selectAllOnPage}
                  disabled={uiLocked || pagedRows.length === 0}
                  title="Select all rows on this page"
                  aria-label="Select page"
                >
                  <Icon name="filter" />
                </button>
              </div>

              <div className="barRight">
                <button className="iconBtn" type="button" onClick={() => setPage(1)} disabled={uiLocked || pageSafe <= 1} title="First page">
                  <Icon name="first" />
                </button>
                <button
                  className="iconBtn"
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={uiLocked || pageSafe <= 1}
                  title="Previous page"
                >
                  <Icon name="prev" />
                </button>
                <button
                  className="iconBtn"
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={uiLocked || pageSafe >= pageCount}
                  title="Next page"
                >
                  <Icon name="next" />
                </button>
                <button
                  className="iconBtn"
                  type="button"
                  onClick={() => setPage(pageCount)}
                  disabled={uiLocked || pageSafe >= pageCount}
                  title="Last page"
                >
                  <Icon name="last" />
                </button>

                <select
                  className="select"
                  value={pageSize}
                  onChange={(e) => setPageSize(Math.max(1, Number(e.target.value) || 100))}
                  title="Rows per page"
                  style={{ height: 40 }}
                  disabled={uiLocked}
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
              </div>
            </div>
          </div>

          {/* TABLE */}
          <div className="tableWrap" onClick={() => editing && !uiLocked && cancelEdit()} style={{ pointerEvents: saving ? "none" : "auto" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>
                    <input
                      ref={pickAllRef}
                      className="rowChk"
                      type="checkbox"
                      checked={allFilteredSelected}
                      disabled={uiLocked}
                      onChange={() => {
                        if (uiLocked) return;
                        if (filteredFids.length === 0) return;
                        if (allFilteredSelected) {
                          setSelectedSet((prev) => {
                            const next = { ...prev };
                            for (const fid of filteredFids) delete next[fid];
                            return next;
                          });
                        } else {
                          setSelectedSet((prev) => {
                            const next = { ...prev };
                            for (const fid of filteredFids) next[fid] = true;
                            return next;
                          });
                        }
                      }}
                      title="Select all filtered rows (all pages)"
                      aria-label="Select all filtered rows"
                    />
                  </th>
                  <th style={{ width: 240 }}>__fid</th>
                  {columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {pagedRows.map((r) => {
                  const checked = !!selectedSet[r.__fid];
                  return (
                    <tr key={r.__fid} className={checked ? "rowSelected" : ""}>
                      <td>
                        <input
                          className="rowChk"
                          type="checkbox"
                          checked={checked}
                          disabled={uiLocked}
                          onChange={(e) => toggleRow(r.__fid, e.target.checked)}
                          aria-label={`Select row ${r.__fid}`}
                        />
                      </td>

                      <td style={{ fontWeight: 650 }}>{r.__fid}</td>

                      {columns.map((c) => {
                        const baseVal = r.props?.[c];
                        const displayVal = getDisplayValue(r.__fid, baseVal, c);

                        const hasPending = pending?.[r.__fid] && Object.prototype.hasOwnProperty.call(pending[r.__fid], c);
                        const isEditing = editing?.fid === r.__fid && editing?.col === c;

                        return (
                          <td
                            key={c}
                            className={hasPending ? "cellEdited" : ""}
                            title={uiLocked ? "Disabled while updating…" : "Double-click to edit"}
                            onDoubleClick={(e) => {
                              if (uiLocked) return;
                              e.stopPropagation();
                              startEdit(r.__fid, c, displayVal);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {isEditing ? (
                              <input
                                autoFocus
                                className="cellEditor"
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onKeyDown={onEditorKeyDown}
                                onBlur={() => commitEdit()}
                                onClick={(e) => e.stopPropagation()}
                                disabled={uiLocked}
                              />
                            ) : (
                              stringifyCell(displayVal)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={2 + columns.length} style={{ padding: 14, opacity: 0.7, fontWeight: 700 }}>
                      {loading ? "Loading…" : "No rows found."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ✅ MOBILE DOCK (always visible on phone) */}
      <div className="mobileDock" aria-hidden={false}>
        <div className="dockLeft">
          <button
            className="iconBtn"
            type="button"
            onClick={() => setMobilePanelOpen((v) => !v)}
            disabled={uiLocked}
            aria-label="Open controls"
            title="Controls"
          >
            <Icon name="sliders" />
          </button>

          <div className="dockMeta">
            <div className="dockLine">
              Page {pageSafe}/{pageCount} • {filteredRows.length} rows
            </div>
            <div className="dockSub">
              Selected {selectedCount} • Unsaved {pendingCount}
            </div>
          </div>
        </div>

        <div className="dockRight">
          <button
            className="iconBtn iconBtnDanger"
            type="button"
            onClick={discardEdits}
            disabled={uiLocked || pendingCount === 0}
            aria-label="Discard edits"
            title="Discard edits"
          >
            <Icon name="trash" />
          </button>

          <button
            className="iconBtn iconBtnDark"
            type="button"
            onClick={saveChanges}
            disabled={uiLocked || pendingCount === 0}
            aria-label="Save changes"
            title="Save changes"
          >
            {saving ? <Spinner size={16} /> : <Icon name="save" />}
          </button>
        </div>
      </div>

      {/* ✅ MOBILE SHEET (controls) */}
      {mobilePanelOpen ? (
        <>
          <div
            className="sheetBackdrop"
            onClick={() => setMobilePanelOpen(false)}
            role="button"
            aria-label="Close controls"
            tabIndex={0}
          />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Controls">
            <div className="sheetHead">
              <div className="sheetTitle">Controls</div>
              <button className="iconBtn" type="button" onClick={() => setMobilePanelOpen(false)} aria-label="Close">
                <Icon name="chevDown" />
              </button>
            </div>

            <div className="sheetBody">
              {/* Quick paging */}
              <div className="sheetRowTight">
                <button className="iconBtn" type="button" onClick={() => setPage(1)} disabled={uiLocked || pageSafe <= 1} aria-label="First page">
                  <Icon name="first" />
                </button>
                <button
                  className="iconBtn"
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={uiLocked || pageSafe <= 1}
                  aria-label="Previous page"
                >
                  <Icon name="prev" />
                </button>
                <button
                  className="iconBtn"
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={uiLocked || pageSafe >= pageCount}
                  aria-label="Next page"
                >
                  <Icon name="next" />
                </button>
                <button className="iconBtn" type="button" onClick={() => setPage(pageCount)} disabled={uiLocked || pageSafe >= pageCount} aria-label="Last page">
                  <Icon name="last" />
                </button>

                <select
                  className="select"
                  value={pageSize}
                  onChange={(e) => setPageSize(Math.max(1, Number(e.target.value) || 100))}
                  disabled={uiLocked}
                  aria-label="Rows per page"
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
              </div>

              <div className="sheetRow">
                <button
                  className="iconBtn iconBtnPrimary"
                  onClick={selectFiltered}
                  type="button"
                  disabled={uiLocked || filteredFids.length === 0}
                  aria-label="Select filtered"
                  title="Select filtered"
                >
                  <Icon name="filter" />
                </button>

                <button
                  className="iconBtn"
                  onClick={clearSelectionOnly}
                  type="button"
                  disabled={uiLocked || selectedCount === 0}
                  aria-label="Clear selection"
                  title="Clear selection"
                >
                  <Icon name="clear" />
                </button>

                <button className="iconBtn" onClick={load} type="button" disabled={uiLocked} aria-label="Reload" title="Reload">
                  <Icon name="reload" />
                </button>
              </div>

              {/* Field calculator */}
              <div className="sheetGrid">
                <div className="sheetRow">
                  <select className="select" value={applyScope} onChange={(e) => setApplyScope(e.target.value as any)} disabled={uiLocked}>
                    <option value="selected">Apply to selected rows</option>
                    <option value="filtered">Apply to ALL filtered rows</option>
                    <option value="all">Apply to ALL rows</option>
                  </select>

                  <select className="select" value={calcMode} onChange={(e) => setCalcMode(e.target.value as any)} disabled={uiLocked}>
                    <option value="update">Update existing column</option>
                    <option value="add">Add new column</option>
                  </select>
                </div>

                <div className="sheetRow">
                  {calcMode === "update" ? (
                    <select className="select" value={activeCol} onChange={(e) => setActiveCol(e.target.value)} disabled={uiLocked}>
                      <option value="">Choose column…</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input"
                      value={newCol}
                      onChange={(e) => setNewCol(e.target.value)}
                      placeholder="New column name (e.g. PO_NAME)"
                      disabled={uiLocked}
                    />
                  )}

                  <input
                    className="input"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder='New value (text/123/true/false/null or {"a":1})'
                    disabled={uiLocked}
                  />
                </div>

                <div className="sheetRow">
                  <button
                    className="iconBtn iconBtnPrimary"
                    type="button"
                    onClick={applyStage}
                    disabled={
                      uiLocked ||
                      (applyScope === "selected" && selectedCount === 0) ||
                      (calcMode === "update" && !activeCol) ||
                      (calcMode === "add" && !newCol.trim())
                    }
                    aria-label="Apply (stage)"
                    title="Apply (stage)"
                  >
                    <Icon name="apply" />
                  </button>

                  <span className="helper" title="Tip">
                    <Icon name="info" size={14} /> Double-tap a cell (or zoom) then edit
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
    </>
  );
}