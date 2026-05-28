// C:\Users\Yummie03\Desktop\onemap\app\viewmap\page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import ResultMap from "@/app/components/ResultMapClient";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import AuthGuard from "@/app/components/AuthGuard";
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
  faLocationCrosshairs,
  faArrowUp,
  faArrowDown,
  faAnglesUp,
  faAnglesDown,
  faPlus,
  faMinus,
  faBars,
  faSliders,
  faUpload,
  faFolderOpen,
  faMap,
  faGlobe,
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

const DEFAULT_LAYER_COLOR = "#2563eb";
const DEFAULT_TABLE_COLOR = "#2563eb";

const MY_LOC_LAYER_ID = "__my_location__";
const MEASURE_LAYER_ID = "__measure__";

const LOCAL_LAYER_PREFIX = "__local__";
let localLayerCounter = 0;
function nextLocalId() {
  return `${LOCAL_LAYER_PREFIX}${++localLayerCounter}`;
}

function safeJsonParse(text: string) {
  try { return JSON.parse(text); } catch { return { ok: false, error: text }; }
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
  keySet.add("__idx"); keySet.add("__fid");
  for (const r of rows) for (const k of Object.keys(r)) keySet.add(k);
  const internalVisible = ["__idx"];
  const internalHidden = ["__fid"];
  const rest = Array.from(keySet)
    .filter((c) => !internalVisible.includes(c) && !internalHidden.includes(c))
    .sort((a, b) => a.localeCompare(b));
  return { columns: [...internalVisible, ...rest], rows };
}

function stringifyCell(v: any) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
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
  "A&D","CADC","CADT","CBFMA","CSC","FLAG","FLAGT","FLGMA",
  "FORESHORE","GSUP","NGP","PA","PACBRMA","SIFMA","SLUP","TFLA","OTHERS"
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
    <span style={{
      width: size, height: size, borderRadius: 999,
      border: "2px solid rgba(232,240,254,.15)",
      borderTopColor: "#3b82f6",
      display: "inline-block",
      animation: "spin .85s linear infinite",
    }} />
  );
}

