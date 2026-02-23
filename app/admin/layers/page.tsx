"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ResultMap from "@/app/components/ResultMapClient";
import { createPortal } from "react-dom";
import AutoLogout from "@/app/components/AutoLogout";
/** ---------------- types ---------------- */

type LayerRow = {
  id: string;
  name: string;
  source_filename: string | null;
  geom_type: string | null;
  srid: number | null;
  feature_count: number | null;
  created_at?: string | null;
};

type ToastState =
  | { show: false }
  | { show: true; type: "success" | "error" | "info"; message: string };

/** ---------------- helpers ---------------- */

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

/** ---------------- stroke icons ---------------- */

function Icon({
  name,
  size = 16,
}: {
  name:
    | "upload"
    | "reload"
    | "eye"
    | "download"
    | "rename"
    | "open"
    | "trash"
    | "close"
    | "info"
    | "check"
    | "x"
    | "dots";
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
    case "upload":
      return (
        <svg {...common}>
          <path {...stroke} d="M12 16V4" />
          <path {...stroke} d="M7 9l5-5 5 5" />
          <path {...stroke} d="M4 20h16" />
        </svg>
      );
    case "reload":
      return (
        <svg {...common}>
          <path {...stroke} d="M21 12a9 9 0 1 1-3-6.7" />
          <path {...stroke} d="M21 3v6h-6" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path
            {...stroke}
            d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
          />
          <path {...stroke} d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path {...stroke} d="M12 3v10" />
          <path {...stroke} d="M7 10l5 5 5-5" />
          <path {...stroke} d="M4 20h16" />
        </svg>
      );
    case "rename":
      return (
        <svg {...common}>
          <path {...stroke} d="M12 20h9" />
          <path
            {...stroke}
            d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z"
          />
        </svg>
      );
    case "open":
      return (
        <svg {...common}>
          <path {...stroke} d="M14 3h7v7" />
          <path {...stroke} d="M10 14L21 3" />
          <path
            {...stroke}
            d="M21 14v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"
          />
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
    case "close":
    case "x":
      return (
        <svg {...common}>
          <path {...stroke} d="M6 6l12 12" />
          <path {...stroke} d="M18 6L6 18" />
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
    case "check":
      return (
        <svg {...common}>
          <path {...stroke} d="M20 6L9 17l-5-5" />
        </svg>
      );
    case "dots":
      // vertical ellipsis (3 dots)
      return (
        <svg {...common}>
          <path {...stroke} d="M12 5h.01" />
          <path {...stroke} d="M12 12h.01" />
          <path {...stroke} d="M12 19h.01" />
        </svg>
      );
  }
}

function SpinnerDot({ size = 16 }: { size?: number }) {
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

/** ---------------- tooltip ---------------- */

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; placement: "top" | "bottom" } | null>(null);

  function updatePos() {
    const el = anchorRef.current;
    if (!el) return;

    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;

    const wantTop = r.top > 56;
    const placement: "top" | "bottom" = wantTop ? "top" : "bottom";
    const y = placement === "top" ? r.top : r.bottom;

    setPos({
      x: clamp(x, 16, window.innerWidth - 16),
      y: clamp(y, 10, window.innerHeight - 10),
      placement,
    });
  }

  function onOpen() {
    setOpen(true);
    requestAnimationFrame(updatePos);
  }
  function onClose() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    const onScroll = () => updatePos();
    const onResize = () => updatePos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <span
      ref={anchorRef}
      className="ttAnchor"
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
      onFocus={onOpen}
      onBlur={onClose}
    >
      {children}

      {open && pos
        ? createPortal(
            <div
              className={`ttFloat ${pos.placement === "bottom" ? "isBottom" : "isTop"}`}
              role="tooltip"
              style={{ left: pos.x, top: pos.y }}
            >
              {text}
            </div>,
            document.body
          )
        : null}
    </span>
  );
}

/** ---------------- portal dropdown menu (⋮) ---------------- */

type MenuPos = { left: number; top: number; placement: "down" | "up" };

