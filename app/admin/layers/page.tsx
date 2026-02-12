"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ResultMap from "@/app/components/ResultMapClient";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUpload,
  faRotateRight,
  faMagnifyingGlass,
  faEye,
  faDownload,
  faTrash,
  faPenToSquare,
  faXmark,
  faFloppyDisk,
  faArrowRotateLeft,
  faCircleInfo,
  faTriangleExclamation,
  faCircleCheck,
  faCircleXmark,
  faPlus,
  faKeyboard,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";

/** ---------------- types ---------------- */

type LayerRow = {
  id: string;
  name: string;
  source_filename: string | null;
  geom_type: string | null;
  srid: number | null;
  feature_count: number | null;
  fields?: any;
  created_at?: string | null;
};

type FeatureOption = {
  idx: number;
  fid: string | null; // uuid string
  label: string;
};

type RowKV = { key: string; value: string };

/** ---------------- Tooltip (fixed-position so it works inside overflow areas) ---------------- */

function Tooltip({
  text,
  children,
  side = "top",
}: {
  text: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  function compute() {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 10;

    let x = r.left + r.width / 2;
    let y = r.top;

    if (side === "bottom") y = r.bottom;
    else if (side === "left") {
      x = r.left;
      y = r.top + r.height / 2;
    } else if (side === "right") {
      x = r.right;
      y = r.top + r.height / 2;
    } else y = r.top;

    if (side === "top") y -= pad;
    if (side === "bottom") y += pad;
    if (side === "left") x -= pad;
    if (side === "right") x += pad;

    setPos({ x, y });
  }

  function show() {
    compute();
    setOpen(true);
  }
  function hide() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onScroll = () => compute();
    const onResize = () => compute();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, side]);

  function onTouchStart() {
    show();
  }
  function onTouchEnd() {
    window.setTimeout(() => hide(), 800);
  }

  return (
    <span
      ref={wrapRef}
      style={{ display: "inline-flex" }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {children}

      {open ? (
        <span
          className="ttFixed"
          role="tooltip"
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.y,
            transform:
              side === "top"
                ? "translate(-50%, -100%)"
                : side === "bottom"
                ? "translate(-50%, 0%)"
                : side === "left"
                ? "translate(-100%, -50%)"
                : "translate(0%, -50%)",
            zIndex: 999999,
          }}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

/** ---------------- Snackbar / Toast (TOP, always above modals/drawer) ---------------- */

type NoticeKind = "success" | "error" | "info" | "warn" | "loading";
type Notice = {
  open: boolean;
  kind: NoticeKind;
  title: string;
  message?: string;
  tick: number;
  sticky?: boolean; // if true, do not auto-dismiss
};

function formatTime(d: Date) {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  return `${hh}:${m} ${ampm}`;
}

function noticeTheme(kind: NoticeKind) {
  if (kind === "loading")
    return {
      bg: "#F8FAFC",
      border: "#CBD5E1",
      text: "#0F172A",
      bar: "#94A3B8",
      icon: faSpinner,
      spin: true,
    };
  if (kind === "success")
    return { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46", bar: "#34D399", icon: faCircleCheck, spin: false };
  if (kind === "error")
    return { bg: "#FFF1F2", border: "#FECDD3", text: "#9F1239", bar: "#FB7185", icon: faCircleXmark, spin: false };
  if (kind === "warn")
    return { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", bar: "#F59E0B", icon: faTriangleExclamation, spin: false };
  return { bg: "#EFF6FF", border: "#BFDBFE", text: "#1D4ED8", bar: "#60A5FA", icon: faCircleInfo, spin: false };
}

function Snackbar({
  notice,
  onClose,
  durationMs = 2600,
}: {
  notice: Notice;
  onClose: () => void;
  durationMs?: number;
}) {
  if (!notice.open) return null;
  const t = noticeTheme(notice.kind);

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          left: "50%",
          top: 14,
          transform: "translateX(-50%)",
          zIndex: 20080, // ✅ higher than drawer + confirm modal
          width: "min(560px, calc(100vw - 24px))",
          pointerEvents: "none",
        }}
      >
        <div className="snack" style={{ pointerEvents: "auto", background: t.bg, border: `1px solid ${t.border}` }}>
          <div className="snackRow">
            <div className="snackIcon" style={{ color: t.text }}>
              <FontAwesomeIcon icon={t.icon} spin={!!(t as any).spin} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="snackTitle" style={{ color: t.text }}>
                {notice.title}
              </div>
              {notice.message ? <div className="snackMsg">{notice.message}</div> : null}
            </div>

            <Tooltip text="Dismiss" side="left">
              <button onClick={onClose} aria-label="Dismiss" className="iconBtn">
                <FontAwesomeIcon icon={faXmark} className="iconNeutral" />
              </button>
            </Tooltip>
          </div>

          {!notice.sticky ? (
            <div className="snackBar">
              <div
                key={notice.tick}
                className="snackBarFill"
                style={{ background: t.bar, animation: `snackBar ${durationMs}ms linear forwards` }}
              />
            </div>
          ) : null}
        </div>
      </div>

      <style>{`
        @keyframes snackIn {
          from { transform: translateY(-8px); opacity: 0; }
          to   { transform: translateY(0px); opacity: 1; }
        }
        @keyframes snackBar {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </>
  );
}

/** ---------------- Confirm Modal (always above drawer) ---------------- */

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "default" | "danger";
};

function ConfirmModal({
  state,
  onConfirm,
  onCancel,
}: {
  state: ConfirmState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!state.open) return null;
  const danger = state.tone === "danger";

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      className="overlay overlayTop"
      style={{ zIndex: 20060 }} // ✅ above drawer
    >
      <div onClick={(e) => e.stopPropagation()} className="modal">
        <div className="modalHead">
          <div className="modalTitleRow">
            <span className={`modalDot ${danger ? "dotRed" : "dotBlue"}`} />
            <div className="modalTitle">{state.title}</div>
          </div>

          <Tooltip text="Close" side="left">
            <button onClick={onCancel} aria-label="Close" className="iconBtn">
              <FontAwesomeIcon icon={faXmark} className="iconNeutral" />
            </button>
          </Tooltip>
        </div>

        <div className="modalBody" style={{ whiteSpace: "pre-wrap" }}>
          {state.message}
        </div>

        <div className="modalFoot">
          <button onClick={onCancel} className="btnGhost">
            {state.cancelText ?? "Cancel"}
          </button>
          <button onClick={onConfirm} className={danger ? "btnDanger" : "btnPrimary"}>
            {state.confirmText ?? "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** ---------------- helpers ---------------- */

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text };
  }
}

function toStringValue(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

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

function propsToRows(props: Record<string, any>): RowKV[] {
  const { __fid, ...rest } = props as any;
  const keys = Object.keys(rest || {}).sort((a, b) => a.localeCompare(b));
  return keys.map((k) => ({ key: k, value: toStringValue(rest[k]) }));
}

function rowsToProps(rows: RowKV[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const r of rows) {
    const k = (r.key || "").trim();
    if (!k) continue;
    out[k] = parseValueSmart(r.value);
  }
  return out;
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

function shallowEqualRows(a: RowKV[], b: RowKV[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].key !== b[i].key) return false;
    if (a[i].value !== b[i].value) return false;
  }
  return true;
}

/** ---------------- component ---------------- */

export default function AdminLayersPage() {
  const [layers, setLayers] = useState<LayerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [geojson, setGeojson] = useState<any | null>(null);

  const [loadingList, setLoadingList] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  // Upload modal state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Rename modal state
    const [showRename, setShowRename] = useState(false);
    const [renameId, setRenameId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [renaming, setRenaming] = useState(false);
  
  // Drawer state (edit modal)
  const [showAttrDrawer, setShowAttrDrawer] = useState(false);

  // Attribute editor state
  const [featureIndex, setFeatureIndex] = useState<number>(0);
  const [selectedFid, setSelectedFid] = useState<string | null>(null);
  const [selectedProps, setSelectedProps] = useState<Record<string, any> | null>(null);

  const [propRows, setPropRows] = useState<RowKV[]>([]);
  const [baselineRows, setBaselineRows] = useState<RowKV[]>([]);

  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const [savingAttr, setSavingAttr] = useState(false);
  const [attrStatus, setAttrStatus] = useState<string>("");

  const [search, setSearch] = useState("");
  const [fieldSearch, setFieldSearch] = useState("");

  const abortGeojsonRef = useRef<AbortController | null>(null);

  /** Snackbar state */
  const [notice, setNotice] = useState<Notice>({
    open: false,
    kind: "info",
    title: "",
    message: "",
    tick: 0,
    sticky: false,
  });
  const noticeTimerRef = useRef<number | null>(null);

  function closeNotice() {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = null;
    setNotice((p) => ({ ...p, open: false, sticky: false }));
  }

  function showNotice(kind: NoticeKind, title: string, message?: string, ms = 2600, sticky = false) {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    setNotice({ open: true, kind, title, message, tick: Date.now(), sticky });

    if (!sticky) {
      noticeTimerRef.current = window.setTimeout(() => {
        setNotice((p) => ({ ...p, open: false, sticky: false }));
        noticeTimerRef.current = null;
      }, ms);
    } else {
      noticeTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  /** Confirm modal */
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
    confirmText: "Continue",
    cancelText: "Cancel",
    tone: "default",
  });
  const confirmResolveRef = useRef<((v: boolean) => void) | null>(null);

  function confirmUI(opts: Omit<ConfirmState, "open">): Promise<boolean> {
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmState({ open: true, ...opts });
    });
  }

  function closeConfirm(v: boolean) {
    setConfirmState((p) => ({ ...p, open: false }));
    const r = confirmResolveRef.current;
    confirmResolveRef.current = null;
    r?.(v);
  }

  const mapKey = useMemo(() => selectedId ?? "none", [selectedId]);
  const featureCount = useMemo(() => geojson?.features?.length ?? 0, [geojson]);
  const selectedLayer = useMemo(() => layers.find((l) => l.id === selectedId) ?? null, [layers, selectedId]);

  const filteredLayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return layers;
    return layers.filter((l) => {
      const hay = `${l.name} ${l.source_filename ?? ""} ${l.geom_type ?? ""} ${l.srid ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [layers, search]);

  const featureOptions = useMemo<FeatureOption[]>(() => {
    const feats: any[] = geojson?.features ?? [];
    return feats.map((f: any, idx: number): FeatureOption => {
      const fidRaw = f?.properties?.__fid;
      const fid = typeof fidRaw === "string" && fidRaw ? fidRaw : null;

      const label =
        f?.properties?.NAME ||
        f?.properties?.PA ||
        f?.properties?.CBFMA_NO ||
        f?.properties?.PO_NAME ||
        f?.properties?.MUNI_CITY ||
        f?.properties?.BARANGAY ||
        `Feature ${idx + 1}`;

      return { idx, fid, label: String(label) };
    });
  }, [geojson]);

  const hasUnsavedChanges = useMemo(() => !shallowEqualRows(propRows, baselineRows), [propRows, baselineRows]);

  // ✅ FIX: keep original index so edit/remove works even when filtered
  const filteredPropRows = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    const withIndex = propRows.map((row, i) => ({ row, i }));
    if (!q) return withIndex;
    return withIndex.filter(({ row }) => row.key.toLowerCase().includes(q) || row.value.toLowerCase().includes(q));
  }, [propRows, fieldSearch]);

  async function confirmLoseChanges(): Promise<boolean> {
    if (!hasUnsavedChanges) return true;

    return confirmUI({
      title: "Discard unsaved changes?",
      message:
        "You have edits that are not saved yet.\n\nIf you continue, your changes will be lost.",
      confirmText: "Discard changes",
      cancelText: "Keep editing",
      tone: "default",
    });
  }

  async function refresh() {
    setLoadingList(true);
    setError("");
    try {
      const r = await fetch("/api/layers", { cache: "no-store" });
      const text = await r.text();
      const j: any = safeJsonParse(text);
      if (!j.ok) throw new Error(j.error || "Failed to load layers");
      setLayers(j.layers || []);
      showNotice("success", "Layers updated", `Refreshed • ${formatTime(new Date())}`);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
      showNotice("error", "Failed to load layers", e?.message ?? "Please try again.");
    } finally {
      setLoadingList(false);
    }
  }

  function loadPropsToEditor(props: Record<string, any> | null) {
    if (!props) {
      setPropRows([]);
      setBaselineRows([]);
      setNewKey("");
      setNewValue("");
      setFieldSearch("");
      return;
    }
    const rows = propsToRows(props);
    setPropRows(rows);
    setBaselineRows(rows);
    setNewKey("");
    setNewValue("");
    setFieldSearch("");
  }

  function selectFeatureByIndex(i: number) {
    setAttrStatus("");
    setError("");

    const f = geojson?.features?.[i];
    if (!f) {
      setSelectedFid(null);
      setSelectedProps(null);
      loadPropsToEditor(null);
      return;
    }

    const fidRaw = f?.properties?.__fid;
    const fid = typeof fidRaw === "string" && fidRaw ? fidRaw : null;

    if (!fid) {
      const msg = "This GeoJSON has no properties.__fid (uuid). Your /geojson API must include __fid.";
      setError(msg);
      showNotice("error", "Missing __fid", msg, 3200);
      setSelectedFid(null);
      setSelectedProps(null);
      loadPropsToEditor(null);
      return;
    }

    const props = (f.properties || {}) as Record<string, any>;
    setSelectedFid(fid);
    setSelectedProps(props);
    loadPropsToEditor(props);
  }

  function reselectByFid(fidToKeep: string | null, fc: any) {
    if (!fidToKeep) return;
    const feats: any[] = fc?.features ?? [];
    const idx = feats.findIndex((f) => String(f?.properties?.__fid ?? "") === String(fidToKeep));
    if (idx >= 0) {
      setFeatureIndex(idx);
      setTimeout(() => selectFeatureByIndex(idx), 0);
    }
  }

  async function previewLayer(layerId: string, keepFid?: string | null) {
    const ok = await confirmLoseChanges();
    if (!ok) return;

    abortGeojsonRef.current?.abort();
    abortGeojsonRef.current = new AbortController();

    setBusyId(layerId);
    setSelectedId(layerId);
    setGeojson(null);
    setError("");

    setFeatureIndex(0);
    setSelectedFid(null);
    setSelectedProps(null);
    loadPropsToEditor(null);
    setAttrStatus("");

    showNotice("loading", "Loading preview…", "Fetching GeoJSON", 999999, true);

    try {
      const r = await fetch(`/api/layers/${layerId}/geojson`, {
        cache: "no-store",
        signal: abortGeojsonRef.current.signal,
      });
      const text = await r.text();
      const j: any = safeJsonParse(text);

      if (j?.ok === false) throw new Error(j.error || "Failed to load GeoJSON");
      const fc = coerceFeatureCollection(j);
      if (!fc) throw new Error("API did not return a GeoJSON FeatureCollection.");

      setGeojson(fc);

      if (fc?.features?.length) {
        if (keepFid != null) reselectByFid(keepFid, fc);
        else {
          setFeatureIndex(0);
          setTimeout(() => selectFeatureByIndex(0), 0);
        }
        showNotice("success", "Preview ready", `${fc.features.length} feature(s) loaded`);
      } else {
        setAttrStatus("Loaded GeoJSON but it has 0 features.");
        showNotice("info", "No features found", "This layer loaded but has 0 features.");
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError(e?.message ?? "Failed");
      showNotice("error", "Preview failed", e?.message ?? "Could not load GeoJSON.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveAttributes() {
    if (!selectedId) {
      setError("No layer selected.");
      showNotice("warn", "Nothing to save", "No layer selected.");
      return;
    }
    if (!selectedFid) {
      setError("No feature selected.");
      showNotice("warn", "Nothing to save", "No feature selected.");
      return;
    }
    if (!hasUnsavedChanges) {
      showNotice("info", "No changes", "There is nothing new to save.");
      return;
    }

    const ok = await confirmUI({
      title: "Save changes?",
      message:
        "This will update the selected feature attributes.\n\nDo you want to save now?",
      confirmText: "Save",
      cancelText: "Cancel",
      tone: "default",
    });
    if (!ok) return;

    const nextProps = rowsToProps(propRows);
    if ("__fid" in nextProps) delete (nextProps as any).__fid;

    setSavingAttr(true);
    setAttrStatus("Saving…");
    setError("");
    showNotice("loading", "Saving…", "Updating feature attributes", 999999, true);

    try {
      const r = await fetch(`/api/layers/${selectedId}/features/${selectedFid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ properties: nextProps }),
      });

      const text = await r.text();
      const j: any = safeJsonParse(text);
      if (!j.ok) throw new Error(j.error || "Failed to save attributes");

      setAttrStatus("");
      setBaselineRows(propRows);

      showNotice("success", "Saved", `Updated • ${formatTime(new Date())}`);
      await previewLayer(selectedId, selectedFid);
    } catch (e: any) {
      setAttrStatus("");
      setError(e?.message ?? "Save failed");
      showNotice("error", "Save failed", e?.message ?? "Please try again.");
    } finally {
      setSavingAttr(false);
    }
  }

  async function downloadGeoJSON(layerId: string, name: string) {
    setBusyId(layerId);
    setError("");
    showNotice("loading", "Preparing download…", "Building GeoJSON file", 999999, true);

    try {
      const r = await fetch(`/api/layers/${layerId}/geojson`, { cache: "no-store" });
      const text = await r.text();
      const j: any = safeJsonParse(text);

      if (j?.ok === false) throw new Error(j.error || "Failed to get GeoJSON");
      const fc = coerceFeatureCollection(j);
      if (!fc) throw new Error("API did not return a GeoJSON FeatureCollection.");

      const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${(name || "layer").replace(/[^\w\-]+/g, "_")}.geojson`;
      a.click();

      URL.revokeObjectURL(url);
      showNotice("success", "Download started", `${name || "Layer"} is downloading…`);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
      showNotice("error", "Download failed", e?.message ?? "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteLayer(layerId: string, name: string) {
    const ok = await confirmUI({
      title: "Delete this layer?",
      message: `You're about to delete:\n\n"${name}"\n\nThis will also delete all its features. This cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      tone: "danger",
    });
    if (!ok) return;

    setBusyId(layerId);
    setError("");
    showNotice("loading", "Deleting…", "Removing layer and features", 999999, true);

    try {
      const r = await fetch(`/api/layers/${layerId}`, { method: "DELETE" });
      const text = await r.text();
      const j: any = safeJsonParse(text);

      if (!j.ok) throw new Error(j.error || "Delete failed");

      if (selectedId === layerId) {
        setSelectedId(null);
        setGeojson(null);
        setSelectedFid(null);
        setSelectedProps(null);
        loadPropsToEditor(null);
        setAttrStatus("");
        setShowAttrDrawer(false);
      }

      await refresh();
      showNotice("success", "Deleted", `"${name}" removed.`);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
      showNotice("error", "Delete failed", e?.message ?? "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  function openUpload() {
    setUploadStatus("");
    setUploadName("");
    setShowUpload(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openRename(layer: LayerRow) {
    setRenameId(layer.id);
    setRenameValue(layer.name ?? "");
    setShowRename(true);
  }

  function closeRename() {
    if (renaming) return;
    setShowRename(false);
    setRenameId(null);
    setRenameValue("");
  }

  async function renameLayer() {
    if (!renameId) return;

    const newName = renameValue.trim();
    if (!newName) {
      showNotice("warn", "Name required", "Please enter a layer name.");
      return;
    }

    const ok = await confirmUI({
      title: "Rename this layer?",
      message: `New name:\n\n"${newName}"`,
      confirmText: "Rename",
      cancelText: "Cancel",
      tone: "default",
    });
    if (!ok) return;

    setRenaming(true);
    setError("");
    showNotice("loading", "Renaming…", "Updating layer name", 999999, true);

    try {
      // ✅ API will be next: PATCH /api/layers/:id
      const r = await fetch(`/api/layers/${renameId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });

      const text = await r.text();
      const j: any = safeJsonParse(text);
      if (!j.ok) throw new Error(j.error || "Rename failed");

      // ✅ update local list immediately
      setLayers((prev) => prev.map((l) => (l.id === renameId ? { ...l, name: newName } : l)));

      showNotice("success", "Renamed", `Layer updated • ${formatTime(new Date())}`);

      // ✅ if currently selected, update title area too
      if (selectedId === renameId) {
        // selectedLayer is derived from layers so it updates automatically
      }

      closeRename();
    } catch (e: any) {
      setError(e?.message ?? "Rename failed");
      showNotice("error", "Rename failed", e?.message ?? "Please try again.");
    } finally {
      setRenaming(false);
    }
  }


  function closeUpload() {
    if (uploading) return;
    setShowUpload(false);
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadStatus("Uploading…");
    setError("");
    showNotice("loading", "Uploading…", "Importing GeoJSON", 999999, true);

    try {
      const form = new FormData();
      form.append("file", file);
      if (uploadName.trim()) form.append("name", uploadName.trim());

      const res = await fetch("/api/layers/upload", { method: "POST", body: form });
      const text = await res.text();
      const data: any = safeJsonParse(text);

      if (!data.ok) {
        const msg = data.error ?? "Upload failed";
        setUploadStatus(`❌ ${msg}`);
        showNotice("error", "Upload failed", msg);
        return;
      }

      setUploadStatus(`✅ Uploaded: ${data.name} (${data.featureCount} features)`);
      showNotice("success", "Upload complete", `${data.name} (${data.featureCount} features)`);

      await refresh();
      if (data.layerId) await previewLayer(data.layerId);
    } catch (e: any) {
      setUploadStatus(`❌ Upload failed: ${e?.message ?? "Unknown error"}`);
      showNotice("error", "Upload failed", e?.message ?? "Unknown error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function openDrawer() {
    if (!geojson?.features?.length) {
      showNotice("info", "No features", "Preview a layer first.");
      return;
    }
    if (!selectedFid) {
      setFeatureIndex(0);
      setTimeout(() => selectFeatureByIndex(0), 0);
    }
    setShowAttrDrawer(true);
  }

  // ✅ Lock page scroll when overlays are open
  useEffect(() => {
    const anyOverlay = showAttrDrawer || showUpload || confirmState.open;
    const prev = document.body.style.overflow;
    document.body.style.overflow = anyOverlay ? "hidden" : "hidden"; // keep app shell fixed
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, [showAttrDrawer, showUpload, confirmState.open]);

  // Ctrl/Cmd+S save + ESC close
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        if (!showAttrDrawer) return;
        e.preventDefault();
        if (!savingAttr && selectedId && selectedFid) saveAttributes();
      }

      if (e.key === "Escape") {
        if (showUpload) closeUpload();
        if (showRename) closeRename();
        if (showAttrDrawer) {
          (async () => {
            const ok = await confirmLoseChanges();
            if (!ok) return;
            setShowAttrDrawer(false);
          })();
        }
        if (confirmState.open) closeConfirm(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAttrDrawer, savingAttr, selectedId, selectedFid, hasUnsavedChanges, showUpload, confirmState.open]);

  useEffect(() => {
    // initial load
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!geojson?.features?.length) return;
    const i = Math.min(featureIndex, geojson.features.length - 1);
    setFeatureIndex(i);
    selectFeatureByIndex(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson]);

  return (
    <div className="appShell">
      <style>{`
        :root{
          --bg:#ffffff;
          --text:#0b1020;
          --muted: rgba(11,16,32,.62);
          --stroke: rgba(11,16,32,.12);
          --stroke2: rgba(11,16,32,.18);
          --shadow: 0 14px 38px rgba(11,16,32,.10);

          --blue:#2563eb;
          --violet:#7c3aed;
          --cyan:#06b6d4;
          --green:#10b981;
          --red:#ef4444;
          --amber:#f59e0b;
        }

        html, body { height:100%; margin:0; background: var(--bg); }
        body { color: var(--text); overflow: hidden; }

        .appShell{
          height: 100vh;
          width: 100%;
          background: var(--bg);
          display:flex;
          flex-direction:column;
        }

        .topBar{
          display:flex;
          align-items:flex-end;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap;
          padding: 10px 12px;
          border-bottom: 1px solid var(--stroke);
          background: #fff;
          position: sticky;
          top: 0;
          z-index: 50;
        }

        .title{ font-size: 16px; font-weight: 950; letter-spacing: -0.2px; }
        .sub{ font-size: 12px; font-weight: 850; color: var(--muted); margin-top: 4px; }

        .mainGrid{
          flex: 1;
          min-height: 0;
          display:grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 12px;
          padding: 12px;
          align-items: stretch;
        }

        .card{
          border: 1px solid var(--stroke);
          border-radius: 14px;
          background: #fff;
          box-shadow: var(--shadow);
          display:flex;
          flex-direction:column;
          min-height: 0;
        }

        .cardHeader{
          padding: 10px 12px;
          border-bottom: 1px solid var(--stroke);
          font-weight: 950;
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          background: #fff;
        }

        .layersToolbar{
          display:flex;
          gap:8px;
          align-items:center;
          flex-wrap:wrap;
          justify-content:flex-end;
        }

        .searchWrap{
          display:flex;
          align-items:center;
          gap:10px;
          padding: 9px 10px;
          border-radius: 12px;
          border:1px solid var(--stroke);
          background: #fff;
          min-width: 320px;
          flex: 1;
        }

        .searchInput{
          width:100%;
          background: transparent;
          border:0;
          outline:0;
          color: var(--text);
          font-weight: 850;
        }
        .searchInput::placeholder{ color: rgba(11,16,32,.35); }

        .iconBtn{
          width:40px;
          height:40px;
          border-radius: 12px;
          border:1px solid var(--stroke);
          background: #fff;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          cursor:pointer;
          transition: transform .08s ease, border-color .15s ease, box-shadow .15s ease;
          flex: 0 0 auto;
        }
        .iconBtn:hover{
          border-color: var(--stroke2);
          box-shadow: 0 10px 22px rgba(11,16,32,.10);
        }
        .iconBtn:active{ transform: translateY(1px); }
        .iconBtn[disabled]{ opacity:.45; cursor:not-allowed; }

        .iconUpload { color: var(--violet); }
        .iconRefresh{ color: var(--cyan); }
        .iconPreview{ color: var(--blue); }
        .iconDownload{ color: var(--green); }
        .iconDelete{ color: var(--red); }
        .iconEdit{ color: var(--violet); }
        .iconSave{ color: var(--green); }
        .iconReset{ color: var(--amber); }
        .iconNeutral{ color: rgba(11,16,32,.65); }

        .pill{
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:6px 10px;
          border-radius:999px;
          border:1px solid var(--stroke);
          background: #fff;
          font-size:12px;
          font-weight: 950;
          color: rgba(11,16,32,.86);
          white-space:nowrap;
        }
        .pillWarn{ border-color: rgba(245,158,11,.35); }
        .pillOk{ border-color: rgba(16,185,129,.35); }
        .pillInfo{ border-color: rgba(37,99,235,.30); }

        .tableScroll{
          overflow:auto;
          flex: 1;
          min-height: 0;
          -webkit-overflow-scrolling: touch;
        }

        table{ width:100%; border-collapse: collapse; font-size:13px; }
        thead tr{ background: rgba(11,16,32,.03); }
        th, td{
          padding: 10px;
          border-bottom: 1px solid rgba(11,16,32,.06);
          text-align:left;
          vertical-align: top;
        }
        th{ color: rgba(11,16,32,.70); font-weight: 950; }
        tr:hover td{ background: rgba(11,16,32,.02); }

        .rowTitle{ font-weight: 950; }
        .rowMeta{ font-size:12px; color: var(--muted); margin-top:3px; }
        .rowId{ font-size:11px; color: rgba(11,16,32,.45); margin-top:3px; }
        .actionsWrap{ display:flex; gap:8px; flex-wrap:wrap; }

        .mapMeta{
          padding: 10px 12px;
          font-size: 12px;
          color: var(--muted);
          border-bottom: 1px solid rgba(11,16,32,.06);
        }
        .mapArea{
          position: relative;
          flex: 1;
          min-height: 0;
        }
        .mapAreaInner{
          position:absolute;
          inset: 0;
        }

        .snack{
          border-radius: 14px;
          padding: 12px;
          box-shadow: 0 22px 70px rgba(11,16,32,.18);
          display: grid;
          gap: 10px;
          animation: snackIn .16s ease-out;
          background: #fff;
        }
        .snackRow{ display:flex; align-items:flex-start; gap:10px; }
        .snackIcon{ font-size:18px; margin-top:2px; }
        .snackTitle{ font-weight:950; letter-spacing:-0.2px; }
        .snackMsg{ font-size:13px; opacity:.82; margin-top:2px; line-height:1.35; color: rgba(11,16,32,.70); }
        .snackBar{ height:3px; border-radius:999px; background: rgba(11,16,32,.08); overflow:hidden; }
        .snackBarFill{ height:100%; width:100%; transform-origin:left; }

        .overlay{
          position:fixed; inset:0;
          background: rgba(11,16,32,.38);
          display:grid; place-items:center;
          padding:12px;
          z-index: 10050;
        }

        .modal{
          width:min(560px, 100%);
          border-radius: 14px;
          border:1px solid rgba(11,16,32,.12);
          background: #fff;
          box-shadow: 0 30px 90px rgba(11,16,32,.22);
          overflow:hidden;
          max-height: calc(100vh - 24px);
          display:flex;
          flex-direction:column;
        }
        .modalHead{
          padding: 12px;
          border-bottom: 1px solid rgba(11,16,32,.08);
          display:flex; align-items:center; justify-content:space-between; gap:10px;
        }
        .modalTitleRow{ display:flex; align-items:center; gap:10px; }
        .modalDot{ width:10px; height:10px; border-radius:999px; background: var(--blue); }
        .dotRed{ background: var(--red); }
        .dotBlue{ background: var(--blue); }
        .modalTitle{ font-weight:950; letter-spacing:-0.2px; }
        .modalBody{
          padding: 12px;
          color: rgba(11,16,32,.78);
          line-height: 1.45;
          font-size: 13px;
          overflow:auto;
          -webkit-overflow-scrolling: touch;
        }
        .modalFoot{
          padding: 12px;
          border-top: 1px solid rgba(11,16,32,.08);
          display:flex; justify-content:flex-end; gap:10px;
          flex-wrap: wrap;
        }

        .btnGhost, .btnPrimary, .btnDanger{
          padding:10px 12px;
          border-radius: 12px;
          border:1px solid rgba(11,16,32,.12);
          background: #fff;
          color: rgba(11,16,32,.88);
          font-weight: 950;
          cursor:pointer;
        }
        .btnPrimary{ border-color: rgba(37,99,235,.35); }
        .btnDanger{ border-color: rgba(239,68,68,.35); }

        .ttFixed{
          padding:8px 10px;
          border-radius: 12px;
          border:1px solid rgba(11,16,32,.12);
          background: #fff;
          color: rgba(11,16,32,.90);
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
          box-shadow: 0 18px 50px rgba(11,16,32,.18);
        }

        .drawerOverlay{
          position: fixed;
          inset: 0;
          background: rgba(11,16,32,.38);
          z-index: 10100;
          display:flex;
          justify-content:flex-end;
        }
        .drawer{
          width: min(900px, 100vw);
          height: 100vh;
          background: #fff;
          border-left: 1px solid rgba(11,16,32,.12);
          display:flex;
          flex-direction:column;
        }
        .drawerBody{
          overflow:auto;
          flex: 1;
          min-height: 0;
          -webkit-overflow-scrolling: touch;
        }

        .fieldInput{
          width:100%;
          padding: 11px 12px;
          border-radius: 12px;
          border: 1px solid rgba(11,16,32,.12);
          background: #fff;
          outline: none;
          color: var(--text);
        }
        .fieldInputKey{ font-weight: 950; }
        .hint{
          font-size: 11px;
          color: rgba(11,16,32,.55);
          margin-top: 6px;
        }

        @media (max-width: 980px){
          .mainGrid{
            grid-template-columns: 1fr;
            padding: 10px;
            gap: 10px;
          }
          .topBar{ padding: 10px; }
          .layersToolbar{
            width: 100%;
            justify-content: flex-start;
          }
          .searchWrap{
            min-width: 0;
            width: 100%;
          }
        }

        @media (max-width: 640px){
          th, td{ padding: 9px; }
          table, thead, tbody, th, td, tr{ display:block; }
          thead{ display:none; }

          .tableScroll{ padding: 10px; }
          tbody tr{
            border: 1px solid rgba(11,16,32,.10);
            border-radius: 14px;
            margin-bottom: 10px;
            overflow:hidden;
            background:#fff;
          }
          tbody tr td{
            border-bottom: 1px solid rgba(11,16,32,.06);
          }
          tbody tr td:last-child{ border-bottom: 0; }

          tbody tr td:nth-child(2)::before{
            content:"Geom";
            display:block;
            font-size:11px;
            color: rgba(11,16,32,.55);
            font-weight: 900;
            margin-bottom: 6px;
          }
          tbody tr td:nth-child(3)::before{
            content:"Features";
            display:block;
            font-size:11px;
            color: rgba(11,16,32,.55);
            font-weight: 900;
            margin-bottom: 6px;
          }
          tbody tr td:nth-child(4)::before{
            content:"Actions";
            display:block;
            font-size:11px;
            color: rgba(11,16,32,.55);
            font-weight: 900;
            margin-bottom: 6px;
          }

          .actionsWrap{ gap:10px; }
          .iconBtn{ width:44px; height:44px; border-radius: 14px; }
          .mapArea{ min-height: 44vh; }
        }
      `}</style>

      {/* ✅ Notifications on TOP (always above drawer/modals) */}
      <Snackbar notice={notice} onClose={closeNotice} />

      {/* ✅ Confirm Modal above drawer */}
      <ConfirmModal state={confirmState} onCancel={() => closeConfirm(false)} onConfirm={() => closeConfirm(true)} />

      {/* Header */}
      <div className="topBar">
        <div>
          <div className="title">Layer Manager</div>
          <div className="sub">Manage layers • Preview • Download • Edit attributes</div>

          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className={`pill ${selectedId ? "pillOk" : "pillInfo"}`}>
              <FontAwesomeIcon icon={selectedId ? faCircleCheck : faCircleInfo} />
              {selectedId ? "Layer selected" : "No layer selected"}
            </span>

            <span className={`pill ${geojson ? "pillOk" : "pillInfo"}`}>
              <FontAwesomeIcon icon={geojson ? faCircleCheck : faCircleInfo} />
              {geojson ? `Features: ${featureCount}` : "GeoJSON: null"}
            </span>

            {hasUnsavedChanges ? (
              <span className="pill pillWarn">
                <FontAwesomeIcon icon={faTriangleExclamation} />
                Unsaved changes
              </span>
            ) : null}
          </div>
        </div>

        <span className="pill pillInfo">
          <FontAwesomeIcon icon={faKeyboard} />
          Ctrl/Cmd+S
        </span>
      </div>

      {/* Main */}
      <div className="mainGrid">
        {/* LEFT: LAYERS */}
        <div className="card">
          <div className="cardHeader">
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div>Layers ({filteredLayers.length})</div>
              {error ? (
                <div style={{ color: "#9F1239", fontSize: 12, fontWeight: 900, marginTop: 2 }}>
                  <FontAwesomeIcon icon={faCircleXmark} /> {error}
                </div>
              ) : null}
            </div>

            <div className="layersToolbar">
              <div className="searchWrap" style={{ maxWidth: 520 }}>
                <FontAwesomeIcon icon={faMagnifyingGlass} style={{ opacity: 0.55 }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search layers…"
                  className="searchInput"
                />
              </div>

              <Tooltip text="Upload" side="top">
                <button onClick={openUpload} disabled={loadingList} aria-label="Upload" className="iconBtn">
                  <FontAwesomeIcon icon={faUpload} className="iconUpload" />
                </button>
              </Tooltip>

              <Tooltip text={loadingList ? "Refreshing…" : "Refresh"} side="top">
                <button onClick={refresh} disabled={loadingList} aria-label="Refresh" className="iconBtn">
                  <FontAwesomeIcon icon={faRotateRight} className="iconRefresh" />
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="tableScroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Geom</th>
                  <th>Features</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredLayers.map((l) => {
                  const busy = busyId === l.id;
                  const active = selectedId === l.id;

                  return (
                    <tr key={l.id} style={{ background: active ? "rgba(37,99,235,.04)" : "transparent" }}>
                      <td>
                        <div className="rowTitle">{l.name}</div>
                        <div className="rowMeta">
                          {l.source_filename ?? "-"} • SRID {l.srid ?? "-"}
                        </div>
                        <div className="rowId">id: {l.id}</div>
                      </td>

                      <td>{l.geom_type ?? "-"}</td>
                      <td>{l.feature_count ?? 0}</td>

                      <td>
                        <div className="actionsWrap">
                          <Tooltip text="Preview" side="top">
                            <button onClick={() => previewLayer(l.id)} disabled={busy} aria-label="Preview" className="iconBtn">
                              <FontAwesomeIcon icon={faEye} className="iconPreview" />
                            </button>
                          </Tooltip>

                          <Tooltip text="Download GeoJSON" side="top">
                            <button onClick={() => downloadGeoJSON(l.id, l.name)} disabled={busy} aria-label="Download" className="iconBtn">
                              <FontAwesomeIcon icon={faDownload} className="iconDownload" />
                            </button>
                          </Tooltip>

                          <Tooltip text="Rename layer" side="top">
                          <button
                            onClick={() => openRename(l)}
                            disabled={busy}
                            aria-label="Rename"
                            className="iconBtn"
                          >
                            <FontAwesomeIcon icon={faPenToSquare} className="iconEdit" />
                          </button>
                        </Tooltip>

                          <Tooltip text="Delete" side="top">
                            <button onClick={() => deleteLayer(l.id, l.name)} disabled={busy} aria-label="Delete" className="iconBtn">
                              <FontAwesomeIcon icon={faTrash} className="iconDelete" />
                            </button>
                          </Tooltip>

                          <Tooltip text="Edit attributes" side="top">
                            <button
                              onClick={() => {
                                if (!geojson) return;
                                if (!selectedId || selectedId !== l.id) return;
                                openDrawer();
                              }}
                              disabled={!active || !geojson?.features?.length}
                              aria-label="Edit"
                              className="iconBtn"
                            >
                              <FontAwesomeIcon icon={faPenToSquare} className="iconEdit" />
                            </button>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredLayers.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 14, color: "rgba(11,16,32,.62)" }}>
                      No layers found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: MAP */}
        <div className="card">
          <div className="cardHeader">
            <div>Preview {selectedLayer ? `— ${selectedLayer.name}` : ""}</div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span className="pill pillInfo">
                <FontAwesomeIcon icon={faCircleInfo} />
                {selectedLayer ? `${selectedLayer.geom_type ?? "-"} • SRID ${selectedLayer.srid ?? "-"}` : "No layer"}
              </span>

              <Tooltip text="Open editor" side="top">
                <button onClick={openDrawer} disabled={!geojson?.features?.length} aria-label="Open editor" className="iconBtn">
                  <FontAwesomeIcon icon={faPenToSquare} className="iconEdit" />
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="mapMeta">{geojson ? `features: ${featureCount}` : "geojson: null"}</div>

          <div className="mapArea">
            <div className="mapAreaInner">
              <ResultMap key={mapKey} geojson={geojson} />
            </div>

            {busyId && selectedId === busyId ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(255,255,255,.75)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <span className="pill pillInfo">Loading map…</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload ? (
        <div role="dialog" aria-modal="true" onClick={closeUpload} className="overlay" style={{ zIndex: 10050 }}>
          <div onClick={(e) => e.stopPropagation()} className="modal">
            <div className="modalHead">
              <div className="modalTitleRow">
                <span className="modalDot dotBlue" />
                <div className="modalTitle">Upload GeoJSON</div>
              </div>

              <Tooltip text="Close" side="left">
                <button onClick={closeUpload} disabled={uploading} aria-label="Close" className="iconBtn">
                  <FontAwesomeIcon icon={faXmark} className="iconNeutral" />
                </button>
              </Tooltip>
            </div>

            <div className="modalBody">
              <div style={{ display: "grid", gap: 10 }}>
                <input
                  placeholder="Layer name (optional)"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  className="fieldInput fieldInputKey"
                />

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".geojson,application/geo+json,application/json"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadFile(f);
                  }}
                />

                {uploadStatus ? <div style={{ opacity: 0.9, whiteSpace: "pre-wrap" }}>{uploadStatus}</div> : null}
              </div>
            </div>

            <div className="modalFoot">
              <button onClick={closeUpload} disabled={uploading} className="btnGhost">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

{showRename ? (
  <div role="dialog" aria-modal="true" onClick={closeRename} className="overlay" style={{ zIndex: 10050 }}>
    <div onClick={(e) => e.stopPropagation()} className="modal">
      <div className="modalHead">
        <div className="modalTitleRow">
          <span className="modalDot dotBlue" />
          <div className="modalTitle">Rename Layer</div>
        </div>

        <Tooltip text="Close" side="left">
          <button onClick={closeRename} disabled={renaming} aria-label="Close" className="iconBtn">
            <FontAwesomeIcon icon={faXmark} className="iconNeutral" />
          </button>
        </Tooltip>
      </div>

      <div className="modalBody">
        <div style={{ display: "grid", gap: 10 }}>
          <input
            placeholder="New layer name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="fieldInput fieldInputKey"
            autoFocus
          />
          <div className="hint">Tip: Keep names short and unique (e.g., “CBFMA Alcala 2024”).</div>
        </div>
      </div>

      <div className="modalFoot">
        <button onClick={closeRename} disabled={renaming} className="btnGhost">
          Cancel
        </button>
        <button onClick={renameLayer} disabled={renaming || !renameValue.trim()} className="btnPrimary">
          {renaming ? "Renaming…" : "Rename"}
        </button>
      </div>
    </div>
  </div>
) : null}

      {/* ✅ EDIT DRAWER */}
      {showAttrDrawer ? (
        <div
          className="drawerOverlay"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            (async () => {
              const ok = await confirmLoseChanges();
              if (!ok) return;
              setShowAttrDrawer(false);
            })();
          }}
        >
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="cardHeader" style={{ borderRadius: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div>Edit Attributes {selectedLayer ? `— ${selectedLayer.name}` : ""}</div>
                <div className="sub">{selectedFid ? `fid: ${selectedFid}` : "Select a feature"}</div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <span className={`pill ${hasUnsavedChanges ? "pillWarn" : "pillOk"}`}>
                  <FontAwesomeIcon icon={hasUnsavedChanges ? faTriangleExclamation : faCircleCheck} />
                  {hasUnsavedChanges ? "Unsaved" : "Clean"}
                </span>

                <Tooltip text="Reset" side="bottom">
                  <button
                    onClick={async () => {
                      if (!selectedProps) return;
                      const ok = await confirmUI({
                        title: "Reset changes?",
                        message: "This will restore the last saved values for this feature.",
                        confirmText: "Reset",
                        cancelText: "Cancel",
                        tone: "default",
                      });
                      if (!ok) return;
                      setPropRows(baselineRows);
                      setAttrStatus("Reset.");
                      showNotice("success", "Reset", "Restored last saved fields.");
                    }}
                    disabled={savingAttr || !selectedProps}
                    aria-label="Reset"
                    className="iconBtn"
                  >
                    <FontAwesomeIcon icon={faArrowRotateLeft} className="iconReset" />
                  </button>
                </Tooltip>

                <Tooltip text="Save" side="bottom">
                  <button
                    onClick={saveAttributes}
                    disabled={savingAttr || !selectedId || !selectedFid || !hasUnsavedChanges}
                    aria-label="Save"
                    className="iconBtn"
                  >
                    <FontAwesomeIcon icon={faFloppyDisk} className="iconSave" />
                  </button>
                </Tooltip>

                <Tooltip text="Close" side="bottom">
                  <button
                    onClick={() => {
                      (async () => {
                        const ok = await confirmLoseChanges();
                        if (!ok) return;
                        setShowAttrDrawer(false);
                      })();
                    }}
                    aria-label="Close"
                    className="iconBtn"
                  >
                    <FontAwesomeIcon icon={faXmark} className="iconNeutral" />
                  </button>
                </Tooltip>
              </div>
            </div>

            <div style={{ padding: 12, borderBottom: "1px solid rgba(11,16,32,.08)" }}>
              <div style={{ display: "grid", gap: 10 }}>
                <select
                  value={featureIndex}
                  onChange={(e) => {
                    (async () => {
                      const idx = Number(e.target.value);
                      const ok = await confirmLoseChanges();
                      if (!ok) return;
                      setFeatureIndex(idx);
                      selectFeatureByIndex(idx);
                    })();
                  }}
                  className="fieldInput fieldInputKey"
                >
                  {featureOptions.map((opt) => (
                    <option key={opt.idx} value={opt.idx}>
                      {opt.label} {opt.fid ? `(fid ${opt.fid})` : ""}
                    </option>
                  ))}
                </select>

                <div className="searchWrap" style={{ minWidth: 0 }}>
                  <FontAwesomeIcon icon={faMagnifyingGlass} style={{ opacity: 0.55 }} />
                  <input
                    value={fieldSearch}
                    onChange={(e) => setFieldSearch(e.target.value)}
                    placeholder="Search fields…"
                    className="searchInput"
                  />
                </div>

                {attrStatus ? <div className="sub">{attrStatus}</div> : null}
              </div>
            </div>

            <div className="drawerBody" style={{ padding: 12 }}>
              {!geojson?.features?.length ? (
                <div style={{ color: "rgba(11,16,32,.70)" }}>Preview a layer first to edit feature attributes.</div>
              ) : (
                <div style={{ border: "1px solid rgba(11,16,32,.08)", borderRadius: 14, overflow: "hidden" }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: "36%" }}>Field</th>
                        <th>Value</th>
                        <th style={{ width: 72 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPropRows.length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ padding: 12, color: "rgba(11,16,32,.62)" }}>
                            No fields found.
                          </td>
                        </tr>
                      ) : null}

                      {filteredPropRows.map(({ row, i }) => (
                        <tr key={`${row.key}-${i}`}>
                          <td>
                            <input
                              value={row.key}
                              onChange={(e) => {
                                const k = e.target.value;
                                setPropRows((prev) => {
                                  const next = [...prev];
                                  next[i] = { ...next[i], key: k };
                                  return next;
                                });
                                setAttrStatus("");
                              }}
                              className="fieldInput fieldInputKey"
                              placeholder="FIELD_NAME"
                            />
                          </td>

                          <td>
                            <input
                              value={row.value}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPropRows((prev) => {
                                  const next = [...prev];
                                  next[i] = { ...next[i], value: v };
                                  return next;
                                });
                                setAttrStatus("");
                              }}
                              className="fieldInput"
                              placeholder="Value"
                            />
                            <div className="hint">Tip: true/false, null, numbers, JSON</div>
                          </td>

                          <td style={{ textAlign: "right" }}>
                            <Tooltip text="Remove field" side="left">
                              <button
                                onClick={async () => {
                                  const ok = await confirmUI({
                                    title: "Remove this field?",
                                    message: `Field: ${row.key}\n\nThis will remove it from the editor. Click "Save" to apply the change.`,
                                    confirmText: "Remove",
                                    cancelText: "Cancel",
                                    tone: "danger",
                                  });
                                  if (!ok) return;

                                  setPropRows((prev) => prev.filter((_, idx) => idx !== i));
                                  setAttrStatus("Removed.");
                                  showNotice("success", "Field removed", "Don’t forget to Save to apply changes.");
                                }}
                                aria-label="Remove"
                                className="iconBtn"
                              >
                                <FontAwesomeIcon icon={faTrash} className="iconDelete" />
                              </button>
                            </Tooltip>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ padding: 12, borderTop: "1px solid rgba(11,16,32,.08)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center" }}>
                <input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="New field name"
                  className="fieldInput fieldInputKey"
                />
                <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="New value" className="fieldInput" />

                <Tooltip text="Add field" side="top">
                  <button
                    onClick={() => {
                      const k = newKey.trim();
                      if (!k) {
                        setAttrStatus("Field name required.");
                        showNotice("warn", "Field name required", "Type a field name before adding.");
                        return;
                      }
                      setPropRows((prev) => [...prev, { key: k, value: newValue }]);
                      setNewKey("");
                      setNewValue("");
                      setAttrStatus("Added.");
                      showNotice("success", "Field added", "Click Save to apply changes.");
                    }}
                    aria-label="Add"
                    className="iconBtn"
                  >
                    <FontAwesomeIcon icon={faPlus} className="iconUpload" />
                  </button>
                </Tooltip>
              </div>

              <div className="hint" style={{ marginTop: 10 }}>
                Note: <b>__fid</b> is not editable.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