function OverlaySpinner({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="overlaySaving" role="alert" aria-live="assertive" aria-busy="true">
      <div className="overlayCard">
        <div className="overlayTop">
          <div className="overlayIcon"><SpinnerDot size={18} /></div>
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

function toRad(d: number) { return (d * Math.PI) / 180; }
function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const s = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}
function formatDistance(m: number) {
  if (!Number.isFinite(m)) return "-";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m/1000).toFixed(m >= 10000 ? 1 : 2)} km`;
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const STYLES = `
  /* ── RESET & BASE ── */
  html,body{ height:100%; margin:0; overflow:hidden; }
  html,body{
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  *{ box-sizing:border-box; }
  b{ font-weight:700; }
  ::selection{ background:rgba(15,122,58,.25); }

  /* ── TOKENS ── */
  :root{
    --primary:#0f7a3a;
    --primaryBg:rgba(15,122,58,.12);
    --primaryGlow:rgba(15,122,58,.20);
    --blue:#3b82f6;
    --blueBg:rgba(59,130,246,.12);
    --danger:#d92d20;
    --dangerBg:rgba(217,45,32,.12);

    /* dark (default) */
    --bg0:#060f24;
    --bg1:#0b1535;
    --panel:rgba(5,12,30,.82);
    --panelBorder:rgba(232,240,254,.10);
    --panelBorder2:rgba(232,240,254,.18);
    --text:#e8f0fe;
    --muted:rgba(232,240,254,.50);
    --muted2:rgba(232,240,254,.28);
    --inputBg:rgba(255,255,255,.05);
    --inputBorder:rgba(232,240,254,.10);
    --shadow:0 14px 40px rgba(0,0,0,.45);
    --shadow2:0 30px 90px rgba(0,0,0,.60);
    --topline:linear-gradient(90deg,transparent,rgba(59,130,246,.55),rgba(15,122,58,.75),rgba(59,130,246,.55),transparent);
  }

  [data-theme="light"]{
    --bg0:#f0f4fa;
    --bg1:#e8eef7;
    --panel:rgba(255,255,255,.86);
    --panelBorder:rgba(11,18,32,.10);
    --panelBorder2:rgba(11,18,32,.18);
    --text:#0b1220;
    --muted:rgba(11,18,32,.58);
    --muted2:rgba(11,18,32,.35);
    --inputBg:rgba(255,255,255,.92);
    --inputBorder:rgba(11,18,32,.12);
    --shadow:0 14px 40px rgba(11,18,32,.10);
    --shadow2:0 30px 90px rgba(11,18,32,.14);
    --topline:linear-gradient(90deg,transparent,rgba(59,130,246,.40),rgba(15,122,58,.55),rgba(59,130,246,.40),transparent);
  }

  /* ── BODY BG ── */
  body{
    color:var(--text);
    background:
      radial-gradient(ellipse 80% 55% at 10% 0%, rgba(15,122,58,.13), transparent 55%),
      radial-gradient(ellipse 80% 55% at 92% 8%, rgba(59,130,246,.12), transparent 55%),
      linear-gradient(180deg, var(--bg0), var(--bg1));
  }
  [data-theme="light"] body{
    background:
      radial-gradient(ellipse 80% 55% at 10% 0%, rgba(15,122,58,.07), transparent 55%),
      radial-gradient(ellipse 80% 55% at 92% 8%, rgba(59,130,246,.06), transparent 55%),
      linear-gradient(180deg, var(--bg0), var(--bg1));
  }

  /* ── SCROLLBARS ── */
  ::-webkit-scrollbar{ width:8px; height:8px; }
  ::-webkit-scrollbar-track{ background:transparent; }
  ::-webkit-scrollbar-thumb{
    background:rgba(232,240,254,.12);
    border-radius:999px;
    border:2px solid transparent;
    background-clip:padding-box;
  }
  [data-theme="light"] ::-webkit-scrollbar-thumb{ background:rgba(11,18,32,.12); border:2px solid transparent; background-clip:padding-box; }
  ::-webkit-scrollbar-thumb:hover{ background:rgba(15,122,58,.35); border:2px solid transparent; background-clip:padding-box; }

  /* ── ANIMATIONS ── */
  @keyframes spin{ to{ transform:rotate(360deg); } }
  @keyframes shimmer{ 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  @keyframes toastIn{ from{transform:translateX(-50%) translateY(-10px);opacity:0} to{transform:translateX(-50%) translateY(0);opacity:1} }
  @keyframes popIn{ from{transform:translateY(6px) scale(.98);opacity:0} to{transform:translateY(0) scale(1);opacity:1} }
  @keyframes sheetIn{ to{transform:translateY(0);opacity:1} }
  @keyframes menuIn{ to{transform:translateY(0);opacity:1} }
  @keyframes scanAnim{
    0%{top:-2px;opacity:0} 5%{opacity:1} 95%{opacity:.6} 100%{top:100%;opacity:0}
  }
  @keyframes gridDrift{ 0%{background-position:0 0} 100%{background-position:52px 52px} }
  @keyframes blobPulse{ 0%{transform:scale(1)} 100%{transform:scale(1.06) translate(18px,-18px)} }

  /* ── RING & SHIMMER ── */
  .ring{
    display:inline-block; border-radius:999px;
    border:2px solid rgba(232,240,254,.12);
    border-top-color:var(--blue);
    box-shadow:0 0 0 5px var(--blueBg);
    animation:spin .75s linear infinite;
  }
  [data-theme="light"] .ring{ border-color:rgba(11,18,32,.10); border-top-color:var(--blue); }
  .shimmer{
    display:inline-block; border-radius:10px;
    background:linear-gradient(90deg,rgba(232,240,254,.05),rgba(232,240,254,.12),rgba(232,240,254,.05));
    background-size:200% 100%;
    animation:shimmer 1.3s ease-in-out infinite;
  }
  [data-theme="light"] .shimmer{
    background:linear-gradient(90deg,rgba(11,18,32,.05),rgba(11,18,32,.12),rgba(11,18,32,.05));
    background-size:200% 100%;
  }

  /* ── SHELL ── */
  .shell{ height:100vh; width:100%; display:flex; flex-direction:column; position:relative; overflow:hidden; }

  /* ── AMBIENT BG EFFECTS (behind everything) ── */
  .ambientBg{
    position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden;
  }
  .ambientGrid{
    position:absolute; inset:0;
    background-image:
      linear-gradient(rgba(59,130,246,.04) 1px,transparent 1px),
      linear-gradient(90deg,rgba(59,130,246,.04) 1px,transparent 1px);
    background-size:52px 52px;
    animation:gridDrift 40s linear infinite;
  }
  [data-theme="light"] .ambientGrid{
    background-image:
      linear-gradient(rgba(59,130,246,.03) 1px,transparent 1px),
      linear-gradient(90deg,rgba(59,130,246,.03) 1px,transparent 1px);
  }
  .ambientScan{
    position:absolute; left:0; right:0; height:1px; pointer-events:none;
    background:linear-gradient(90deg,transparent,rgba(59,130,246,.25),rgba(15,122,58,.40),rgba(59,130,246,.25),transparent);
    animation:scanAnim 10s ease-in-out infinite;
  }
  .ambientBlob{
    position:absolute; border-radius:50%; filter:blur(100px); pointer-events:none;
    animation:blobPulse ease-in-out infinite alternate;
  }

  /* ── TOP BAR ── */
  .topBar{
    height:58px;
    padding:0 14px;
    border-bottom:1px solid var(--panelBorder);
    background:rgba(5,12,30,.82);
    backdrop-filter:blur(20px) saturate(1.5);
    display:flex; align-items:center; justify-content:space-between; gap:12px;
    position:relative; z-index:70000;
    flex-shrink:0;
  }
  [data-theme="light"] .topBar{
    background:rgba(255,255,255,.82);
  }
  /* top accent line */
  .topBar::before{
    content:""; position:absolute; top:0; left:0; right:0; height:2px;
    background:var(--topline);
  }

  .brand{ display:flex; align-items:center; gap:10px; min-width:0; }
  .brandLogo{
    width:38px; height:38px; border-radius:12px; flex:0 0 auto; overflow:hidden;
    border:1px solid rgba(232,240,254,.12);
    background:rgba(255,255,255,.96);
    box-shadow:0 0 0 3px rgba(59,130,246,.10),0 10px 24px rgba(0,0,0,.30);
    display:flex; align-items:center; justify-content:center;
  }
  [data-theme="light"] .brandLogo{ border-color:rgba(11,18,32,.10); box-shadow:0 0 0 3px rgba(59,130,246,.08),0 8px 18px rgba(11,18,32,.10); }
  .brandTxt{ display:flex; flex-direction:column; gap:1px; line-height:1.18; min-width:0; }
  .brandTitle{ font-size:13px; font-weight:850; letter-spacing:-.2px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .brandSub{ font-size:10.5px; font-weight:600; color:var(--muted); white-space:nowrap; }

  /* status pills in topbar */
  .statusPill{
    font-size:10.5px; font-weight:600; color:var(--muted);
    border:1px solid var(--panelBorder);
    padding:5px 9px; border-radius:999px;
    background:rgba(255,255,255,.04);
    display:inline-flex; align-items:center; gap:6px; white-space:nowrap;
  }
  [data-theme="light"] .statusPill{ background:rgba(255,255,255,.70); color:rgba(11,18,32,.65); }
  .statusDot{ width:7px; height:7px; border-radius:999px; background:rgba(232,240,254,.25); flex:0 0 auto; }
  .statusDot.green{ background:rgba(15,122,58,.90); box-shadow:0 0 0 4px rgba(15,122,58,.18); }
  .statusDot.blue{ background:rgba(59,130,246,.90); box-shadow:0 0 0 4px rgba(59,130,246,.18); }

  .topRight{ display:flex; align-items:center; gap:8px; }

  .avatar{
    width:34px; height:34px; border-radius:999px;
    display:flex; align-items:center; justify-content:center;
    border:1px solid rgba(232,240,254,.14);
    background:linear-gradient(135deg,rgba(15,122,58,.25),rgba(59,130,246,.15));
    color:#7effc0; font-size:12px; font-weight:850; overflow:hidden; line-height:1;
    box-shadow:0 0 0 3px rgba(15,122,58,.12);
  }
  [data-theme="light"] .avatar{
    border-color:rgba(11,18,32,.12);
    background:linear-gradient(135deg,rgba(15,122,58,.12),rgba(59,130,246,.08));
    color:var(--primary);
    box-shadow:0 0 0 3px rgba(15,122,58,.08);
  }

  /* ── BUTTONS ── */
  .btn{
    border:1px solid var(--panelBorder);
    background:rgba(255,255,255,.05);
    color:var(--text);
    font-weight:650; cursor:pointer;
    display:inline-flex; align-items:center; gap:8px;
    user-select:none;
    transition:transform .10s ease,border-color .15s ease,box-shadow .15s ease,background .15s ease;
    padding:8px 11px; border-radius:13px; font-size:11px;
    white-space:nowrap;
  }
  [data-theme="light"] .btn{ background:rgba(255,255,255,.92); border-color:rgba(11,18,32,.10); }
  .btn:hover{
    border-color:var(--panelBorder2);
    box-shadow:0 10px 26px rgba(0,0,0,.28);
    transform:translateY(-1px);
    background:rgba(255,255,255,.09);
  }
  [data-theme="light"] .btn:hover{ background:rgba(255,255,255,.98); box-shadow:0 10px 26px rgba(11,18,32,.10); }
  .btn:active{ transform:translateY(0); }
  .btn:focus-visible{ outline:3px solid rgba(15,122,58,.25); outline-offset:2px; }
  .btn[disabled]{ opacity:.45; cursor:not-allowed; transform:none !important; box-shadow:none !important; }

  .btnPrimary{
    border-color:rgba(15,122,58,.35);
    background:linear-gradient(160deg,rgba(15,122,58,.20),rgba(15,122,58,.08));
    color:#7effc0;
  }
  .btnPrimary:hover{
    background:linear-gradient(160deg,rgba(15,122,58,.32),rgba(15,122,58,.16));
    border-color:rgba(15,122,58,.55);
    box-shadow:0 0 20px rgba(15,122,58,.20),0 10px 26px rgba(0,0,0,.28);
  }
  [data-theme="light"] .btnPrimary{
    border-color:rgba(15,122,58,.28);
    background:linear-gradient(160deg,rgba(15,122,58,.12),rgba(255,255,255,.90));
    color:#0a5428;
  }

  .btnDanger{
    border-color:rgba(217,45,32,.30);
    background:rgba(217,45,32,.08);
    color:rgba(255,150,140,.90);
  }
  .btnDanger:hover{
    border-color:rgba(217,45,32,.50);
    background:rgba(217,45,32,.14);
    box-shadow:0 0 16px rgba(217,45,32,.16),0 10px 26px rgba(0,0,0,.28);
  }
  [data-theme="light"] .btnDanger{
    border-color:rgba(217,45,32,.22);
    background:rgba(217,45,32,.06);
    color:rgba(180,35,24,.90);
  }

  .btnGhost{ background:rgba(255,255,255,.04); }
  [data-theme="light"] .btnGhost{ background:rgba(255,255,255,.90); }

  .iconBtn{ width:38px; height:38px; padding:0; justify-content:center; border-radius:13px; }
  .miniIconBtn{ width:32px; height:32px; padding:0; justify-content:center; border-radius:999px; }
  .iconActive{
    border-color:rgba(15,122,58,.45) !important;
    background:rgba(15,122,58,.14) !important;
    color:#7effc0 !important;
    box-shadow:0 0 16px rgba(15,122,58,.18) !important;
  }
  [data-theme="light"] .iconActive{
    border-color:rgba(15,122,58,.30) !important;
    background:rgba(15,122,58,.10) !important;
    color:#0a5428 !important;
    box-shadow:none !important;
  }

  /* ── MAIN LAYOUT ── */
  .main{
    flex:1; min-height:0;
    display:grid; grid-template-columns:1fr;
    gap:10px; padding:10px;
    position:relative; z-index:1;
  }
  .split{
    flex:1; min-height:0;
    display:grid;
    grid-template-columns:var(--panelW) 10px 1fr;
    gap:0;
  }

  /* ── GLASS PANELS ── */
  .panel,.mapStack{
    border:1px solid var(--panelBorder);
    border-radius:22px;
    background:var(--panel);
    backdrop-filter:blur(28px) saturate(1.4);
    box-shadow:var(--shadow);
    display:flex; flex-direction:column;
    min-height:0; overflow:hidden;
    position:relative;
  }
  /* top accent line on panels */
  .panel::before,.mapStack::before{
    content:""; position:absolute; top:0; left:0; right:0; height:1.5px;
    background:var(--topline); border-radius:22px 22px 0 0;
  }

  /* ── SPLITTER ── */
  .splitterWrap{ display:flex; align-items:stretch; justify-content:center; }
  .splitter{
    width:10px; cursor:col-resize; position:relative;
    display:flex; align-items:center; justify-content:center;
  }
  .splitter::before{
    content:""; width:3px; height:100%; border-radius:999px;
    background:rgba(232,240,254,.06);
    transition:background .15s ease;
  }
  .splitter:hover::before{ background:rgba(15,122,58,.28); }
  .splitterGrip{
    position:absolute; width:8px; height:48px; border-radius:999px;
    border:1px solid var(--panelBorder);
    background:rgba(10,20,45,.90);
    backdrop-filter:blur(8px);
    box-shadow:0 10px 24px rgba(0,0,0,.30);
    display:flex; align-items:center; justify-content:center; opacity:.80;
  }
  [data-theme="light"] .splitterGrip{ background:rgba(255,255,255,.92); }
  .splitterDots{
    width:3px; height:20px; border-radius:999px;
    background:linear-gradient(180deg,rgba(232,240,254,.25),rgba(232,240,254,.05));
  }
  [data-theme="light"] .splitterDots{ background:linear-gradient(180deg,rgba(11,18,32,.20),rgba(11,18,32,.05)); }

  /* ── PANEL HEAD ── */
  .panelHead{
    padding:12px 12px 10px;
    border-bottom:1px solid var(--panelBorder);
    display:flex; flex-direction:column; gap:10px;
  }
  .headRow{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .headLeft{ display:flex; align-items:center; gap:8px; min-width:0; flex-wrap:wrap; }

  .sectionTitle{
    font-size:12.5px; font-weight:750; letter-spacing:-.15px;
    display:flex; align-items:center; gap:8px;
    color:var(--text);
  }

  /* ── TOOLBAR ── */
  .toolbar{
    display:flex; gap:6px; align-items:center;
    padding:5px;
    border:1px solid var(--panelBorder);
    border-radius:15px;
    background:rgba(255,255,255,.03);
  }
  [data-theme="light"] .toolbar{ background:rgba(11,18,32,.03); }

  /* ── SEARCH ── */
  .searchWrap{
    display:flex; align-items:center; gap:10px; padding:9px 11px;
    border-radius:14px; border:1px solid var(--inputBorder);
    background:var(--inputBg);
    transition:border-color .15s ease,box-shadow .15s ease,background .15s ease;
  }
  .searchWrap:focus-within{
    border-color:rgba(15,122,58,.45);
    box-shadow:0 0 0 4px rgba(15,122,58,.10);
    background:rgba(255,255,255,.07);
  }
  [data-theme="light"] .searchWrap:focus-within{ background:rgba(255,255,255,.98); }
  .searchInput{
    width:100%; border:0; outline:0; background:transparent;
    font-weight:560; color:var(--text); font-size:12px;
  }
  .searchInput::placeholder{ color:var(--muted2); font-weight:500; }

  /* ── SEGMENTED CONTROL ── */
  .segWrap{
    display:flex; gap:5px; padding:5px;
    border:1px solid var(--panelBorder); border-radius:13px;
    background:rgba(255,255,255,.03); width:fit-content;
  }
  [data-theme="light"] .segWrap{ background:rgba(11,18,32,.03); }
  .seg{
    border:1px solid transparent; background:transparent;
    padding:7px 10px; border-radius:11px;
    font-size:11px; font-weight:600; cursor:pointer;
    color:var(--muted); display:flex; align-items:center; gap:7px;
    transition:all .15s ease;
  }
  .seg.active{
    background:rgba(255,255,255,.07);
    border-color:var(--panelBorder);
    box-shadow:0 8px 20px rgba(0,0,0,.20);
    color:var(--text);
  }
  [data-theme="light"] .seg.active{
    background:rgba(255,255,255,.96);
    box-shadow:0 8px 20px rgba(11,18,32,.10);
    color:var(--text);
  }

  /* ── LIST ── */
.listWrap{
    flex:1; min-height:0; overflow-y:auto; overflow-x:hidden;
    -webkit-overflow-scrolling:touch;
    padding:10px; display:flex; flex-direction:column; gap:7px;
}

  /* ── PILL / CHIP ── */
  .pill,.chip{
    font-size:10.5px; font-weight:620;
    color:var(--muted);
    border:1px solid var(--panelBorder);
    padding:5px 9px; border-radius:999px;
    background:rgba(255,255,255,.04);
    display:inline-flex; align-items:center; gap:6px; white-space:nowrap;
  }
  [data-theme="light"] .pill,[data-theme="light"] .chip{
    background:rgba(255,255,255,.80);
    color:rgba(11,18,32,.72);
  }

  /* ── BADGE ── */
  .badgeOn{
    font-size:10px; font-weight:700;
    padding:4px 8px; border-radius:999px;
    border:1px solid rgba(15,122,58,.30);
    background:rgba(15,122,58,.12);
    color:rgba(126,255,192,.90);
    white-space:nowrap;
  }
  [data-theme="light"] .badgeOn{
    background:rgba(15,122,58,.10);
    color:#0a5428;
    border-color:rgba(15,122,58,.25);
  }

  /* ── LAYER ITEM ── */
  .miniItem{
    display:flex; align-items:center; justify-content:space-between; gap:8px;
    padding:9px 10px; border-radius:14px;
    border:1px solid var(--panelBorder);
    background:rgba(255,255,255,.03);
    transition:transform .10s ease,border-color .15s ease,box-shadow .15s ease,background .15s ease;
  }
  .miniItem:hover{
    border-color:rgba(15,122,58,.22);
    box-shadow:0 10px 28px rgba(0,0,0,.25);
    transform:translateY(-1px);
    background:rgba(15,122,58,.05);
  }
  [data-theme="light"] .miniItem{
    background:rgba(255,255,255,.85);
    border-color:rgba(11,18,32,.08);
  }
  [data-theme="light"] .miniItem:hover{
    background:rgba(255,255,255,.98);
    border-color:rgba(15,122,58,.18);
    box-shadow:0 10px 28px rgba(11,18,32,.10);
  }
  .miniItem.stacked{ flex-direction:column; align-items:stretch; gap:8px; }
  .miniItem.stacked .miniName{ white-space:normal; -webkit-line-clamp:2; -webkit-box-orient:vertical; display:-webkit-box; overflow:hidden; }
  .miniItem.stacked .miniActions{ width:100%; justify-content:flex-start; flex-wrap:wrap; padding-top:8px; border-top:1px solid var(--panelBorder); }

  .miniNameBtn{
    border:0; background:transparent; cursor:pointer; padding:0;
    text-align:left; min-width:0; flex:1;
    display:flex; flex-direction:column; gap:2px;
  }
  .miniName{ font-size:11px; font-weight:700; letter-spacing:-.06px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .miniMeta{ font-size:10px; font-weight:500; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .miniActions{
    display:flex; align-items:center; gap:6px;
    flex:0 0 auto; flex-wrap:nowrap; justify-content:flex-end; overflow:visible;
  }

  /* ── GROUP BLOCKS ── */
.groupBlock{
    border:1px solid var(--panelBorder);
    border-radius:16px;
    background:rgba(255,255,255,.02);
    overflow:visible;  /* ← was "hidden" */
}
  [data-theme="light"] .groupBlock{
    background:rgba(255,255,255,.65);
    border-color:rgba(11,18,32,.08);
  }
  .groupHeader{
    width:100%; border:0;
    background:rgba(255,255,255,.04);
    padding:9px 10px;
    display:flex; align-items:center; justify-content:space-between;
    cursor:pointer; border-radius:0;
    transition:background .15s ease,box-shadow .15s ease,transform .10s ease;
  }
  .groupHeader:hover{ background:rgba(15,122,58,.08); transform:none; }
  [data-theme="light"] .groupHeader{ background:rgba(255,255,255,.80); }
  [data-theme="light"] .groupHeader:hover{ background:rgba(15,122,58,.05); }
  .groupLeft{ display:flex; align-items:center; gap:8px; min-width:0; }
  .groupTitle{ font-size:11px; font-weight:750; letter-spacing:-.12px; color:var(--text); }
  .groupBadge{
    font-size:9.5px; font-weight:700; padding:2px 7px; border-radius:999px;
    background:rgba(15,122,58,.12); border:1px solid rgba(15,122,58,.22);
    color:rgba(126,255,192,.90); line-height:1.2;
  }
  [data-theme="light"] .groupBadge{ background:rgba(15,122,58,.10); color:#0a5428; border-color:rgba(15,122,58,.20); }
  .groupToggle{ font-size:10px; color:var(--muted); }
.groupItems{
    overflow-x:hidden;
    padding:10px 10px 10px 10px;
    display:flex; flex-direction:column; gap:7px;
  }

  /* ── ERROR ── */
  .err{
    font-size:10.5px; font-weight:650;
    color:rgba(255,160,150,.88);
    background:rgba(217,45,32,.10);
    border:1px solid rgba(217,45,32,.20);
    padding:7px 10px; border-radius:12px; margin-top:5px;
  }
  [data-theme="light"] .err{ color:#7a0b1a; background:rgba(217,45,32,.07); border-color:rgba(217,45,32,.14); }

  /* ── MAP STACK ── */
  .mapCard{
    flex:1; min-height:0; display:flex; flex-direction:column;
    border-bottom:1px solid var(--panelBorder); overflow:hidden;
  }
  .mapHead{
    padding:11px 12px; border-bottom:1px solid var(--panelBorder);
    display:flex; justify-content:space-between; align-items:center; gap:10px;
    flex-wrap:wrap;
    background:rgba(5,12,30,.60);
    backdrop-filter:blur(12px);
  }
  [data-theme="light"] .mapHead{ background:rgba(255,255,255,.82); }
  .mapTitle{
    font-weight:750; letter-spacing:-.18px;
    display:flex; align-items:center; gap:8px; font-size:12.5px; flex-wrap:wrap;
    color:var(--text);
  }
  .mapArea{ position:relative; flex:1; min-height:0; }
  .mapInner{ position:absolute; inset:0; border-radius:20px; overflow:hidden; }

  /* ── DOCK / TABLE ── */
  .dock{
    flex:0 0 auto; display:flex; flex-direction:column;
    background:rgba(5,12,30,.75);
    backdrop-filter:blur(18px);
    overflow:hidden; position:relative;
  }
  [data-theme="light"] .dock{ background:rgba(255,255,255,.88); }

  .dockResizer{
    position:absolute; top:0; left:0; right:0; height:10px;
    cursor:row-resize; z-index:10;
    display:flex; align-items:center; justify-content:center;
  }
  .dockResizer::before{
    content:""; width:60px; height:3px; border-radius:999px;
    background:rgba(232,240,254,.12); transition:background .15s ease;
  }
  [data-theme="light"] .dockResizer::before{ background:rgba(11,18,32,.12); }
  .dockResizer:hover::before{ background:rgba(15,122,58,.35); }

  .dockTop{
    padding:9px 12px; border-bottom:1px solid var(--panelBorder);
    display:flex; align-items:center; justify-content:space-between; gap:10px;
    flex-wrap:wrap;
    background:rgba(5,12,30,.70);
    backdrop-filter:blur(12px);
  }
  [data-theme="light"] .dockTop{ background:rgba(255,255,255,.92); }
  .dockTitle{
    font-weight:720; letter-spacing:-.12px;
    display:flex; align-items:center; gap:8px;
    min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    font-size:11.5px; color:var(--text);
  }
  .dockBody{
    height:var(--dockH); min-height:180px; max-height:62vh;
    display:flex; flex-direction:column; overflow:hidden;
    transition:height .18s ease; will-change:height;
  }
  .dockBody.collapsed{ height:0 !important; min-height:0; border-top:0; }
  body.resizingDock .dockBody{ transition:none; }
  body.resizingPanel .split{ transition:none; }

  /* ── TABLE BAR ── */
  .tableBar{
    padding:9px 12px; border-bottom:1px solid var(--panelBorder);
    display:flex; gap:8px; flex-wrap:wrap; align-items:center;
    background:rgba(5,12,30,.50);
  }
  [data-theme="light"] .tableBar{ background:rgba(255,255,255,.92); }
  .tableBarRight{
    margin-left:auto; display:flex; gap:7px;
    align-items:center; flex-wrap:wrap; justify-content:flex-end;
  }
  .smallHint{
    font-size:11px; font-weight:580; color:var(--muted);
    display:inline-flex; align-items:center; gap:7px; white-space:nowrap;
  }

  /* ── COLOR PICKER ── */
  .colorPickWrap{ display:inline-flex; align-items:center; gap:6px; }
  .colorCircle{
    width:32px; height:32px; border-radius:999px;
    border:1px solid var(--panelBorder);
    background:rgba(255,255,255,.06);
    box-shadow:0 8px 20px rgba(0,0,0,.20);
    display:inline-flex; align-items:center; justify-content:center;
    cursor:pointer; transition:transform .10s ease,border-color .15s ease;
  }
  [data-theme="light"] .colorCircle{ background:rgba(255,255,255,.92); }
  .colorCircle:hover{ transform:translateY(-1px); border-color:rgba(15,122,58,.30); }
  .colorSwatch{ width:13px; height:13px; border-radius:999px; border:1px solid rgba(232,240,254,.20); }
  [data-theme="light"] .colorSwatch{ border-color:rgba(11,18,32,.18); }
  .hiddenColorInput{ position:absolute; opacity:0; width:1px; height:1px; pointer-events:none; }

  /* ── TABLE ── */
  .tableWrap{
    flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch;
    background:rgba(5,12,30,.30);
  }
  [data-theme="light"] .tableWrap{ background:rgba(11,18,32,.02); }
  table{ border-collapse:separate; border-spacing:0; width:100%; font-size:10.5px; min-width:980px; }
  th,td{ border-bottom:1px solid var(--panelBorder); padding:8px 10px; text-align:left; vertical-align:middle; }
  th{
    position:sticky; top:0; z-index:3;
    background:rgba(5,12,30,.92);
    border-bottom:1px solid var(--panelBorder2);
    font-weight:700; color:rgba(232,240,254,.85); white-space:nowrap;
    backdrop-filter:blur(8px);
  }
  [data-theme="light"] th{ background:rgba(255,255,255,.98); color:rgba(11,18,32,.88); border-bottom-color:rgba(11,18,32,.12); }
  td{
    font-weight:450; color:rgba(232,240,254,.76);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:260px;
  }
  [data-theme="light"] td{ color:rgba(11,18,32,.80); border-bottom-color:rgba(11,18,32,.07); }
  td.col-idx,td.col-fid{ font-family:ui-monospace,monospace; white-space:nowrap; max-width:none; }
  tbody tr:hover td{ background:rgba(15,122,58,.06); }
  tbody tr.rowSelected td{
    background:rgba(15,122,58,.10) !important;
    border-bottom-color:rgba(15,122,58,.18);
  }
  tbody tr.rowSelected td:first-child{ box-shadow:inset 3px 0 0 rgba(15,122,58,.75); }
  .rowActionsCell{ white-space:nowrap; vertical-align:middle; width:140px; }
  .rowActions{ display:flex; align-items:center; gap:8px; }
  .rowChk{ width:15px; height:15px; cursor:pointer; accent-color:var(--primary); }

  /* ── PROFILE MENU ── */
  .profileWrap{ position:relative; z-index:70000; }
  .profileMenu{
    position:absolute; top:calc(100% + 10px); right:0; width:240px;
    border-radius:18px; border:1px solid var(--panelBorder);
    background:rgba(5,12,30,.95);
    backdrop-filter:blur(28px) saturate(1.5);
    box-shadow:var(--shadow2); overflow:hidden; z-index:70010;
    transform:translateY(6px); opacity:0;
    animation:menuIn .14s ease-out forwards;
  }
  [data-theme="light"] .profileMenu{
    background:rgba(255,255,255,.96);
  }
  .profileMenu::before{
    content:""; position:absolute; top:0; left:0; right:0; height:1.5px;
    background:var(--topline);
  }
  .profileHead{ padding:12px 12px 10px; }
  .profileName{ font-size:13px; font-weight:750; letter-spacing:-.1px; color:var(--text); }
  .profileRole{ font-size:10.5px; color:var(--muted); margin-top:2px; font-weight:550; }
  .profileDivider{ height:1px; background:var(--panelBorder); }
  .profileItem{
    width:100%; display:flex; align-items:center; gap:10px;
    padding:11px 12px; border:0; background:transparent;
    cursor:pointer; font-size:12px; font-weight:600; color:var(--text);
    transition:background .12s ease;
  }
  .profileItem:hover{ background:rgba(15,122,58,.08); }
  [data-theme="light"] .profileItem:hover{ background:rgba(15,122,58,.05); }
  .profileFooter{
    margin-top:6px; padding:8px 12px 10px;
    font-size:10.5px; color:var(--muted); text-align:center;
    border-top:1px solid var(--panelBorder);
  }
  .profileFooter a{ color:inherit; text-decoration:none; }
  .profileFooter a:hover{ text-decoration:underline; }

  /* ── TOAST ── */
  .toast{
    position:fixed; top:14px; left:50%; transform:translateX(-50%);
    z-index:99999; width:min(480px,calc(100vw - 20px));
    padding:10px 14px; border-radius:999px;
    border:1px solid var(--panelBorder);
    background:rgba(5,12,30,.95);
    backdrop-filter:blur(22px) saturate(1.5);
    box-shadow:0 0 0 1px rgba(59,130,246,.08),0 18px 52px rgba(0,0,0,.55);
    display:flex; align-items:center; gap:10px;
    animation:toastIn .18s ease-out;
    font-size:12px; font-weight:650; color:var(--text);
  }
  [data-theme="light"] .toast{
    background:rgba(255,255,255,.95);
    color:var(--text);
    box-shadow:0 18px 52px rgba(11,18,32,.16);
  }
  .toastDot{ width:9px; height:9px; border-radius:999px; background:rgba(232,240,254,.20); flex:0 0 auto; }
  .toastDot.success{ background:rgba(15,122,58,.90); box-shadow:0 0 0 5px rgba(15,122,58,.18); }
  .toastDot.error{ background:rgba(217,45,32,.90); box-shadow:0 0 0 5px rgba(217,45,32,.18); }
  .toastDot.info{ background:rgba(59,130,246,.90); box-shadow:0 0 0 5px rgba(59,130,246,.18); }

  /* ── OVERLAY SPINNER ── */
  .overlaySaving{
    position:fixed; inset:0; z-index:9998;
    background:rgba(6,15,36,.72); backdrop-filter:blur(8px);
    display:flex; align-items:center; justify-content:center; padding:18px;
  }
  [data-theme="light"] .overlaySaving{ background:rgba(240,244,250,.65); }
  .overlayCard{
    width:min(520px,100%);
    border:1px solid var(--panelBorder);
    background:rgba(5,12,30,.90);
    backdrop-filter:blur(28px);
    border-radius:22px; box-shadow:var(--shadow2);
    padding:14px; animation:popIn .14s ease-out;
    position:relative; overflow:hidden;
  }
  [data-theme="light"] .overlayCard{ background:rgba(255,255,255,.95); }
  .overlayCard::before{ content:""; position:absolute; top:0; left:0; right:0; height:1.5px; background:var(--topline); }
  .overlayTop{ display:flex; gap:12px; align-items:center; }
  .overlayIcon{
    width:44px; height:44px; border-radius:15px;
    border:1px solid var(--panelBorder);
    display:flex; align-items:center; justify-content:center;
    background:rgba(255,255,255,.04); flex:0 0 auto;
  }
  [data-theme="light"] .overlayIcon{ background:rgba(11,18,32,.04); }
  .overlayTitle{ font-size:13px; font-weight:750; letter-spacing:-.12px; color:var(--text); }
  .overlaySub{ margin-top:3px; font-size:11.5px; font-weight:520; color:var(--muted); line-height:1.25; }
  .overlayHint{
    margin-top:10px; display:flex; gap:8px; align-items:center;
    font-size:10.5px; font-weight:560; color:var(--muted);
    padding:8px 10px; border-radius:13px;
    border:1px dashed var(--panelBorder);
    background:rgba(255,255,255,.03);
  }
  [data-theme="light"] .overlayHint{ background:rgba(11,18,32,.03); }

  /* ── MOBILE LAYOUT ── */
  @media (max-width:1280px){
    body{ overflow:hidden; }
    .main{ padding:0; gap:0; }
    .split{ grid-template-columns:1fr !important; }
    .panel{ display:none !important; }
    .splitterWrap,.splitter{ display:none !important; }
    .mapStack{
      border:0; border-radius:0; box-shadow:none; background:transparent;
      grid-column:1 / -1 !important; width:100%;
    }
    .mapStack::before{ display:none; }
    .mapInner{ border-radius:0; }
    .mapHead{
      position:sticky; top:0; z-index:50;
      background:rgba(5,12,30,.88); backdrop-filter:blur(14px);
    }
    [data-theme="light"] .mapHead{ background:rgba(255,255,255,.90); }
    .dock{
      position:fixed; left:10px; right:10px; bottom:10px;
      z-index:6000; border-radius:22px;
      border:1px solid var(--panelBorder);
      box-shadow:var(--shadow2); overflow:hidden;
    }
    .dockResizer{ display:none !important; }
    .dockBody{ max-height:60vh; height:auto; }
    .dockBody.collapsed{ height:0; }
    table{ min-width:920px; font-size:10px; }
    th,td{ padding:7px 9px; }
  }

  /* ── FAB ── */
  .fab{
    position:fixed; right:14px; bottom:var(--fabBottom,14px); z-index:9000;
    width:54px; height:54px; border-radius:18px;
    border:1px solid var(--panelBorder);
    background:rgba(5,12,30,.90); backdrop-filter:blur(16px);
    box-shadow:0 18px 50px rgba(0,0,0,.40);
    display:none; align-items:center; justify-content:center;
    cursor:pointer; transition:transform .12s ease,box-shadow .15s ease,border-color .15s ease;
    position:relative;
  }
  .fab:hover{ transform:translateY(-2px); border-color:rgba(15,122,58,.28); box-shadow:0 24px 60px rgba(0,0,0,.45); }
  .fab:active{ transform:translateY(0); }
  .fabIcon{
    width:26px; height:26px; border-radius:11px;
    background:rgba(15,122,58,.18); border:1px solid rgba(15,122,58,.28);
    display:flex; align-items:center; justify-content:center; color:#7effc0;
  }
  .fabBadge{
    position:absolute; top:-6px; right:-6px;
    min-width:20px; height:20px; padding:0 6px; border-radius:999px;
    background:var(--primary); color:white;
    font-weight:750; font-size:11px;
    display:flex; align-items:center; justify-content:center;
    border:2px solid rgba(5,12,30,.90);
    box-shadow:0 10px 18px rgba(0,0,0,.25);
  }
  [data-theme="light"] .fab{ background:rgba(255,255,255,.92); }
  [data-theme="light"] .fabBadge{ border-color:rgba(255,255,255,.95); }
  @media (max-width:1100px){ .fab{ display:flex; } }

  /* ── MOBILE SHEET ── */
  .sheetOverlay{
    position:fixed; inset:0;
    background:rgba(6,15,36,.65);
    backdrop-filter:blur(6px);
    z-index:80000; display:flex; align-items:flex-end; justify-content:center;
    padding:10px;
  }
  .sheet{
    width:min(760px,100%); height:min(84vh,860px);
    background:rgba(5,12,30,.95);
    backdrop-filter:blur(28px) saturate(1.5);
    border:1px solid var(--panelBorder);
    border-radius:24px; box-shadow:var(--shadow2);
    overflow:hidden; display:flex; flex-direction:column;
    transform:translateY(14px); opacity:0;
    animation:sheetIn .18s ease-out forwards;
    position:relative; z-index:80001;
  }
  [data-theme="light"] .sheet{ background:rgba(255,255,255,.97); }
  .sheet::before{ content:""; position:absolute; top:0; left:0; right:0; height:1.5px; background:var(--topline); border-radius:24px 24px 0 0; }
  .grab{
    width:48px; height:4px; border-radius:999px;
    background:rgba(232,240,254,.18); align-self:center; margin:12px 0 6px;
  }
  [data-theme="light"] .grab{ background:rgba(11,18,32,.15); }
  .sheetTop{
    padding:10px 12px 12px; border-bottom:1px solid var(--panelBorder);
    display:flex; align-items:center; justify-content:space-between; gap:10px;
  }
  .sheetTitle{ font-weight:750; display:flex; align-items:center; gap:10px; font-size:12.5px; color:var(--text); }
  .tabRow{ padding:10px 12px 0; display:flex; gap:7px; flex-wrap:wrap; }
  .tab{
    border:1px solid var(--panelBorder); border-radius:999px;
    padding:7px 11px; font-size:11.5px; font-weight:620;
    background:rgba(255,255,255,.04); cursor:pointer; color:var(--muted);
    transition:all .15s ease;
  }
  [data-theme="light"] .tab{ background:rgba(255,255,255,.80); }
  .tab.active{
    border-color:rgba(15,122,58,.35);
    background:rgba(15,122,58,.12);
    color:rgba(126,255,192,.90);
  }
  [data-theme="light"] .tab.active{
    border-color:rgba(15,122,58,.28);
    background:rgba(15,122,58,.10);
    color:#0a5428;
  }

  /* ── LOCAL FILES SECTION ── */
  .localSection{
    border-color:rgba(15,122,58,.25) !important;
    background:rgba(15,122,58,.04) !important;
  }
  .localHeader{
    background:rgba(15,122,58,.08) !important;
    cursor:default !important;
  }
  [data-theme="light"] .localHeader{ background:rgba(15,122,58,.07) !important; }
`;

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function ViewMapPage() {
  const [layers, setLayers] = useState<MapLayer[]>([]);
  const [localLayers, setLocalLayers] = useState<MapLayer[]>([]);
  const localUploadRef = useRef<HTMLInputElement | null>(null);
  const layersRef = useRef<MapLayer[]>([]);
  useEffect(() => { layersRef.current = layers; }, [layers]);

  const [layerDrawOrder, setLayerDrawOrder] = useState<string[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [booting, setBooting] = useState(true);
  const [authUser, setAuthUser] = useState<{ username: string; usertype: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("auth_user");
      if (raw) setAuthUser(JSON.parse(raw));
    } catch {}
  }, []);

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

  const [panelWidth, setPanelWidth] = useState(380);
  const resizingPanelRef = useRef(false);
  const [dockHeight, setDockHeight] = useState(320);
  const resizingDockRef = useRef(false);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const [isResizingDock, setIsResizingDock] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastMoveRef = useRef<{ x: number; y: number } | null>(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1280px)");
    const on = () => setIsMobile(mq.matches);
    on(); mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  const isNarrowSidebar = !isMobile && panelWidth <= 340;

  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    GROUP_ORDER.forEach((g) => (init[g] = false));
    return init;
  });

  const toggleGroup = useCallback((key: GroupKey) => {
    setGroupOpen((prev) => {
      const nextOpen = !(prev[key] ?? true);
      const next: Record<string, boolean> = {};
      GROUP_ORDER.forEach((g) => (next[g] = false));
      next[key] = nextOpen;
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
        setPanelWidth(Math.max(300, Math.min(520, x - 12)));
      }
      if (resizingDockRef.current) {
        const vh = window.innerHeight;
        setDockHeight(Math.max(180, Math.min(Math.max(240, Math.floor(vh * 0.62)), vh - y - 12)));
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
      resizingPanelRef.current = false; resizingDockRef.current = false;
      setIsResizingPanel(false); setIsResizingDock(false);
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      document.body.style.cursor = ""; document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  useEffect(() => {
    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0]; if (!t) return;
      if (resizingPanelRef.current) { setPanelWidth(Math.max(300, Math.min(520, t.clientX - 12))); e.preventDefault(); }
      if (resizingDockRef.current) {
        const vh = window.innerHeight;
        setDockHeight(Math.max(180, Math.min(Math.max(240, Math.floor(vh * 0.62)), vh - t.clientY - 12)));
        e.preventDefault();
      }
    }
    function onTouchEnd() { resizingPanelRef.current = false; resizingDockRef.current = false; }
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
    resizingPanelRef.current = true; setIsResizingPanel(true);
    document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
  }, []);
  const beginResizeDock = useCallback(() => {
    resizingDockRef.current = true; setIsResizingDock(true);
    document.body.style.cursor = "row-resize"; document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    document.body.classList.toggle("resizingDock", isResizingDock);
    document.body.classList.toggle("resizingPanel", isResizingPanel);
    return () => { document.body.classList.remove("resizingDock", "resizingPanel"); };
  }, [isResizingDock, isResizingPanel]);

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

  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [measureActive, setMeasureActive] = useState(false);
  const [measureHover, setMeasureHover] = useState<{ lat: number; lng: number } | null>(null);
  const [measureFixedTo, setMeasureFixedTo] = useState<{ lat: number; lng: number } | null>(null);

  const requestZoomToLocation = useCallback(() => {
    setZoomTo({ type: "location", nonce: Date.now() });
  }, []);

  const requestUserLocation = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!("geolocation" in navigator)) { showToast("error", "Geolocation is not supported."); return; }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setUserLoc({ lat, lng, accuracy });
        ensureInDrawOrder(MY_LOC_LAYER_ID, true);
        setDesktopTab("selected");
        showToast("success", "Location found.");
        requestZoomToLocation();
        setLocLoading(false);
      },
      (err) => {
        const msg = err?.code === 1 ? "Location permission denied." : err?.code === 2 ? "Location unavailable." : "Location request timed out.";
        showToast("error", msg); setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, [showToast, ensureInDrawOrder, requestZoomToLocation]);

  const [tableOpen, setTableOpen] = useState(true);
  const [tableCollapsed, setTableCollapsed] = useState(true);
  const [tableLayerId, setTableLayerId] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(50);
  const [selectedFeatureIdxByLayer, setSelectedFeatureIdxByLayer] = useState<Record<string, Set<number>>>({});
  const [featureColorByLayer, setFeatureColorByLayer] = useState<Record<string, Record<number, string>>>({});
  const [tableColor, setTableColor] = useState(DEFAULT_TABLE_COLOR);
  const [colorVersion, setColorVersion] = useState(0);
  

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
          return { id: row.id, name: row.name, geom_type: row.geom_type, srid: row.srid, visible: old?.visible ?? false, geojson: old?.geojson ?? null, loading: old?.loading ?? false, error: old?.error, _geoMode: old?._geoMode };
        });
      });
      showToast("info", "Layers refreshed.");
    } catch (e: any) { showToast("error", e?.message ?? "Failed to load layers"); }
    finally { setLoadingList(false); setBooting(false); }
  }, [showToast]);

  const loadGeojson = useCallback(async (layerId: string, mode: "map" | "full" = "map") => {
    if (layerId === MY_LOC_LAYER_ID || layerId === MEASURE_LAYER_ID) return;
    abortersRef.current[layerId]?.abort();
    const ac = new AbortController();
    abortersRef.current[layerId] = ac;
    setLayers((prev) => prev.map((l) => l.id === layerId ? { ...l, loading: true, error: undefined } : l));
    try {
      const r = await fetch(`/api/layers/${layerId}/geojson?mode=${mode}`, { cache: "no-store", signal: ac.signal });
      const text = await r.text();
      const j: any = safeJsonParse(text);
      if (j?.ok === false) throw new Error(j.error || "Failed to load GeoJSON");
      const fc = coerceFeatureCollection(j);
      if (!fc) throw new Error("API did not return a GeoJSON FeatureCollection.");
      setLayers((prev) => prev.map((l) => l.id === layerId ? { ...l, geojson: fc, loading: false, _geoMode: mode } : l));
      setSelectedFeatureIdxByLayer((prev) => {
        const cur = prev[layerId] ?? new Set<number>();
        const max = Array.isArray(fc?.features) ? fc.features.length : 0;
        return { ...prev, [layerId]: clampSelected(cur, max) };
      });
      setFeatureColorByLayer((prev) => {
        const cur = prev[layerId] ?? {};
        const max = Array.isArray(fc?.features) ? fc.features.length : 0;
        const next: Record<number, string> = {};
        for (const k of Object.keys(cur)) { const idx = Number(k); if (Number.isFinite(idx) && idx >= 0 && idx < max) next[idx] = cur[idx]; }
        return { ...prev, [layerId]: next };
      });
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      const msg = e?.message ?? "Failed to load";
      setLayers((prev) => prev.map((l) => l.id === layerId ? { ...l, loading: false, error: msg } : l));
      showToast("error", msg);
    }
  }, [showToast]);

  const localLayersRef = useRef<MapLayer[]>([]);
  useEffect(() => { localLayersRef.current = localLayers; }, [localLayers]);

  const requestZoomToLayer = useCallback(async (layerId: string) => {
    if (layerId.startsWith(LOCAL_LAYER_PREFIX)) { setZoomTo({ type: "layer", layerId, nonce: Date.now() }); return; }
    const cur = layersRef.current.find((l) => l.id === layerId);
    if (!cur) return;
    if (!cur.geojson && !cur.loading) await loadGeojson(layerId, "full");
    else if (cur.geojson && cur._geoMode !== "full" && !cur.loading) await loadGeojson(layerId, "full");
    setZoomTo({ type: "layer", layerId, nonce: Date.now() });
  }, [loadGeojson]);

  const toggleLayer = useCallback(async (layerId: string, nextVisible: boolean) => {
    if (layerId.startsWith(LOCAL_LAYER_PREFIX)) {
      setLocalLayers((prev) => prev.map((l) => l.id === layerId ? { ...l, visible: nextVisible } : l));
      setLayerDrawOrder((prev) => { if (nextVisible) { const w = prev.filter((x) => x !== layerId); return [...w, layerId]; } return prev.filter((x) => x !== layerId); });
      return;
    }
    if (layerId === MY_LOC_LAYER_ID) {
      if (!nextVisible) { setUserLoc(null); removeFromDrawOrder(MY_LOC_LAYER_ID); showToast("info", "My Location removed."); } else { if (!userLoc) { showToast("info", "Click the location button first."); return; } ensureInDrawOrder(MY_LOC_LAYER_ID, true); }
      return;
    }
    if (layerId === MEASURE_LAYER_ID) {
      if (!nextVisible) { setMeasureActive(false); setMeasureHover(null); setMeasureFixedTo(null); removeFromDrawOrder(MEASURE_LAYER_ID); showToast("info", "Measure removed."); } else ensureInDrawOrder(MEASURE_LAYER_ID, true);
      return;
    }
    setLayers((prev) => prev.map((l) => l.id === layerId ? { ...l, visible: nextVisible } : l));
    setLayerDrawOrder((prev) => { if (nextVisible) { const w = prev.filter((id) => id !== layerId); return [...w, layerId]; } return prev.filter((id) => id !== layerId); });
    if (nextVisible) {
      const cur = layersRef.current.find((l) => l.id === layerId);
      if (!cur) return;
      if (!cur.geojson && !cur.loading) { await loadGeojson(layerId, "full"); return; }
      if (cur.geojson && cur._geoMode !== "full" && !cur.loading) await loadGeojson(layerId, "full");
    }
  }, [loadGeojson, ensureInDrawOrder, removeFromDrawOrder, showToast, userLoc]);

  const selectFiltered = useCallback((next: boolean, filteredIds: string[]) => {
    const ids = new Set(filteredIds);
    setLayers((prev) => prev.map((l) => ids.has(l.id) ? { ...l, visible: next } : l));
    if (next) {
      const snapshot = layersRef.current;
      snapshot.filter((l) => ids.has(l.id) && (!l.geojson || l._geoMode !== "full") && !l.loading).slice(0, 10).forEach((m) => loadGeojson(m.id, "full"));
      setLayerDrawOrder((prev) => {
        const base = prev.filter((id) => id === MY_LOC_LAYER_ID || id === MEASURE_LAYER_ID || !ids.has(id));
        const add = filteredIds.filter((id) => ids.has(id));
        const merged = [...base, ...add]; const out: string[] = [];
        for (const id of merged) { const i = out.indexOf(id); if (i !== -1) out.splice(i, 1); out.push(id); }
        return out;
      });
    } else setLayerDrawOrder((prev) => prev.filter((id) => !ids.has(id)));
  }, [loadGeojson]);

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

  useEffect(() => { if (!tableOpen) return; setTablePage(1); }, [tableOpen, tableLayerId, tableSearch]);

  const openAttributeTable = useCallback((layerId: string) => {
    if (layerId === MY_LOC_LAYER_ID || layerId === MEASURE_LAYER_ID) return;
    setTableLayerId(layerId); setTableOpen(true); setTableCollapsed(false);
    setTableColor(DEFAULT_TABLE_COLOR); setTableSearch("");
    if (!layerId.startsWith(LOCAL_LAYER_PREFIX)) {
      const cur = layersRef.current.find((l) => l.id === layerId);
      if (cur && (!cur.geojson || cur._geoMode !== "full") && !cur.loading) loadGeojson(layerId, "full");
    }
  }, [loadGeojson]);

  const activateSelectedLayer = useCallback(async (layerId: string) => {
    if (layerId === MY_LOC_LAYER_ID) { if (userLoc) requestZoomToLocation(); else showToast("info", "Click the location button first."); return; }
    if (layerId === MEASURE_LAYER_ID) return;
    await requestZoomToLayer(layerId);
    openAttributeTable(layerId);
  }, [requestZoomToLayer, openAttributeTable, userLoc, requestZoomToLocation, showToast]);

  const toggleFeatureSelection = useCallback((layerId: string, idx: number, next: boolean) => {
    setSelectedFeatureIdxByLayer((prev) => {
      const cur = new Set(prev[layerId] ?? []);
      if (next) cur.add(idx); else cur.delete(idx);
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
    setFeatureColorByLayer((prev) => { const cur = { ...(prev[layerId] ?? {}) }; cur[idx] = color; return { ...prev, [layerId]: cur }; });
  }, []);
  const clearRowColor = useCallback((layerId: string, idx: number) => {
    setFeatureColorByLayer((prev) => { const cur = { ...(prev[layerId] ?? {}) }; delete cur[idx]; return { ...prev, [layerId]: cur }; });
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
    const base = !q ? layers : layers.filter((l) => `${l.name} ${l.geom_type ?? ""} ${l.srid ?? ""}`.toLowerCase().includes(q));
    const sorted = [...base].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    const localFiltered = !q ? localLayers : localLayers.filter((l) => l.name.toLowerCase().includes(q));
    return [...localFiltered, ...sorted];
  }, [layers, localLayers, search]);

  const filteredIds = useMemo(() => filtered.map((l) => l.id), [filtered]);

  const groupedFiltered = useMemo(() => {
    const map = new Map<GroupKey, MapLayer[]>();
    for (const l of filtered) {
      if (l.id.startsWith(LOCAL_LAYER_PREFIX)) continue;
      const g = getLayerGroup(l.name) as GroupKey;
      const arr = map.get(g) ?? []; arr.push(l); map.set(g, arr);
    }
    for (const [k, arr] of map.entries()) { arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })); map.set(k, arr); }
    return GROUP_ORDER
      .filter((k) => { if (k === "A&D" && authUser?.usertype !== "admin") return false; return true; })
      .map((k) => ({ key: k, items: map.get(k) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [filtered, authUser]);

  const measureTo = measureFixedTo ?? measureHover;

  const userLocGeojson = useMemo(() => {
    if (!userLoc) return null;
    return { type: "FeatureCollection", features: [{ type: "Feature", id: "me", properties: { __fid: "me", __color: "#ef4444", __marker: "dot", label: "My Location", accuracy_m: userLoc.accuracy ?? null }, geometry: { type: "Point", coordinates: [userLoc.lng, userLoc.lat] } }] };
  }, [userLoc]);

  const measureLineGeojson = useMemo(() => {
    if (!measureActive || !userLoc || !measureTo) return null;
    return { type: "FeatureCollection", features: [{ type: "Feature", id: "measure-line", properties: { __fid: "measure-line", __color: "#ef4444", label: "Distance" }, geometry: { type: "LineString", coordinates: [[userLoc.lng, userLoc.lat], [measureTo.lng, measureTo.lat]] } }, { type: "Feature", id: "measure-to", properties: { __fid: "measure-to", __color: "#ef4444", __marker: "dot", label: "Destination" }, geometry: { type: "Point", coordinates: [measureTo.lng, measureTo.lat] } }] };
  }, [measureActive, userLoc, measureTo]);

  useEffect(() => { if (measureLineGeojson) ensureInDrawOrder(MEASURE_LAYER_ID, true); else removeFromDrawOrder(MEASURE_LAYER_ID); }, [measureLineGeojson, ensureInDrawOrder, removeFromDrawOrder]);
  useEffect(() => { if (userLocGeojson) ensureInDrawOrder(MY_LOC_LAYER_ID, true); else removeFromDrawOrder(MY_LOC_LAYER_ID); }, [userLocGeojson, ensureInDrawOrder, removeFromDrawOrder]);

  const measureDistance = useMemo(() => {
    if (!userLoc || !measureTo) return null;
    return haversineMeters({ lat: userLoc.lat, lng: userLoc.lng }, { lat: measureTo.lat, lng: measureTo.lng });
  }, [userLoc, measureTo]);

  const visibleLayers = useMemo(() => {
    const allReal = [...layers, ...localLayers];
    const byId = new Map(allReal.map((l) => [l.id, l] as const));
    const orderedReal: MapLayer[] = [];
    for (const id of layerDrawOrder) { const l = byId.get(id); if (l?.visible && l.geojson) orderedReal.push(l); }
    for (const l of allReal) { if (l.visible && l.geojson && !layerDrawOrder.includes(l.id)) orderedReal.push(l); }
    return orderedReal.map((l) => {
      const fc = l.geojson;
      const features = Array.isArray(fc?.features) ? fc.features : [];
      const selected = selectedFeatureIdxByLayer[l.id] ?? new Set<number>();
      const colorOverrides = featureColorByLayer[l.id] ?? {};
      const needsFilter = selected.size > 0, hasOverrides = Object.keys(colorOverrides).length > 0;
      if (!needsFilter && !hasOverrides) return l;
      const nextFeatures: any[] = [];
      for (let idx = 0; idx < features.length; idx++) {
        if (needsFilter && !selected.has(idx)) continue;
        const f = features[idx], c = colorOverrides[idx];
        if (c) nextFeatures.push({ ...f, properties: { ...(f?.properties ?? {}), __color: c } });
        else nextFeatures.push(f);
      }
      return { ...l, geojson: { ...fc, features: nextFeatures } };
    });
  }, [layers, layerDrawOrder, selectedFeatureIdxByLayer, featureColorByLayer]);

  const mapLayersInput = useMemo(() => {
    type Input = { id: string; name?: string; color?: string; geom_type?: string | null; geojson: any; orderNo?: number; };
    const byReal = new Map(visibleLayers.map((v) => [v.id, { id: v.id, name: v.name, color: DEFAULT_LAYER_COLOR, geom_type: v.geom_type, geojson: v.geojson } as Input]));
    const pseudo: Record<string, Input | null> = {
      [MY_LOC_LAYER_ID]: userLocGeojson ? { id: MY_LOC_LAYER_ID, name: "My Location", color: "#ef4444", geom_type: "Point", geojson: userLocGeojson } : null,
      [MEASURE_LAYER_ID]: measureLineGeojson ? { id: MEASURE_LAYER_ID, name: "Measure", color: "#ef4444", geom_type: "LineString", geojson: measureLineGeojson } : null,
    };
    const orderedIds: string[] = [];
    for (const id of layerDrawOrder) { if (byReal.has(id)) orderedIds.push(id); else if (pseudo[id]) orderedIds.push(id); }
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
    const byId = new Map([...layers, ...localLayers].map((l) => [l.id, l] as const));
    const activeIds: string[] = [];
    for (const id of layerDrawOrder) {
      if (id === MY_LOC_LAYER_ID && userLocGeojson) activeIds.push(id);
      else if (id === MEASURE_LAYER_ID && measureLineGeojson) activeIds.push(id);
      else if (byId.get(id)?.visible) activeIds.push(id);
    }
    for (const l of [...layers, ...localLayers]) if (l.visible && !activeIds.includes(l.id)) activeIds.push(l.id);
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
    const allReal = [...layers, ...localLayers];
    const byId = new Map(allReal.map((l) => [l.id, l] as const));
    const idsBottomToTop: string[] = [];
    for (const id of layerDrawOrder) {
      if (id === MY_LOC_LAYER_ID) { if (userLocGeojson) idsBottomToTop.push(id); continue; }
      if (id === MEASURE_LAYER_ID) { if (measureLineGeojson) idsBottomToTop.push(id); continue; }
      const l = byId.get(id); if (l?.visible) idsBottomToTop.push(id);
    }
    for (const l of allReal) if (l.visible && !idsBottomToTop.includes(l.id)) idsBottomToTop.push(l.id);
    if (userLocGeojson && !idsBottomToTop.includes(MY_LOC_LAYER_ID)) idsBottomToTop.push(MY_LOC_LAYER_ID);
    if (measureLineGeojson && !idsBottomToTop.includes(MEASURE_LAYER_ID)) idsBottomToTop.push(MEASURE_LAYER_ID);
    const topToBottom = [...idsBottomToTop].reverse();
    return topToBottom.map((id) => {
      if (id === MY_LOC_LAYER_ID) return { id: MY_LOC_LAYER_ID, name: "My Location", geom_type: "Point" as any, srid: null as any, visible: true, geojson: userLocGeojson, loading: locLoading, _geoMode: "map" as any } as MapLayer;
      if (id === MEASURE_LAYER_ID) return { id: MEASURE_LAYER_ID, name: "Measure", geom_type: "LineString" as any, srid: null as any, visible: true, geojson: measureLineGeojson, loading: false, _geoMode: "map" as any } as MapLayer;
      return byId.get(id) as MapLayer;
    }).filter(Boolean);
  }, [layers, layerDrawOrder, userLocGeojson, measureLineGeojson, locLoading]);

  const tableLayer = useMemo(() => [...layers, ...localLayers].find((l) => l.id === tableLayerId) ?? null, [layers, localLayers, tableLayerId]);
  const tableData = useMemo(() => {
    if (!tableOpen || !tableLayer?.geojson) return { columns: [] as string[], rows: [] as any[] };
    return extractAttributesWithIds(tableLayer.geojson);
  }, [tableOpen, tableLayer?.geojson]);

  const tableSelectedSet = useMemo(() => tableLayerId ? selectedFeatureIdxByLayer[tableLayerId] ?? new Set<number>() : new Set<number>(), [selectedFeatureIdxByLayer, tableLayerId]);
  const tableColorOverrides = useMemo(() => tableLayerId ? featureColorByLayer[tableLayerId] ?? {} as Record<number, string> : {} as Record<number, string>, [featureColorByLayer, tableLayerId]);

  const tableFilteredRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return tableData.rows.filter((r) => !q || Object.values(r).some((v) => stringifyCell(v).toLowerCase().includes(q)));
  }, [tableData.rows, tableSearch]);

  const tableFilteredCount = tableFilteredRows.length;
  const tablePageCount = useMemo(() => Math.max(1, Math.ceil(tableFilteredCount / Math.max(1, tablePageSize))), [tableFilteredCount, tablePageSize]);
  const tablePageSafe = useMemo(() => Math.min(Math.max(1, tablePage), tablePageCount), [tablePage, tablePageCount]);
  const tablePagedRows = useMemo(() => { const s = (tablePageSafe - 1) * tablePageSize; return tableFilteredRows.slice(s, s + tablePageSize); }, [tableFilteredRows, tablePageSafe, tablePageSize]);
  const tableMax = tableData.rows.length;
  const tableFilteredIdxs = useMemo(() => tableFilteredRows.map((r: any) => Number(r.__idx)).filter((n) => Number.isFinite(n)), [tableFilteredRows]);
  const allFilteredSelected = useMemo(() => { if (!tableLayerId || !tableFilteredIdxs.length) return false; const sel = tableSelectedSet; for (const idx of tableFilteredIdxs) if (!sel.has(idx)) return false; return true; }, [tableLayerId, tableFilteredIdxs, tableSelectedSet]);
  const someFilteredSelected = useMemo(() => { if (!tableLayerId || !tableFilteredIdxs.length) return false; const sel = tableSelectedSet; let any = false, anyNot = false; for (const idx of tableFilteredIdxs) { if (sel.has(idx)) any = true; else anyNot = true; if (any && anyNot) return true; } return false; }, [tableLayerId, tableFilteredIdxs, tableSelectedSet]);
  const idxsToColorNow = useMemo(() => { if (!tableLayerId) return [] as number[]; const q = tableSearch.trim(); if (!q) return Array.from(tableSelectedSet); return tableFilteredIdxs.filter((i) => tableSelectedSet.has(i)); }, [tableLayerId, tableSearch, tableFilteredIdxs, tableSelectedSet]);

const mapKey = useMemo(() => {
  const selSig = Object.entries(selectedFeatureIdxByLayer)
    .map(([id, s]) => `${id}:${Array.from(s).sort((a, b) => a - b).join(",")}`)
    .join("|");
  const locSig = userLoc ? `${userLoc.lat.toFixed(6)},${userLoc.lng.toFixed(6)}` : "none";
  const measureSig = `${measureActive ? "1" : "0"}|${measureTo ? `${measureTo.lat.toFixed(6)},${measureTo.lng.toFixed(6)}` : "none"}`;
  return `${mapLayersInput.length}-${hashString(selSig)}-${hashString(locSig)}-${hashString(measureSig)}-c${colorVersion}`;
}, [mapLayersInput.length, selectedFeatureIdxByLayer, userLoc, measureActive, measureTo, colorVersion]);

  const showOverlay = booting || loadingList;
  const overlayTitle = booting ? "Loading layers…" : loadingList ? "Refreshing layers…" : "";

  const pickAllRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (!pickAllRef.current) return; pickAllRef.current.indeterminate = !allFilteredSelected && someFilteredSelected; }, [allFilteredSelected, someFilteredSelected]);

  const [darkMode, setDarkMode] = useState(true); // ← default dark to match login
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const isDark = saved !== null ? saved === "dark" : true; // default dark
    setDarkMode(isDark);
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const [profileOpen, setProfileOpen] = useState(false);
  const profileWrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDocClick(e: MouseEvent) { if (!profileWrapRef.current) return; if (!profileWrapRef.current.contains(e.target as Node)) setProfileOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleFeatureClick = useCallback((fid: string) => {
    if (fid !== "me") return;
    if (!userLoc) { showToast("info", "Click the location button first."); return; }
    setMeasureActive(true); setMeasureFixedTo(null); setMeasureHover(null);
    showToast("info", "Move your mouse on the map, then click to set destination.");
  }, [userLoc, showToast]);

  const onMapMouseMove = useCallback((lat: number, lng: number) => {
    if (!measureActive || measureFixedTo) return;
    setMeasureHover({ lat, lng });
  }, [measureActive, measureFixedTo]);

  const onMapClick = useCallback((lat: number, lng: number) => {
    if (!measureActive || !userLoc) return;
    setMeasureFixedTo({ lat, lng });
    const d = haversineMeters({ lat: userLoc.lat, lng: userLoc.lng }, { lat, lng });
    showToast("success", `Distance: ${formatDistance(d)}`);
  }, [measureActive, userLoc, showToast]);

  const clearMeasure = useCallback(() => { setMeasureActive(false); setMeasureHover(null); setMeasureFixedTo(null); }, []);

  const uploadLocalGeojson = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".geojson") && !file.name.toLowerCase().endsWith(".json")) { showToast("error", "Only .geojson or .json files are supported."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = e.target?.result as string;
        const parsed = JSON.parse(raw);
        const fc = coerceFeatureCollection(parsed);
        if (!fc) throw new Error("Not a valid GeoJSON FeatureCollection.");
        const firstGeom = fc.features?.[0]?.geometry?.type ?? "Unknown";
        const geomType = firstGeom.includes("Point") ? "Point" : firstGeom.includes("Line") ? "LineString" : firstGeom.includes("Polygon") ? "Polygon" : firstGeom;
        const id = nextLocalId();
        const name = file.name.replace(/\.(geojson|json)$/i, "");
        const newLayer: MapLayer = { id, name: `📁 ${name}`, geom_type: geomType, srid: 4326, visible: true, geojson: fc, loading: false, _geoMode: "full" };
        setLocalLayers((prev) => [...prev, newLayer]);
        setLayerDrawOrder((prev) => { const w = prev.filter((x) => x !== id); return [...w, id]; });
        showToast("success", `Loaded "${name}" (${fc.features?.length ?? 0} features)`);
        setDesktopTab("selected");
      } catch (err: any) { showToast("error", err?.message ?? "Failed to parse GeoJSON."); }
    };
    reader.onerror = () => showToast("error", "Could not read file.");
    reader.readAsText(file);
  }, [showToast, setLayerDrawOrder]);

  const removeLocalLayer = useCallback((id: string) => {
    setLocalLayers((prev) => prev.filter((l) => l.id !== id));
    setLayerDrawOrder((prev) => prev.filter((x) => x !== id));
    setSelectedFeatureIdxByLayer((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setFeatureColorByLayer((prev) => { const n = { ...prev }; delete n[id]; return n; });
    showToast("info", "Local layer removed.");
  }, [showToast]);

  const selectedCountForLayer = useCallback((layerId: string) => selectedFeatureIdxByLayer[layerId]?.size ?? 0, [selectedFeatureIdxByLayer]);

  const addLayerFromAllList = useCallback(async (layerId: string) => {
    const cur = layersRef.current.find((l) => l.id === layerId);
    if (!cur) return;
    if (cur.visible) { openAttributeTable(layerId); setDesktopTab("selected"); return; }
    await toggleLayer(layerId, true);
    setDesktopTab("selected");
    openAttributeTable(layerId);
  }, [toggleLayer, openAttributeTable]);

  const showMobileFab = useMemo(() => {
    if (!isMobile) return false;
    if (!tableCollapsed && tableLayerId) return false;
    if (mobilePanelOpen) return false;
    return true;
  }, [isMobile, tableCollapsed, tableLayerId, mobilePanelOpen]);

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <AuthGuard>
      <div className="shell">
        <style>{STYLES}</style>
        <style>{`@keyframes spin{ to{ transform:rotate(360deg); } }`}</style>

        {/* ── AMBIENT BG ── */}
        <div className="ambientBg" aria-hidden="true">
          <div className="ambientGrid" />
          <div className="ambientScan" />
          <div className="ambientBlob" style={{ width:600, height:600, top:"-15%", left:"-8%", background:"rgba(15,122,58,.10)", animationDuration:"14s" }} />
          <div className="ambientBlob" style={{ width:500, height:500, bottom:"-10%", right:"-5%", background:"rgba(59,130,246,.09)", animationDuration:"18s", animationDelay:"-6s" }} />
          <div className="ambientBlob" style={{ width:300, height:300, top:"42%", left:"55%", background:"rgba(59,130,246,.06)", animationDuration:"12s", animationDelay:"-9s" }} />
        </div>

        {/* ── TOAST ── */}
        {toast.show ? (
          <div className="toast" role="status" aria-live="polite">
            <span className={`toastDot ${toast.type}`} />
            {toast.message}
          </div>
        ) : null}

        {/* ── OVERLAY SPINNER ── */}
        {showOverlay && overlayTitle ? (
          <OverlaySpinner title={overlayTitle} subtitle="Please wait… we're processing your request." />
        ) : null}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TOP BAR                                                           */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="topBar">
          <div className="brand">
            <div className="brandLogo" title="DENR">
              <Image src="/images/denr.png" alt="DENR Logo" width={30} height={30} style={{ objectFit:"contain" }} priority />
            </div>
            <div className="brandTxt">
              <div className="brandTitle">One Control Map</div>
              <div className="brandSub">PENRO Cagayan</div>
            </div>
          </div>

          {/* Status pills — desktop only */}
          <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, justifyContent:"center", flexWrap:"wrap" }}>
            <div className="statusPill" style={{ display: isMobile ? "none" : "inline-flex" }}>
              <span className={`statusDot ${visibleCount > 0 ? "green" : ""}`} />
              {visibleCount} layer{visibleCount !== 1 ? "s" : ""} visible
            </div>
            <div className="statusPill" style={{ display: isMobile ? "none" : "inline-flex" }}>
              <span className={`statusDot ${loadedCount > 0 ? "blue" : ""}`} />
              {loadedCount} loaded
            </div>
            {measureActive && userLoc && measureTo ? (
              <div className="statusPill" style={{ display: isMobile ? "none" : "inline-flex" }}>
                <FontAwesomeIcon icon={faLocationCrosshairs} style={{ fontSize:9, opacity:.7 }} />
                {formatDistance(measureDistance ?? NaN)}
              </div>
            ) : null}
          </div>

          <div className="topRight">
            {/* Upload GeoJSON */}
            <button
              className="btn btnGhost iconBtn"
              type="button"
              onClick={() => localUploadRef.current?.click()}
              title="Upload GeoJSON (.geojson only) — session only"
              style={{ borderRadius:13, position:"relative" }}
            >
              <FontAwesomeIcon icon={faUpload} />
              <span style={{
                position:"absolute", top:-5, right:-5,
                background:"var(--primary)", color:"#fff",
                fontSize:8, fontWeight:800, padding:"2px 4px",
                borderRadius:6, lineHeight:1, letterSpacing:.2,
                border:"1.5px solid var(--bg0)", pointerEvents:"none",
              }}>GeoJSON</span>
            </button>

            {/* Profile */}
            <div className="profileWrap" ref={profileWrapRef}>
              <button
                className="btn btnGhost iconBtn"
                type="button"
                onClick={() => setProfileOpen((v) => !v)}
                aria-expanded={profileOpen} aria-haspopup="menu"
                title="Profile" style={{ borderRadius:999, padding:0, border:0, background:"transparent", boxShadow:"none" }}
              >
                <span className="avatar">{authUser?.username?.[0]?.toUpperCase() ?? "U"}</span>
              </button>

              {profileOpen ? (
                <div className="profileMenu" role="menu">
                  {/* Profile head */}
                  <div className="profileHead" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
                    <div>
                      <div className="profileName">{authUser?.username ?? "User"}</div>
                      <div className="profileRole">{authUser?.usertype === "admin" ? "Administrator" : "Standard User"}</div>
                    </div>
                    {/* Dark / Light toggle inside menu */}
                    <button
                      className="btn btnGhost"
                      type="button"
                      onClick={() => setDarkMode((v) => !v)}
                      title={darkMode ? "Light mode" : "Dark mode"}
                      style={{ borderRadius:999, padding:"6px 10px", fontSize:13, display:"flex", alignItems:"center", gap:6, flexShrink:0 }}
                    >
                      {darkMode ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                        </svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                        </svg>
                      )}
                      <span style={{ fontSize:11, fontWeight:620, color:"var(--muted)" }}>{darkMode ? "Light" : "Dark"}</span>
                    </button>
                  </div>

                  <div className="profileDivider" />

                  {authUser?.usertype === "admin" && (
                    <button className="profileItem" role="menuitem" type="button" onClick={() => { setProfileOpen(false); window.location.href = "/admin/layers"; }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      Layer Manager
                    </button>
                  )}

                  <div className="profileDivider" />

                  <button className="profileItem" role="menuitem" type="button" onClick={() => {
                    setProfileOpen(false);
                    ["auth_user","is_logged_in","login_time","remember_me"].forEach((k) => localStorage.removeItem(k));
                    window.location.href = "/login?reason=logout";
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Log Out
                  </button>

                  <div className="profileFooter">
                    Developed by{" "}
                    <a href="https://www.facebook.com/arnold.mendoza.5283166/directory_privacy_and_legal_info" target="_blank" rel="noopener noreferrer">
                      Arnold G. Mendoza
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* MAIN                                                              */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div
          className="main"
          style={{
            ["--panelW" as any]: `${panelWidth}px`,
            ["--dockH" as any]: `${dockHeight}px`,
            ["--fabBottom" as any]: isMobile
              ? tableCollapsed ? "90px" : `calc(14px + min(60vh, ${dockHeight}px))`
              : "14px",
          } as any}
        >
          <div className="split">

            {/* ════════════════════════════════════════════════════════════ */}
            {/* LEFT PANEL                                                   */}
            {/* ════════════════════════════════════════════════════════════ */}
            <div className="panel">
              <div className="panelHead">
                <div className="headRow">
                  <div className="headLeft">
                    <div className="sectionTitle">
                      <FontAwesomeIcon icon={faLayerGroup} style={{ fontSize:12, color:"var(--primary)" }} />
                      Layers
                    </div>
                    <div className="pill" title="Total">{filtered.length}</div>
                    <div className="pill" title="Visible · Loaded">{visibleCount} · {loadedCount}</div>
                  </div>

                  <div className="toolbar">
                    {isFiltering ? (
                      <button className="btn btnPrimary iconBtn" onClick={() => selectFiltered(!hasAllVisibleFiltered, filteredIds)} disabled={filtered.length === 0} title={hasAllVisibleFiltered ? "Unselect filtered" : "Select filtered"} type="button">
                        <FontAwesomeIcon icon={hasAllVisibleFiltered ? faCheckSquare : faSquare} />
                      </button>
                    ) : null}
                    <button className="btn btnDanger iconBtn" onClick={() => isFiltering ? selectFiltered(false, filteredIds) : clearAll()} disabled={isFiltering ? !hasAnyVisibleFiltered : visibleCount === 0} title="Clear visible" type="button">
                      <FontAwesomeIcon icon={faEyeSlash} />
                    </button>
                    <button className="btn btnPrimary iconBtn" onClick={refreshList} disabled={loadingList} title="Refresh layers" type="button">
                      {loadingList ? <Ring size={15} /> : <FontAwesomeIcon icon={faRotateRight} />}
                    </button>
                  </div>
                </div>

                <div className="searchWrap">
                  <FontAwesomeIcon icon={faMagnifyingGlass} style={{ opacity:.55, flexShrink:0 }} />
                  <input className="searchInput" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search layers…" />
                  {isFiltering ? (
                    <button className="btn btnGhost miniIconBtn" onClick={() => setSearch("")} title="Clear" type="button">
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  ) : null}
                </div>

                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  <div className="segWrap" role="tablist">
                    <button className={`seg ${desktopTab === "all" ? "active" : ""}`} onClick={() => setDesktopTab("all")} type="button" role="tab" aria-selected={desktopTab === "all"}>
                      <FontAwesomeIcon icon={faBars} />All
                      <span style={{ opacity:.65 }}>({filtered.length})</span>
                    </button>
                    <button className={`seg ${desktopTab === "selected" ? "active" : ""}`} onClick={() => setDesktopTab("selected")} type="button" role="tab" aria-selected={desktopTab === "selected"}>
                      <FontAwesomeIcon icon={faEye} />Selected
                      <span style={{ opacity:.65 }}>({visibleCount + (userLoc ? 1 : 0) + (measureLineGeojson ? 1 : 0)})</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ── LIST ── */}
              <div className="listWrap">
                {desktopTab === "all" ? (
                  <>
                    {loadingList && layers.length === 0 ? (
                      Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className="miniItem" style={{ gap:10 }}>
                          <div style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
                            <Shimmer h={11} w="68%" />
                            <Shimmer h={9} w="44%" />
                          </div>
                          <Ring size={15} />
                        </div>
                      ))
                    ) : filtered.length === 0 ? (
                      <div className="pill" style={{ alignSelf:"flex-start" }}>No results</div>
                    ) : (
                      <>
                        {/* Local files */}
                        {localLayers.length > 0 ? (
                          <div className="groupBlock localSection">
                            <div className="groupHeader localHeader" style={{ pointerEvents:"none" }}>
                              <div className="groupLeft">
                                <FontAwesomeIcon icon={faFolderOpen} style={{ color:"var(--primary)", fontSize:10 }} />
                                <span className="groupTitle" style={{ color:"rgba(126,255,192,.90)" }}>Your Files</span>
                                <span className="groupBadge">{localLayers.length}</span>
                              </div>
                              <span style={{ fontSize:10, fontWeight:580, color:"var(--muted)" }}>Session only</span>
                            </div>
                            <div className="groupItems">
                              {localLayers.map((l) => {
                                const isOn = !!l.visible;
                                return (
                                  <div key={l.id} className={`miniItem ${isNarrowSidebar ? "stacked" : ""}`}>
                                    <button className="miniNameBtn" onClick={() => { if (!isOn) { setLocalLayers((p) => p.map((x) => x.id === l.id ? { ...x, visible: true } : x)); ensureInDrawOrder(l.id, true); } openAttributeTable(l.id); setDesktopTab("selected"); }} type="button">
                                      <div className="miniName">{l.name}</div>
                                      <div className="miniMeta">{l.geom_type ?? "-"} · {l.geojson?.features?.length ?? 0} features · local</div>
                                    </button>
                                    <div className="miniActions">
                                      {isOn ? <span className="badgeOn">On</span> : null}
                                      <button className="btn btnPrimary miniIconBtn" onClick={() => toggleLayer(l.id, !isOn)} title={isOn ? "Hide" : "Show"} type="button">
                                        <FontAwesomeIcon icon={isOn ? faMinus : faPlus} />
                                      </button>
                                      <button className="btn btnDanger miniIconBtn" onClick={() => removeLocalLayer(l.id)} title="Remove" type="button">
                                        <FontAwesomeIcon icon={faXmark} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        {/* Grouped layers */}
                        {groupedFiltered.map((g) => {
                          const isOpen = groupOpen[g.key] ?? false;
                          return (
                            <div key={g.key} className="groupBlock">
                              <button type="button" onClick={() => toggleGroup(g.key)} className="groupHeader">
                                <div className="groupLeft">
                                  <span className="groupTitle">{g.key === "OTHERS" ? "Others" : g.key}</span>
                                  <span className="groupBadge">{g.items.length}</span>
                                </div>
                                <span className="groupToggle"><FontAwesomeIcon icon={isOpen ? faChevronDown : faChevronRight} /></span>
                              </button>
                              {isOpen ? (
                                <div className="groupItems">
                                  {g.items.map((l) => {
                                    const isOn = !!l.visible;
                                    return (
                                      <div key={l.id} className={`miniItem ${isNarrowSidebar ? "stacked" : ""}`}>
                                        <button className="miniNameBtn" onClick={() => addLayerFromAllList(l.id)} title={isOn ? "Already selected — open table" : "Add layer"} type="button">
                                          <div className="miniName">{l.name}</div>
                                          <div className="miniMeta">{l.geom_type ?? "-"} · SRID {l.srid ?? "-"}</div>
                                        </button>
                                        <div className="miniActions">
                                          {isOn ? <span className="badgeOn">On</span> : null}
                                          <button className="btn btnPrimary miniIconBtn" onClick={() => toggleLayer(l.id, !isOn)} disabled={l.loading} title={isOn ? "Remove" : "Add"} type="button">
                                            {l.loading ? <Ring size={13} /> : <FontAwesomeIcon icon={isOn ? faMinus : faPlus} />}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </>
                ) : (
                  /* Selected tab */
                  <>
                    {selectedLayersOrdered.length === 0 ? (
                      <div style={{ padding:"12px 4px", color:"var(--muted)", fontWeight:550, fontSize:12 }}>
                        Select a layer from the <b>All</b> tab first.
                      </div>
                    ) : (
                      selectedLayersOrdered.map((l) => {
                        const orderNo = layerOrderNumberById[l.id];
                        const isPseudo = l.id === MY_LOC_LAYER_ID || l.id === MEASURE_LAYER_ID;
                        const selectedCount = !isPseudo ? selectedCountForLayer(l.id) : 0;
                        const ready = isPseudo ? true : l.visible && l.geojson;
                        return (
                          <div key={l.id} className={`miniItem ${isNarrowSidebar ? "stacked" : ""}`}>
                            <button className="miniNameBtn" onClick={() => activateSelectedLayer(l.id)} title={isPseudo ? "Pseudo layer" : "Open attribute table"} type="button" style={{ cursor: isPseudo ? "default" : "pointer" }}>
                              <div className="miniName">
                                {l.name}
                                {orderNo ? <span className="pill" style={{ padding:"3px 7px", fontSize:9, marginLeft:7 }} title="Draw order">#{orderNo}</span> : null}
                              </div>
                              <div className="miniMeta">
                                {l.geom_type ?? "-"}{l.srid ? ` · SRID ${l.srid}` : ""}{selectedCount > 0 ? ` · sel: ${selectedCount}` : ""}{!isPseudo ? (l.loading ? " · loading…" : ready ? " · ready" : "") : ""}
                              </div>
                            </button>
                            <div className="miniActions">
                              <button className="btn btnGhost miniIconBtn" onClick={() => moveLayer(l.id, "up")} title="Up" type="button"><FontAwesomeIcon icon={faArrowUp} /></button>
                              <button className="btn btnGhost miniIconBtn" onClick={() => moveLayer(l.id, "down")} title="Down" type="button"><FontAwesomeIcon icon={faArrowDown} /></button>
                              {!isPseudo ? (
                                <button className="btn btnPrimary miniIconBtn" onClick={() => loadGeojson(l.id, "map")} disabled={l.loading} title="Reload" type="button">
                                  {l.loading ? <Ring size={13} /> : <FontAwesomeIcon icon={faArrowsRotate} />}
                                </button>
                              ) : null}
                              <button className="btn btnDanger miniIconBtn" onClick={() => toggleLayer(l.id, false)} title="Remove" type="button"><FontAwesomeIcon icon={faXmark} /></button>
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

            {/* SPLITTER */}
            <div className="splitterWrap">
              <div className="splitter" onMouseDown={beginResizePanel} onTouchStart={(e) => { e.preventDefault(); beginResizePanel(); }} title="Drag to resize" role="separator" aria-orientation="vertical">
                <span className="splitterGrip" aria-hidden="true"><span className="splitterDots" /></span>
              </div>
            </div>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* RIGHT: MAP + TABLE DOCK                                      */}
            {/* ════════════════════════════════════════════════════════════ */}
            <div className="mapStack">
              {/* Map */}
              <div className="mapCard">
                <div className="mapHead">
                  <div className="mapTitle">
                    <FontAwesomeIcon icon={faGlobe} style={{ fontSize:12, color:"var(--primary)" }} />
                    Map
                    <span className="chip"><FontAwesomeIcon icon={faEye} style={{ fontSize:9 }} />{mapLayersInput.length}</span>
                    <span className="chip">{visibleCount} · {loadedCount}</span>
                    {measureActive && userLoc && measureTo ? (
                      <span className="chip"><FontAwesomeIcon icon={faLocationCrosshairs} style={{ fontSize:9 }} />{formatDistance(measureDistance ?? NaN)}</span>
                    ) : null}
                  </div>

                  <div style={{ display:"flex", gap:7, alignItems:"center", flexWrap:"wrap" }}>
                    {/* Mobile layers button */}
                    <button className="btn btnGhost iconBtn" onClick={() => { setMobileTab("all"); setMobilePanelOpen(true); }} title="Layers" type="button" style={{ display: isMobile ? "inline-flex" : "none" }}>
                      <FontAwesomeIcon icon={faLayerGroup} />
                    </button>

                    <button className={`btn ${showBasemap ? "iconActive" : "btnGhost"}`} onClick={() => setShowBasemap((v) => !v)} title={showBasemap ? "Basemap ON" : "Basemap OFF"} type="button">
                      <FontAwesomeIcon icon={faMap} style={{ fontSize:10 }} />
                      {showBasemap ? "Basemap: ON" : "Basemap: OFF"}
                    </button>

                    {measureActive ? (
                      <button className="btn btnDanger" onClick={() => { clearMeasure(); showToast("info", "Measure cleared."); }} title="Clear measure" type="button">
                        <FontAwesomeIcon icon={faXmark} />Clear
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mapArea">
                  <div className="mapInner">
                    <ResultMap
                      key={mapKey}
                      showBasemap={showBasemap}
                      backgroundColor="#060f24"
                      onFeatureFidClick={handleFeatureClick}
                      onMapMouseMove={onMapMouseMove}
                      onMapClick={onMapClick}
                      layers={mapLayersInput}
                      zoomTo={zoomTo}
                    />
                  </div>
                </div>
              </div>

              {/* Dock / Table */}
              <div className="dock">
                {!tableCollapsed && !isMobile ? (
                  <div className="dockResizer" onMouseDown={beginResizeDock} onTouchStart={(e) => { e.preventDefault(); beginResizeDock(); }} title="Drag to resize table" role="separator" aria-orientation="horizontal" />
                ) : null}

                {/* Dock top bar */}
                <div className="dockTop">
                  <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0, flex:1 }}>
                    <div className="dockTitle" title={tableLayer?.name ?? "Attribute Table"}>
                      <FontAwesomeIcon icon={faTable} style={{ fontSize:11, color:"var(--primary)" }} />
                      <span style={{ minWidth:0, overflow:"hidden", textOverflow:"ellipsis" }}>
                        {tableLayer?.name ? `${tableLayer.name} — Attribute Table` : "Attribute Table"}
                      </span>
                    </div>
                    {tableLayerId ? (
                      <span className="pill" title="Selected rows">{tableSelectedSet.size}</span>
                    ) : (
                      <span className="pill" title="Tip">Open a layer → table</span>
                    )}
                  </div>

                  <div style={{ display:"flex", gap:7, alignItems:"center", flexWrap:"wrap" }}>
                    <div className="searchWrap" style={{ width:"min(480px,42vw)" }}>
                      <FontAwesomeIcon icon={faMagnifyingGlass} style={{ opacity:.55, flexShrink:0 }} />
                      <input className="searchInput" value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} placeholder="Search table…" disabled={!tableLayerId} />
                    </div>
                    <button className="btn btnGhost iconBtn" onClick={() => setTableCollapsed((v) => !v)} title={tableCollapsed ? "Expand table" : "Collapse table"} type="button">
                      <FontAwesomeIcon icon={tableCollapsed ? faChevronDown : faSliders} />
                    </button>
                    <button className="btn btnPrimary iconBtn" onClick={() => tableLayerId && loadGeojson(tableLayerId, "full")} disabled={!tableLayerId || !!tableLayer?.loading} title="Reload" type="button">
                      {tableLayer?.loading ? <Ring size={15} /> : <FontAwesomeIcon icon={faArrowsRotate} />}
                    </button>
                    <button className="btn btnDanger iconBtn" onClick={() => { setTableLayerId(null); setTableSearch(""); setTableCollapsed(true); }} disabled={!tableLayerId} title="Close table" type="button">
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </div>
                </div>

                {/* Dock body */}
                <div className={`dockBody ${tableCollapsed ? "collapsed" : ""}`}>
                  {!tableLayerId ? (
                    <div style={{ padding:"16px 14px", color:"var(--muted)", fontWeight:520, fontSize:12 }}>
                      Open a layer's table from <b>Selected</b>.
                    </div>
                  ) : !tableLayer || tableLayer.loading || !tableLayer.geojson || tableData.rows.length === 0 ? (
                    <div style={{ padding:16, display:"flex", alignItems:"center", gap:10 }}>
                      <Ring size={17} />
                      <div style={{ fontWeight:520, color:"var(--muted)", fontSize:12 }}>Loading attributes…</div>
                    </div>
                  ) : (
                    <>
                      <div className="tableBar">
                        <div className="pill">{tableSelectedSet.size} / {tableMax}</div>
                        <div className="smallHint">
                          {tableFilteredIdxs.length} rows
                          <span style={{ marginLeft:8, opacity:.85 }}>Page {tablePageSafe} / {tablePageCount}</span>
                        </div>

                        <div className="tableBarRight">
                          <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                            <button className="btn btnGhost miniIconBtn" type="button" onClick={() => setTablePage(1)} disabled={tablePageSafe <= 1} title="First">{"<<"}</button>
                            <button className="btn btnGhost miniIconBtn" type="button" onClick={() => setTablePage((p) => Math.max(1, p - 1))} disabled={tablePageSafe <= 1} title="Prev">{"<"}</button>
                            <button className="btn btnGhost miniIconBtn" type="button" onClick={() => setTablePage((p) => Math.min(tablePageCount, p + 1))} disabled={tablePageSafe >= tablePageCount} title="Next">{">"}</button>
                            <button className="btn btnGhost miniIconBtn" type="button" onClick={() => setTablePage(tablePageCount)} disabled={tablePageSafe >= tablePageCount} title="Last">{">>"}</button>
                            <select value={tablePageSize} onChange={(e) => { setTablePageSize(Math.max(1, Number(e.target.value) || 50)); setTablePage(1); }} className="btn" style={{ padding:"7px 10px", borderRadius:13, background:"var(--inputBg)", color:"var(--text)", border:"1px solid var(--panelBorder)" }} title="Rows per page">
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                              <option value={200}>200</option>
                              <option value={500}>500</option>
                            </select>
                          </div>

                          <div className="colorPickWrap">
                            <label className="colorCircle">
                              <span className="colorSwatch" style={{ background:tableColor }} />
                              <input className="hiddenColorInput" type="color" value={tableColor} onChange={(e) => setTableColor(e.target.value)} aria-label="Pick color" />
                            </label>
                          </div>

                          <button className="btn btnPrimary miniIconBtn" onClick={() => tableLayerId && colorRows(tableLayerId, idxsToColorNow, tableColor)} disabled={!tableLayerId || idxsToColorNow.length === 0} title="Color selected" type="button"><FontAwesomeIcon icon={faPalette} /></button>
                          <button className="btn btnGhost miniIconBtn" onClick={() => tableLayerId && clearColorForRows(tableLayerId, idxsToColorNow)} disabled={!tableLayerId || idxsToColorNow.length === 0} title="Clear selected color" type="button"><FontAwesomeIcon icon={faEraser} /></button>
                          <button className="btn btnDanger miniIconBtn" onClick={() => tableLayerId && clearSelectedFeaturesInLayer(tableLayerId)} disabled={!tableLayerId || tableSelectedSet.size === 0} title="Clear selection" type="button"><FontAwesomeIcon icon={faXmark} /></button>
                          <button className="btn btnDanger miniIconBtn" onClick={() => tableLayerId && clearAllColorsForLayer(tableLayerId)} disabled={!tableLayerId || Object.keys(tableColorOverrides).length === 0} title="Clear all colors" type="button"><FontAwesomeIcon icon={faEyeSlash} /></button>
                        </div>
                      </div>

                      <div className="tableWrap">
                        <table>
                          <thead>
                            <tr>
                              <th style={{ width:50 }}>
                                <input ref={pickAllRef} className="rowChk" type="checkbox" checked={allFilteredSelected}
                                  onChange={() => {
                                    if (!tableLayerId || !tableFilteredIdxs.length) return;
                                    setSelectedFeatureIdxByLayer((prev) => {
                                      const cur = new Set(prev[tableLayerId] ?? []);
                                      if (allFilteredSelected) for (const idx of tableFilteredIdxs) cur.delete(idx);
                                      else for (const idx of tableFilteredIdxs) cur.add(idx);
                                      return { ...prev, [tableLayerId]: cur };
                                    });
                                  }}
                                  aria-label="Select all filtered rows"
                                />
                              </th>
                              <th style={{ width:140 }}>Row</th>
                              {tableData.columns.filter((c) => c !== "__fid").map((c) => <th key={c}>{c}</th>)}
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
                                    <input className="rowChk" type="checkbox" checked={checked} onChange={(e) => tableLayerId && toggleFeatureSelection(tableLayerId, idx, e.target.checked)} aria-label={`Select row ${idx + 1}`} />
                                  </td>
                                  <td className="rowActionsCell">
                                    <div className="rowActions">
                                      <div className="colorPickWrap">
                                        <label className="colorCircle" style={{ width:28, height:28 }}>
                                          <span className="colorSwatch" style={{ background:rowColor }} />
                                          <input className="hiddenColorInput" type="color" value={override ?? DEFAULT_LAYER_COLOR} onChange={(e) => { if (!tableLayerId || !Number.isFinite(idx)) return; colorRow(tableLayerId, idx, e.target.value); }} aria-label="Set row color" />
                                        </label>
                                      </div>
                                      <button className="btn btnGhost miniIconBtn" onClick={() => tableLayerId && Number.isFinite(idx) && clearRowColor(tableLayerId, idx)} disabled={!override} title="Clear row color" type="button">
                                        <FontAwesomeIcon icon={faEraser} />
                                      </button>
                                    </div>
                                  </td>
                                  {tableData.columns.filter((c) => c !== "__fid").map((c) => {
                                    const v = stringifyCell(r?.[c]);
                                    const cls = c === "__fid" ? "col-fid" : c === "__idx" ? "col-idx" : "";
                                    return <td key={c} className={cls}>{v}</td>;
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

          {/* MOBILE FAB */}
          {showMobileFab ? (
            <button className="fab" onClick={() => { setMobileTab("all"); setMobilePanelOpen(true); }} aria-label="Open layers" type="button" style={{ position:"fixed" }}>
              <span className="fabIcon"><FontAwesomeIcon icon={faLayerGroup} /></span>
              <span className="fabBadge" title="Visible layers">{visibleCount}</span>
            </button>
          ) : null}

          {/* MOBILE SHEET */}
          {mobilePanelOpen ? (
            <div className="sheetOverlay" onClick={() => setMobilePanelOpen(false)} role="dialog" aria-modal="true">
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <div className="grab" />
                <div className="sheetTop">
                  <div className="sheetTitle">
                    <FontAwesomeIcon icon={faLayerGroup} style={{ color:"var(--primary)" }} />
                    Layers
                    <span className="pill" style={{ padding:"4px 8px" }}>{visibleCount}</span>
                  </div>
                  <button className="btn btnGhost iconBtn" onClick={() => setMobilePanelOpen(false)} title="Close" type="button">
                    <FontAwesomeIcon icon={faChevronDown} />
                  </button>
                </div>

                <div className="tabRow">
                  <button className={`tab ${mobileTab === "all" ? "active" : ""}`} onClick={() => setMobileTab("all")} type="button">All ({filtered.length})</button>
                  <button className={`tab ${mobileTab === "selected" ? "active" : ""}`} onClick={() => setMobileTab("selected")} type="button">Selected ({visibleCount})</button>
                </div>

                <div className="panelHead" style={{ borderRadius:0 }}>
                  <div style={{ display:"flex", gap:9, alignItems:"center" }}>
                    <div className="searchWrap" style={{ flex:1 }}>
                      <FontAwesomeIcon icon={faMagnifyingGlass} style={{ opacity:.55 }} />
                      <input className="searchInput" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search layers…" />
                      {isFiltering ? <button className="btn btnGhost miniIconBtn" onClick={() => setSearch("")} title="Clear" type="button"><FontAwesomeIcon icon={faXmark} /></button> : null}
                    </div>
                    <button className="btn btnPrimary iconBtn" onClick={refreshList} disabled={loadingList} title="Refresh" type="button">
                      {loadingList ? <Ring size={15} /> : <FontAwesomeIcon icon={faRotateRight} />}
                    </button>
                    <button className="btn btnDanger iconBtn" onClick={() => isFiltering ? selectFiltered(false, filteredIds) : clearAll()} disabled={isFiltering ? !hasAnyVisibleFiltered : visibleCount === 0} title="Clear" type="button">
                      <FontAwesomeIcon icon={faEyeSlash} />
                    </button>
                  </div>
                  {isFiltering ? (
                    <button className="btn btnPrimary" onClick={() => selectFiltered(!hasAllVisibleFiltered, filteredIds)} disabled={filtered.length === 0} title="Select filtered" type="button">
                      <FontAwesomeIcon icon={hasAllVisibleFiltered ? faCheckSquare : faSquare} />Select filtered
                    </button>
                  ) : null}
                </div>

                <div style={{ padding:"10px 12px", minHeight:0, overflow:"auto", flex:1 }}>
                  {mobileTab === "all" ? (
                    <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                      {filtered.length === 0 ? (
                        <div className="pill" style={{ alignSelf:"flex-start" }}>No results</div>
                      ) : (
                        groupedFiltered.map((g) => {
                          const isOpen = groupOpen[g.key] ?? false;
                          return (
                            <div key={g.key} className="groupBlock">
                              <button type="button" onClick={() => toggleGroup(g.key)} className="groupHeader">
                                <div className="groupLeft">
                                  <span className="groupTitle">{g.key === "OTHERS" ? "Others" : g.key}</span>
                                  <span className="groupBadge">{g.items.length}</span>
                                </div>
                                <span className="groupToggle"><FontAwesomeIcon icon={isOpen ? faChevronDown : faChevronRight} /></span>
                              </button>
                              {isOpen ? (
                                <div className="groupItems">
                                  {g.items.map((l) => {
                                    const isOn = !!l.visible;
                                    return (
                                      <div key={l.id} className="miniItem">
                                        <button className="miniNameBtn" onClick={() => addLayerFromAllList(l.id)} type="button">
                                          <div className="miniName">{l.name}</div>
                                          <div className="miniMeta">{l.geom_type ?? "-"} · SRID {l.srid ?? "-"}</div>
                                        </button>
                                        <div className="miniActions">
                                          {isOn ? <span className="badgeOn">On</span> : null}
                                          <button className="btn btnPrimary miniIconBtn" onClick={() => toggleLayer(l.id, !isOn)} disabled={l.loading} title={isOn ? "Remove" : "Add"} type="button">
                                            {l.loading ? <Ring size={13} /> : <FontAwesomeIcon icon={isOn ? faMinus : faPlus} />}
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
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {selectedLayersOrdered.length === 0 ? (
                        <div style={{ color:"var(--muted)", fontWeight:530, fontSize:12 }}>
                          No selected layers. Go to <b>All</b> and tap a layer name.
                        </div>
                      ) : (
                        selectedLayersOrdered.map((l) => (
                          <div key={l.id} className="miniItem">
                            <button className="miniNameBtn" onClick={() => activateSelectedLayer(l.id)} type="button" style={{ cursor: l.id === MY_LOC_LAYER_ID || l.id === MEASURE_LAYER_ID ? "default" : "pointer" }}>
                              <div className="miniName">{l.name}</div>
                              <div className="miniMeta">Order #{layerOrderNumberById[l.id] ?? "-"} · {l.geom_type ?? "-"}</div>
                            </button>
                            <div className="miniActions">
                              <button className="btn btnGhost miniIconBtn" onClick={() => moveLayer(l.id, "top")} title="Top" type="button"><FontAwesomeIcon icon={faAnglesUp} /></button>
                              <button className="btn btnGhost miniIconBtn" onClick={() => moveLayer(l.id, "up")} title="Up" type="button"><FontAwesomeIcon icon={faArrowUp} /></button>
                              <button className="btn btnGhost miniIconBtn" onClick={() => moveLayer(l.id, "down")} title="Down" type="button"><FontAwesomeIcon icon={faArrowDown} /></button>
                              <button className="btn btnGhost miniIconBtn" onClick={() => moveLayer(l.id, "bottom")} title="Bottom" type="button"><FontAwesomeIcon icon={faAnglesDown} /></button>
                              {l.id !== MY_LOC_LAYER_ID && l.id !== MEASURE_LAYER_ID ? (
                                <button className="btn btnGhost miniIconBtn" onClick={() => openAttributeTable(l.id)} title="Table" type="button"><FontAwesomeIcon icon={faTable} /></button>
                              ) : null}
                              <button className="btn btnDanger miniIconBtn" onClick={() => toggleLayer(l.id, false)} title="Remove" type="button"><FontAwesomeIcon icon={faXmark} /></button>
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

        {/* Hidden file input */}
        <input
          ref={localUploadRef}
          type="file"
          accept=".geojson,.json"
          style={{ display:"none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadLocalGeojson(file);
            e.target.value = "";
          }}
        />
      </div>
    </AuthGuard>
  );
}