function DotsMenu({
  layer,
  disabled,
  onPreview,
  onDownload,
  onRename,
  onEdit,
  onDelete,
}: {
  layer: LayerRow;
  disabled: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onRename: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);

  function close() {
    setOpen(false);
  }

  function updatePos() {
    const el = btnRef.current;
    if (!el) return;

    const r = el.getBoundingClientRect();
    const menuW = 214; // fixed width to keep it stable
    const menuH = 232; // approximate, enough for 5 items

    const placeDown = r.bottom + menuH + 10 < window.innerHeight;
    const placement: "down" | "up" = placeDown ? "down" : "up";

    const left = clamp(r.right - menuW, 12, window.innerWidth - menuW - 12);
    const top = placement === "down" ? r.bottom + 8 : r.top - menuH - 8;

    setPos({ left, top: clamp(top, 12, window.innerHeight - 12), placement });
  }

  function toggle() {
    if (disabled) return;
    setOpen((v) => !v);
    requestAnimationFrame(updatePos);
  }

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    const onPointer = (e: MouseEvent | PointerEvent) => {
      const btn = btnRef.current;
      if (!btn) return;

      const target = e.target as Node;
      // if click is on button, ignore (toggle handles)
      if (btn.contains(target)) return;

      // if click is inside the menu, ignore (menu handles)
      const menuEl = document.getElementById(`dots-menu-${layer.id}`);
      if (menuEl && menuEl.contains(target)) return;

      close();
    };

    const onScroll = () => updatePos();
    const onResize = () => updatePos();

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, layer.id]);

  function click(action: () => void) {
    if (disabled) return;
    close();
    action();
  }

  return (
    <>
      <Tooltip text="More actions">
        <button
          ref={btnRef}
          onClick={toggle}
          disabled={disabled}
          className="miniBtn dark"
          aria-label="More actions"
          aria-expanded={open ? "true" : "false"}
        >
          <Icon name="dots" />
        </button>
      </Tooltip>

      {open && pos
        ? createPortal(
            <div
              id={`dots-menu-${layer.id}`}
              className={`dotsMenu ${pos.placement === "up" ? "isUp" : "isDown"}`}
              style={{ left: pos.left, top: pos.top, width: 214 }}
              role="menu"
              aria-label={`Actions for ${layer.name}`}
            >
              <div className="dotsMenuHead" title={layer.name}>
                <div className="dotsMenuTitle">{layer.name}</div>
                <div className="dotsMenuSub">
                  {layer.geom_type ?? "-"} • {layer.feature_count ?? 0} feat • SRID {layer.srid ?? "-"}
                </div>
              </div>

              <button className="dotsItem blue" role="menuitem" onClick={() => click(onPreview)}>
                <span className="dotsIco">
                  <Icon name="eye" size={14} />
                </span>
                Preview
              </button>

              <button className="dotsItem green" role="menuitem" onClick={() => click(onDownload)}>
                <span className="dotsIco">
                  <Icon name="download" size={14} />
                </span>
                Download GeoJSON
              </button>

              <button className="dotsItem violet" role="menuitem" onClick={() => click(onRename)}>
                <span className="dotsIco">
                  <Icon name="rename" size={14} />
                </span>
                Rename
              </button>

              <button className="dotsItem dark" role="menuitem" onClick={() => click(onEdit)}>
                <span className="dotsIco">
                  <Icon name="open" size={14} />
                </span>
                Edit Attributes
              </button>

              <div className="dotsSep" />

              <button className="dotsItem red" role="menuitem" onClick={() => click(onDelete)}>
                <span className="dotsIco">
                  <Icon name="trash" size={14} />
                </span>
                Delete
              </button>
            </div>,
            document.body
          )
        : null}
    </>
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
          <Icon name="info" size={14} />
          Actions are temporarily disabled to prevent duplicate requests.
        </div>
      </div>
    </div>
  );
}

/** ---------------- component ---------------- */

export default function AdminLayersPage() {
  const [layers, setLayers] = useState<LayerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [geojson, setGeojson] = useState<any | null>(null);

  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const [toast, setToast] = useState<ToastState>({ show: false });
  function showToast(type: "success" | "error" | "info", message: string) {
    setToast({ show: true, type, message });
    window.setTimeout(() => setToast({ show: false }), 2200);
  }

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

  const selectedLayer = useMemo(() => layers.find((l) => l.id === selectedId) ?? null, [layers, selectedId]);
  const featureCount = useMemo(() => geojson?.features?.length ?? 0, [geojson]);
  const mapKey = useMemo(() => selectedId ?? "none", [selectedId]);

  const filteredLayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return layers;
    return layers.filter((l) => {
      const hay = `${l.name} ${l.source_filename ?? ""} ${l.geom_type ?? ""} ${l.srid ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [layers, search]);

  const uiLocked = loadingList || !!busyId || uploading || renaming;

  async function refresh() {
    setLoadingList(true);
    setError("");
    try {
      const r = await fetch("/api/layers", { cache: "no-store" });
      const text = await r.text();
      const j: any = safeJsonParse(text);
      if (!j.ok) throw new Error(j.error || "Failed to load layers");
      setLayers(j.layers || []);
      showToast("info", "Layers refreshed.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load layers");
      showToast("error", e?.message ?? "Failed to load layers");
    } finally {
      setLoadingList(false);
    }
  }

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

  async function previewLayer(layerId: string) {
    setBusyId(layerId);
    setSelectedId(layerId);
    setGeojson(null);
    setError("");

    try {
      const r = await fetch(`/api/layers/${layerId}/geojson`, { cache: "no-store" });
      const text = await r.text();
      const j: any = safeJsonParse(text);

      if (j?.ok === false) throw new Error(j.error || "Failed to load GeoJSON");
      const fc = coerceFeatureCollection(j);
      if (!fc) throw new Error("API did not return a GeoJSON FeatureCollection.");

      setGeojson(fc);
      showToast("success", "Preview loaded.");
    } catch (e: any) {
      setError(e?.message ?? "Preview failed");
      showToast("error", e?.message ?? "Preview failed");
    } finally {
      setBusyId(null);
    }
  }

  function openEditorInNewTab(layerId: string) {
    const layer = layers.find((x) => x.id === layerId);
    const name = layer?.name ?? "";
    const url = `/admin/layers/${encodeURIComponent(layerId)}/edit?name=${encodeURIComponent(name)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    showToast("info", "Opened editor in new tab.");
  }

  async function downloadGeoJSON(layerId: string, name: string) {
    setBusyId(layerId);
    setError("");

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
      showToast("success", "Download started.");
    } catch (e: any) {
      setError(e?.message ?? "Download failed");
      showToast("error", e?.message ?? "Download failed");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteLayer(layerId: string, name: string) {
    if (uiLocked) return;
    const ok = window.confirm(`Delete "${name}"?\n\nThis will delete the layer and features. This cannot be undone.`);
    if (!ok) return;

    setBusyId(layerId);
    setError("");

    try {
      const r = await fetch(`/api/layers/${layerId}`, { method: "DELETE" });
      const text = await r.text();
      const j: any = safeJsonParse(text);
      if (!j.ok) throw new Error(j.error || "Delete failed");

      if (selectedId === layerId) {
        setSelectedId(null);
        setGeojson(null);
      }
      await refresh();
      showToast("success", "Layer deleted.");
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
      showToast("error", e?.message ?? "Delete failed");
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

  function closeUpload() {
    if (uploading) return;
    setShowUpload(false);
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadStatus("Uploading…");
    setError("");

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
        showToast("error", msg);
        return;
      }

      setUploadStatus(`✅ Uploaded: ${data.name} (${data.featureCount} features)`);
      showToast("success", "Upload complete.");
      await refresh();
      if (data.layerId) await previewLayer(data.layerId);
    } catch (e: any) {
      const msg = e?.message ?? "Unknown error";
      setUploadStatus(`❌ Upload failed: ${msg}`);
      showToast("error", `Upload failed: ${msg}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
    if (!newName) return;

    setRenaming(true);
    setError("");

    try {
      const r = await fetch(`/api/layers/${renameId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });

      const text = await r.text();
      const j: any = safeJsonParse(text);
      if (!j.ok) throw new Error(j.error || "Rename failed");

      setLayers((prev) => prev.map((l) => (l.id === renameId ? { ...l, name: newName } : l)));
      showToast("success", "Renamed.");
      closeRename();
    } catch (e: any) {
      setError(e?.message ?? "Rename failed");
      showToast("error", e?.message ?? "Rename failed");
    } finally {
      setRenaming(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlayTitle = useMemo(() => {
    if (uploading) return "Uploading layer…";
    if (loadingList) return "Refreshing layers…";
    if (busyId && selectedId === busyId) return "Loading preview…";
    if (busyId) return "Working…";
    if (renaming) return "Renaming layer…";
    return "";
  }, [uploading, loadingList, busyId, selectedId, renaming]);

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
          --muted: rgba(11,18,32,.68);
          --stroke: rgba(11,18,32,.10);
          --stroke2: rgba(11,18,32,.18);
          --shadow: 0 14px 40px rgba(11,18,32,.10);
          --primary:#0f7a3a;
          --primaryBg: rgba(15,122,58,.10);
          --blue:#2563eb;
          --violet:#7c3aed;
          --green:#10b981;
          --red:#ef4444;
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
          overflow: hidden;
        }
        *{ box-sizing:border-box; }
        @keyframes spin { to { transform: rotate(360deg);} }
        @keyframes toastIn { from { transform: translateY(-6px); opacity: 0;} to { transform: translateY(0); opacity: 1;} }
        @keyframes popIn { from { transform: translateY(6px) scale(.98); opacity: 0;} to { transform: translateY(0) scale(1); opacity: 1;} }

        .shell{ height: 100dvh; width: 100%; display:flex; flex-direction:column; }

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
          min-width: 240px;
          max-width: 360px;
          animation: toastIn .16s ease-out;
          font-size: 12px;
          font-weight: 700;
          color: rgba(11,18,32,.90);
        }
        .dot{ width: 10px; height: 10px; border-radius: 999px; background: rgba(11,18,32,.45); }
        .dot.success{ background: rgba(15,122,58,.85); }
        .dot.error{ background: rgba(180,35,24,.95); }
        .dot.info{ background: rgba(17,102,204,.90); }

        /* topbar */
        .topbar{
          padding: 10px 12px;
          border-bottom: 1px solid var(--stroke);
          background: rgba(255,255,255,.88);
          backdrop-filter: blur(14px);
          display:flex;
          align-items:flex-start;
          gap: 10px;
          flex-wrap: wrap;
        }
        .title{
          font-weight: 1000;
          letter-spacing: -.25px;
          display:flex;
          flex-direction:column;
          line-height: 1.05;
          min-width: 160px;
          font-size: 14px;
        }
        .sub{
          font-size: 11px;
          color: var(--muted);
          font-weight: 650;
          margin-top: 4px;
        }
        .tools{ margin-left:auto; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

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
          padding:0;
        }
        .iconBtn svg{ width: 18px; height: 18px; }
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
        .iconBtnCyan{
          border-color: rgba(6,182,212,.22);
          background: linear-gradient(180deg, rgba(6,182,212,.10), rgba(255,255,255,.92));
        }

        .grid{
          flex: 1;
          min-height: 0;
          display:grid;
          grid-template-columns: 420px 1fr;
          gap: 12px;
          padding: 12px;
        }

        .card{
          border: 1px solid var(--stroke);
          border-radius: 20px;
          background: rgba(255,255,255,.92);
          box-shadow: var(--shadow);
          display:flex;
          flex-direction:column;
          min-height: 0;
          overflow:hidden;
        }

        .cardHead{
          padding: 10px 12px;
          border-bottom: 1px solid var(--stroke);
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap: 10px;
          font-weight: 950;
          background: rgba(255,255,255,.70);
          backdrop-filter: blur(10px);
        }

        .searchWrap{
          display:flex;
          align-items:center;
          gap:10px;
          padding: 0 12px;
          height: 40px;
          border-radius: 14px;
          border:1px solid var(--stroke);
          background: rgba(255,255,255,.92);
          width: 100%;
        }
        .searchInput{
          width:100%;
          background: transparent;
          border:0;
          outline:0;
          color: var(--text);
          font-weight: 650;
          font-size: 12px;
        }
        .searchInput::placeholder{ color: rgba(11,16,32,.35); }

        .list{
          overflow:auto;
          flex: 1;
          min-height: 0;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        .row{
          padding: 12px 12px;
          border-bottom: 1px solid rgba(11,16,32,.06);
          display:flex;
          gap: 10px;
          align-items:center;
          justify-content:space-between;
          transition: background .12s ease;
        }
        .row:hover{ background: rgba(11,18,32,.02); }
        .rowActive{ background: var(--primaryBg); }

        .rowLeft{ min-width:0; display:flex; flex-direction:column; gap:2px; }

        .rowTitle{
            font-weight: 650;
            letter-spacing: -.2px;
            font-size: 12px;
            line-height: 1.25;

            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            white-space: normal;   /* ✅ allow wrap */
            max-width: 255px;
          }
                    
        .rowMeta{
          /* 👇 readable */
          font-size: 12px;
          line-height: 1.25;

          /* 👇 darker than muted */
          color: rgba(11,18,32,.68);
          font-weight: 700;
        }

        .rowBtns{
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:nowrap;
          white-space:nowrap;
          flex: 0 0 auto;
        }

        .miniBtn{
          width:34px; height:34px;
          border-radius: 12px;
          border:1px solid var(--stroke);
          background: rgba(255,255,255,.92);
          display:inline-flex;
          align-items:center;
          justify-content:center;
          cursor:pointer;
          transition: transform .10s ease, border-color .15s ease, box-shadow .15s ease;
          padding:0;
        }
        .miniBtn svg{ width: 14px; height: 14px; }
        .miniBtn:hover{
          border-color: var(--stroke2);
          box-shadow: 0 10px 22px rgba(11,18,32,.10);
          transform: translateY(-1px);
        }
        .miniBtn:active{ transform: translateY(0); }
        .miniBtn[disabled]{ opacity:.55; cursor:not-allowed; transform:none; box-shadow:none; }

        .miniBtn.blue{ color: var(--blue); }
        .miniBtn.green{ color: var(--green); }
        .miniBtn.violet{ color: var(--violet); }
        .miniBtn.red{ color: var(--red); }
        .miniBtn.dark{ color: #111827; }

        .mapHeadMeta{
          font-size: 12px;
          color: var(--muted);
          display:flex;
          align-items:center;
          gap: 8px;
        }

        .mapArea{ position: relative; flex: 1; min-height: 0; background: rgba(11,18,32,.03); }
        .mapInner{ position:absolute; inset: 0; }

        .error{
          padding: 10px 12px;
          border-top: 1px solid rgba(217,45,32,.18);
          background: rgba(217,45,32,.08);
          color: #7a0b1a;
          font-size: 12px;
          font-weight: 800;
          display:flex;
          gap: 8px;
          align-items:center;
        }

        /* modals */
        .overlayModal{
          position:fixed; inset:0;
          background: rgba(11,16,32,.38);
          display:grid; place-items:center;
          padding:12px;
          z-index: 10050;
        }
        .modal{
          width:min(560px, 100%);
          border-radius: 20px;
          border:1px solid rgba(11,16,32,.12);
          background: rgba(255,255,255,.95);
          backdrop-filter: blur(12px);
          box-shadow: 0 30px 90px rgba(11,16,32,.22);
          overflow:hidden;
          max-height: calc(100vh - 24px);
          display:flex;
          flex-direction:column;
          animation: popIn .14s ease-out;
        }
        .modalHead{
          padding: 12px;
          border-bottom: 1px solid rgba(11,16,32,.08);
          display:flex; align-items:center; justify-content:space-between; gap:10px;
          font-weight: 700;
        }
        .modalBody{
          padding: 12px;
          font-size: 13px;
          color: rgba(11,16,32,.78);
          overflow:auto;
        }
        .modalFoot{
          padding: 12px;
          border-top: 1px solid rgba(11,16,32,.08);
          display:flex; justify-content:flex-end; gap:10px;
        }
        .fieldInput{
          width:100%;
          padding: 11px 12px;
          border-radius: 14px;
          border: 1px solid rgba(11,16,32,.12);
          background: rgba(255,255,255,.98);
          outline: none;
          font-weight: 700;
        }
        .btn{
          padding:10px 12px;
          border-radius: 14px;
          border:1px solid rgba(11,16,32,.12);
          background: rgba(255,255,255,.92);
          font-weight: 700;
          cursor:pointer;
        }
        .btnPrimary{
          border-color: rgba(15,122,58,.28);
          background: linear-gradient(180deg, rgba(15,122,58,.10), rgba(255,255,255,.92));
        }

        /* saving overlay */
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
        .overlayTitle{ font-size: 14px; font-weight: 950; letter-spacing: -.2px; }
        .overlaySub{
          margin-top: 3px;
          font-size: 12px;
          font-weight: 600;
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

        @media (max-width: 980px){
          body{ overflow: auto; }
          .grid{ grid-template-columns: 1fr; }
          .mapArea{ min-height: 52vh; }
          .rowTitle{ max-width: 70vw; }
        }

        /* tooltip portal */
        .ttAnchor{
          position: relative;
          display: inline-flex;
          align-items: center;
        }
        .ttFloat{
          position: fixed;
          z-index: 200000;
          background: rgba(255,255,255,.96);
          border: 1px solid rgba(11,16,32,.14);
          box-shadow: 0 18px 50px rgba(11,16,32,.18);
          padding: 6px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          color: rgba(11,16,32,.88);
          white-space: nowrap;
          pointer-events: none;
        }
        .ttFloat.isTop{ transform: translate(-50%, calc(-100% - 10px)); }
        .ttFloat.isBottom{ transform: translate(-50%, 10px); }

        /* smaller topbar buttons */
        .iconBtnSm{
          width: 34px;
          height: 34px;
          border-radius: 12px;
        }
        .iconBtnSm svg{
          width: 16px;
          height: 16px;
        }

        /* ⋮ menu */
        .dotsMenu{
          position: fixed;
          z-index: 250000;
          border-radius: 16px;
          border: 1px solid rgba(11,16,32,.12);
          background: rgba(255,255,255,.96);
          backdrop-filter: blur(12px);
          box-shadow: 0 24px 80px rgba(11,18,32,.18);
          overflow: hidden;
          animation: popIn .12s ease-out;
        }
        .dotsMenuHead{
          padding: 10px 10px 8px;
          border-bottom: 1px solid rgba(11,16,32,.08);
          background: rgba(255,255,255,.82);
        }

.dotsMenuTitle{
  font-weight: 700;
  font-size: 14px;
  letter-spacing: -.2px;
  overflow:hidden;
  white-space:nowrap;
  text-overflow: ellipsis;
}

.dotsMenuSub{
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(11,16,32,.68);
  overflow:hidden;
  white-space:nowrap;
  text-overflow: ellipsis;
}

.dotsItem{
  width: 100%;
  display:flex;
  align-items:center;
  gap: 10px;
  padding: 12px 10px; /* 👈 more touch-friendly */
  border: 0;
  background: transparent;
  cursor: pointer;

  font-weight: 600;
  font-size: 13px; /* 👈 bigger */
  color: rgba(11,16,32,.92);
}
        .dotsItem:hover{
          background: rgba(11,18,32,.04);
        }
        .dotsIco{
          width: 28px;
          height: 28px;
          border-radius: 10px;
          border: 1px solid rgba(11,16,32,.10);
          background: rgba(255,255,255,.92);
          display:flex;
          align-items:center;
          justify-content:center;
          flex: 0 0 auto;
        }
        .dotsSep{
          height: 1px;
          background: rgba(11,16,32,.08);
          margin: 6px 10px;
        }
        .dotsItem.blue{ color: var(--blue); }
        .dotsItem.green{ color: var(--green); }
        .dotsItem.violet{ color: var(--violet); }
        .dotsItem.red{ color: var(--red); }
        .dotsItem.dark{ color: #111827; }
      `}</style>

      {toast.show ? (
        <div className="toast" role="status" aria-live="polite">
          <span className={`dot ${toast.type}`} />
          <div style={{ lineHeight: 1.2 }}>{toast.message}</div>
        </div>
      ) : null}

      {(uploading || loadingList || busyId || renaming) && overlayTitle ? (
        <OverlaySpinner title={overlayTitle} subtitle="Please wait… we’re processing your request." />
      ) : null}

      <div className="topbar">
        <div className="title">
          <div>Layers</div>
          <div className="sub">Upload • Preview • Rename • Edit Attributes</div>
        </div>

        <span className="pill" title="Total layers shown">
          <Icon name="info" size={14} />
          {loadingList ? "Loading…" : `${filteredLayers.length} layers`}
        </span>

        <div className="tools" />

        <Tooltip text="Upload">
          <button
            onClick={openUpload}
            disabled={uiLocked}
            className="iconBtn iconBtnSm iconBtnPrimary"
            aria-label="Upload"
          >
            <Icon name="upload" />
          </button>
        </Tooltip>

        <Tooltip text="Refresh">
          <button
            onClick={refresh}
            disabled={uiLocked}
            className="iconBtn iconBtnSm iconBtnCyan"
            aria-label="Refresh"
          >
            <Icon name="reload" />
          </button>
        </Tooltip>
      </div>

      <div className="grid">
        <div className="card">
          <div className="cardHead">
            <div style={{ flex: 1 }}>
              <div className="searchWrap">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search layers…"
                  className="searchInput"
                  disabled={uiLocked}
                />
              </div>
            </div>

            <div className="mapHeadMeta">
              <Icon name="info" size={14} />
              {loadingList ? "Loading…" : filteredLayers.length}
            </div>
          </div>

          {error ? (
            <div className="error">
              <Icon name="x" size={14} />
              {error}
            </div>
          ) : null}

          <div className="list">
            {filteredLayers.map((l) => {
              const busy = busyId === l.id;
              const active = selectedId === l.id;

              return (
                <div
                  key={l.id}
                  className={`row ${active ? "rowActive" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => !uiLocked && previewLayer(l.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !uiLocked) previewLayer(l.id);
                  }}
                  style={{ cursor: uiLocked ? "default" : "pointer" }}
                  title={uiLocked ? "Please wait…" : "Click to preview"}
                >
                  <div className="rowLeft">
                    {/* ✅ title attr shows full text on hover; rowTitle keeps it clean */}
                    <div className="rowTitle" title={l.name}>
                      {l.name}
                    </div>
                    <div className="rowMeta">
                      {l.geom_type ?? "-"} • {l.feature_count ?? 0} feat • SRID {l.srid ?? "-"}
                    </div>
                  </div>

                  {/* ✅ Replaced 5 buttons with a single ⋮ menu */}
                  <div className="rowBtns" onClick={(e) => e.stopPropagation()}>
                    <DotsMenu
                      layer={l}
                      disabled={uiLocked || busy}
                      onPreview={() => previewLayer(l.id)}
                      onDownload={() => downloadGeoJSON(l.id, l.name)}
                      onRename={() => openRename(l)}
                      onEdit={() => openEditorInNewTab(l.id)}
                      onDelete={() => deleteLayer(l.id, l.name)}
                    />
                  </div>
                </div>
              );
            })}

            {filteredLayers.length === 0 ? (
              <div style={{ padding: 12, color: "rgba(11,16,32,.62)", fontWeight: 700, fontSize: 12 }}>
                {loadingList ? "Loading layers…" : "No layers found."}
              </div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="cardHead">
            <div
              style={{
                fontWeight: 1000,
                letterSpacing: "-.2px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={selectedLayer ? selectedLayer.name : "Preview"}
            >
              {selectedLayer ? selectedLayer.name : "Preview"}
            </div>

            <div className="mapHeadMeta">
              {selectedLayer ? (
                <>
                  <Icon name="check" size={14} />
                  {featureCount} features
                </>
              ) : (
                <>
                  <Icon name="info" size={14} />
                  No layer selected
                </>
              )}
            </div>
          </div>

          <div className="mapArea">
            <div className="mapInner">
              <ResultMap key={mapKey} geojson={geojson} />
            </div>

            {busyId && selectedId === busyId ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(255,255,255,.55)",
                  backdropFilter: "blur(6px)",
                  display: "grid",
                  placeItems: "center",
                  pointerEvents: "none",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <SpinnerDot size={16} />
                  Loading preview…
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload ? (
        <div role="dialog" aria-modal="true" onClick={closeUpload} className="overlayModal">
          <div onClick={(e) => e.stopPropagation()} className="modal">
            <div className="modalHead">
              <div>Upload GeoJSON</div>
              <button onClick={closeUpload} disabled={uploading} className="iconBtn" aria-label="Close">
                <Icon name="close" />
              </button>
            </div>

            <div className="modalBody">
              <div style={{ display: "grid", gap: 10 }}>
                <input
                  placeholder="Layer name (optional)"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  className="fieldInput"
                  disabled={uploading}
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

                {uploadStatus ? <div style={{ whiteSpace: "pre-wrap", fontWeight: 700 }}>{uploadStatus}</div> : null}
              </div>
            </div>

            <div className="modalFoot">
              <button onClick={closeUpload} disabled={uploading} className="btn">
                Close
              </button>
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn btnPrimary" type="button">
                Choose file
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Rename Modal */}
      {showRename ? (
        <div role="dialog" aria-modal="true" onClick={closeRename} className="overlayModal">
          <div onClick={(e) => e.stopPropagation()} className="modal">
            <div className="modalHead">
              <div>Rename Layer</div>
              <button onClick={closeRename} disabled={renaming} className="iconBtn" aria-label="Close">
                <Icon name="close" />
              </button>
            </div>

            <div className="modalBody">
              <input
                placeholder="New layer name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="fieldInput"
                autoFocus
                disabled={renaming}
              />
            </div>

            <div className="modalFoot">
              <button onClick={closeRename} disabled={renaming} className="btn">
                Cancel
              </button>
              <button onClick={renameLayer} disabled={renaming || !renameValue.trim()} className="btn btnPrimary">
                {renaming ? "Renaming…" : "Rename"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
    </>
  );
}