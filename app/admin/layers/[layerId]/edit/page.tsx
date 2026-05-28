"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import AutoLogout from "@/app/components/AutoLogout";

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Row = {
  __fid: string;
  __idx: number;
  props: Record<string, any>;
};

type ToastState =
  | { show: false }
  | { show: true; type: "success" | "error" | "info"; message: string };

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function safeJsonParse(text: string) {
  try { return JSON.parse(text); } catch { return { ok: false, error: text }; }
}

function stringifyCell(v: any) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

function parseValueSmart(raw: string): any {
  const s = raw.trim();
  if (s === "") return "";
  if (s === "null") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (!Number.isNaN(Number(s)) && /^[+-]?\d+(\.\d+)?$/.test(s)) return Number(s);
  if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
    try { return JSON.parse(s); } catch {}
  }
  return raw;
}

function isValidFieldName(name: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

const DELETE_PROP = "__DELETE_PROP__";

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
    --warn:#b54708;

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
    --tableTh:rgba(5,12,30,.92);
    --tableHover:rgba(15,122,58,.06);
    --tableSelected:rgba(15,122,58,.10);
    --tableSelectedBorder:rgba(15,122,58,.18);
    --cellEdited:rgba(15,122,58,.08);
    --cellEditedBorder:rgba(15,122,58,.30);
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
    --tableTh:rgba(255,255,255,.98);
    --tableHover:rgba(15,122,58,.04);
    --tableSelected:rgba(15,122,58,.08);
    --tableSelectedBorder:rgba(15,122,58,.14);
    --cellEdited:rgba(15,122,58,.06);
    --cellEditedBorder:rgba(15,122,58,.22);
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
  @keyframes toastIn{ from{transform:translateX(-50%) translateY(-10px);opacity:0} to{transform:translateX(-50%) translateY(0);opacity:1} }
  @keyframes popIn{ from{transform:translateY(6px) scale(.98);opacity:0} to{transform:translateY(0) scale(1);opacity:1} }
  @keyframes menuIn{ to{transform:translateY(0);opacity:1} }
  @keyframes sheetIn{ to{transform:translateY(0);opacity:1} }
  @keyframes scanAnim{ 0%{top:-2px;opacity:0} 5%{opacity:1} 95%{opacity:.6} 100%{top:100%;opacity:0} }
  @keyframes gridDrift{ 0%{background-position:0 0} 100%{background-position:52px 52px} }
  @keyframes blobPulse{ 0%{transform:scale(1)} 100%{transform:scale(1.06) translate(18px,-18px)} }

  /* ── AMBIENT BG ── */
  .ambientBg{ position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
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

  /* ── SHELL ── */
  .shell{ height:100vh; width:100%; display:flex; flex-direction:column; position:relative; overflow:hidden; }

  /* ── TOP BAR ── */
  .topBar{
     min-height:58px; padding:0 14px;
    border-bottom:1px solid var(--panelBorder);
    background:rgba(5,12,30,.82);
    backdrop-filter:blur(20px) saturate(1.5);
  display:flex; align-items:center; gap:8px;
  position:relative; z-index:70000; flex-shrink:0;
  overflow:hidden;
  }
  [data-theme="light"] .topBar{ background:rgba(255,255,255,.82); }
  .topBar::before{
    content:""; position:absolute; top:0; left:0; right:0; height:2px;
    background:var(--topline);
  }
  .brandLogo{
    width:36px; height:36px; border-radius:11px; flex:0 0 auto; overflow:hidden;
    border:1px solid rgba(232,240,254,.12);
    background:rgba(255,255,255,.96);
    box-shadow:0 0 0 3px rgba(59,130,246,.10),0 8px 20px rgba(0,0,0,.25);
    display:flex; align-items:center; justify-content:center;
  }
  [data-theme="light"] .brandLogo{ border-color:rgba(11,18,32,.10); box-shadow:0 0 0 3px rgba(59,130,246,.08),0 6px 14px rgba(11,18,32,.10); }

 .topMeta{
  display:flex; flex-direction:column; gap:1px; line-height:1.18; min-width:0; overflow:hidden;
}
.topTitle{ font-size:12.5px; font-weight:850; letter-spacing:-.2px; color:var(--text); white-space:nowrap; display:flex; align-items:center; gap:5px; }
.topSub{ font-size:10px; font-weight:600; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px; }
  .topDivider{ width:1px; height:28px; background:var(--panelBorder); flex:0 0 auto; }

  /* ── BUTTONS ── */
  .btn{
    border:1px solid var(--panelBorder);
    background:rgba(255,255,255,.05);
    color:var(--text);
    font-weight:650; cursor:pointer;
    display:inline-flex; align-items:center; gap:7px;
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
  .btn[disabled]{ opacity:.42; cursor:not-allowed; transform:none !important; box-shadow:none !important; }

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
  .btnDark{
    border-color:rgba(232,240,254,.18);
    background:rgba(232,240,254,.08);
    color:var(--text);
  }
  .btnDark:hover{
    border-color:rgba(232,240,254,.28);
    background:rgba(232,240,254,.14);
    box-shadow:0 0 16px rgba(232,240,254,.08),0 10px 26px rgba(0,0,0,.28);
  }
  [data-theme="light"] .btnDark{
    border-color:rgba(11,18,32,.18);
    background:rgba(11,18,32,.07);
    color:rgba(11,18,32,.88);
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
  [data-theme="light"] .btnDanger{ border-color:rgba(217,45,32,.22); background:rgba(217,45,32,.06); color:rgba(180,35,24,.90); }
  .btnWarn{
    border-color:rgba(181,71,8,.28);
    background:rgba(181,71,8,.08);
    color:rgba(255,185,100,.90);
  }
  .btnWarn:hover{
    border-color:rgba(181,71,8,.45);
    background:rgba(181,71,8,.14);
  }
  [data-theme="light"] .btnWarn{ border-color:rgba(181,71,8,.22); background:rgba(181,71,8,.06); color:rgba(181,71,8,.90); }
  .btnGhost{ background:rgba(255,255,255,.04); }
  [data-theme="light"] .btnGhost{ background:rgba(255,255,255,.90); }
  .iconBtn{ width:36px; height:36px; padding:0; justify-content:center; border-radius:12px; flex:0 0 auto; }
  .miniIconBtn{ width:30px; height:30px; padding:0; justify-content:center; border-radius:999px; flex:0 0 auto; }

  /* ── PILLS / CHIPS ── */
  .pill{
    font-size:10.5px; font-weight:620; color:var(--muted);
    border:1px solid var(--panelBorder);
    padding:5px 9px; border-radius:999px;
    background:rgba(255,255,255,.04);
    display:inline-flex; align-items:center; gap:6px; white-space:nowrap;
    flex:0 0 auto;
  }
  [data-theme="light"] .pill{ background:rgba(255,255,255,.80); color:rgba(11,18,32,.72); }
  .pillWarn{
    border-color:rgba(181,71,8,.28);
    background:rgba(181,71,8,.10);
    color:rgba(255,185,100,.90);
  }
  [data-theme="light"] .pillWarn{ background:rgba(181,71,8,.08); color:rgba(181,71,8,.90); }
  .pillSuccess{
    border-color:rgba(15,122,58,.28);
    background:rgba(15,122,58,.10);
    color:rgba(126,255,192,.90);
  }
  [data-theme="light"] .pillSuccess{ background:rgba(15,122,58,.08); color:#0a5428; }

  /* ── MAIN LAYOUT ── */
  .main{
    flex:1; min-height:0;
    display:flex; flex-direction:column;
    gap:0; padding:10px;
    position:relative; z-index:1;
  }

  /* ── GLASS PANEL (table card) ── */
  .tableCard{
    flex:1; min-height:0;
    border:1px solid var(--panelBorder);
    border-radius:22px;
    background:var(--panel);
    backdrop-filter:blur(28px) saturate(1.4);
    box-shadow:var(--shadow);
    display:flex; flex-direction:column;
    overflow:hidden;
    position:relative;
  }
  .tableCard::before{
    content:""; position:absolute; top:0; left:0; right:0; height:1.5px;
    background:var(--topline); border-radius:22px 22px 0 0;
  }

  /* ── TOOLBAR BAR ── */
  .toolBar{
    padding:9px 12px;
    border-bottom:1px solid var(--panelBorder);
    display:flex; gap:8px; align-items:center; flex-wrap:wrap;
    background:rgba(5,12,30,.60);
    backdrop-filter:blur(12px);
    flex-shrink:0;
  }
  [data-theme="light"] .toolBar{ background:rgba(255,255,255,.82); }
  .toolBarRight{ margin-left:auto; display:flex; gap:6px; align-items:center; flex-wrap:wrap; }

  /* ── PAGER BAR ── */
  .pagerBar{
    padding:7px 12px;
    border-bottom:1px solid var(--panelBorder);
    display:flex; gap:8px; align-items:center; flex-wrap:wrap;
    background:rgba(5,12,30,.45);
    backdrop-filter:blur(8px);
    flex-shrink:0;
  }
  [data-theme="light"] .pagerBar{ background:rgba(255,255,255,.70); }
  .pagerRight{ margin-left:auto; display:flex; gap:6px; align-items:center; }

  /* ── INPUTS / SELECTS ── */
  .fieldInput, .fieldSelect{
    padding:8px 10px; border-radius:12px;
    border:1px solid var(--inputBorder);
    background:var(--inputBg); outline:none;
    font-weight:600; font-size:11.5px; color:var(--text);
    transition:border-color .15s ease,box-shadow .15s ease;
  }
  .fieldInput:focus, .fieldSelect:focus{
    border-color:rgba(15,122,58,.45);
    box-shadow:0 0 0 4px rgba(15,122,58,.10);
  }
  .fieldInput::placeholder{ color:var(--muted2); }
  .fieldSelect option{ background:var(--bg0); color:var(--text); }

  /* search bar */
  .searchWrap{
    display:flex; align-items:center; gap:8px; padding:0 10px;
    height:36px; border-radius:12px; border:1px solid var(--inputBorder);
    background:var(--inputBg);
    transition:border-color .15s ease,box-shadow .15s ease;
    flex:1; min-width:160px;
  }
  .searchWrap:focus-within{
    border-color:rgba(15,122,58,.45);
    box-shadow:0 0 0 4px rgba(15,122,58,.10);
  }
  .searchInput{
    width:100%; border:0; outline:0; background:transparent;
    font-weight:560; color:var(--text); font-size:11.5px;
  }
  .searchInput::placeholder{ color:var(--muted2); }

  /* ── POPOVER (col options) ── */
  .popoverWrap{ position:relative; }
  .popover{
    position:absolute; top:calc(100% + 8px); right:0;
    min-width:220px; z-index:90000;
    border-radius:16px; border:1px solid var(--panelBorder);
    background:rgba(5,12,30,.96);
    backdrop-filter:blur(24px) saturate(1.5);
    box-shadow:var(--shadow2); overflow:hidden;
    animation:popIn .12s ease-out;
  }
  [data-theme="light"] .popover{ background:rgba(255,255,255,.97); }
  .popover::before{ content:""; position:absolute; top:0; left:0; right:0; height:1.5px; background:var(--topline); }
  .popItem{
    width:100%; border:0; background:transparent;
    padding:10px 12px; display:flex; align-items:center; gap:9px;
    cursor:pointer; font-weight:650; font-size:11.5px; color:var(--text);
    transition:background .12s ease; text-align:left;
  }
  .popItem:hover{ background:rgba(255,255,255,.06); }
  [data-theme="light"] .popItem:hover{ background:rgba(11,18,32,.04); }
  .popItem.red{ color:rgba(252,165,165,.95); }
  [data-theme="light"] .popItem.red{ color:#dc2626; }
  .popItemSub{ margin-left:auto; font-size:10.5px; color:var(--muted); font-weight:550; }
  .popSep{ height:1px; background:var(--panelBorder); }

  /* ── HELPER TEXT ── */
  .helper{
    font-size:10.5px; font-weight:580; color:var(--muted);
    display:inline-flex; align-items:center; gap:7px;
    padding:5px 9px; border-radius:999px;
    border:1px dashed var(--panelBorder);
    background:rgba(255,255,255,.03);
    white-space:nowrap;
  }
  [data-theme="light"] .helper{ background:rgba(255,255,255,.70); }

  /* ── ERROR BAR ── */
  .errorBar{
    padding:9px 12px; margin:0 12px 8px;
    border-radius:14px;
    background:rgba(217,45,32,.10);
    border:1px solid rgba(217,45,32,.20);
    color:rgba(255,150,140,.90);
    font-size:11.5px; font-weight:650;
    display:flex; gap:8px; align-items:center;
    flex-shrink:0; margin-top:8px;
  }
  [data-theme="light"] .errorBar{ color:#7a0b1a; background:rgba(217,45,32,.07); border-color:rgba(217,45,32,.14); }

  /* ── TABLE ── */
  .tableWrap{
    flex:1; min-height:0; overflow:auto;
    -webkit-overflow-scrolling:touch;
    overscroll-behavior:contain;
  }
  table{
    border-collapse:separate; border-spacing:0;
    width:max(100%, 1100px); font-size:11.5px;
  }
  th,td{
    border-bottom:1px solid var(--panelBorder);
    padding:9px 10px; text-align:left; vertical-align:middle;
    white-space:nowrap;
  }
  th{
    position:sticky; top:0; z-index:3;
    background:var(--tableTh);
    border-bottom:1px solid var(--panelBorder2);
    font-weight:750; color:var(--text);
    backdrop-filter:blur(8px);
  }
  td{ font-weight:480; color:var(--text); }
  [data-theme="light"] td{ color:rgba(11,18,32,.82); }
  tbody tr:hover td{ background:var(--tableHover); }
  tr.rowSelected td{
    background:var(--tableSelected) !important;
    border-bottom-color:var(--tableSelectedBorder);
  }
  tr.rowSelected td:first-child{ box-shadow:inset 3px 0 0 rgba(15,122,58,.70); }
  .rowChk{ width:15px; height:15px; cursor:pointer; accent-color:var(--primary); }
  td.cellEdited{
    outline:2px solid var(--cellEditedBorder);
    outline-offset:-2px;
    background:var(--cellEdited) !important;
  }
  .cellEditor{
    width:100%; min-width:140px;
    padding:7px 9px; border-radius:10px;
    border:1px solid rgba(15,122,58,.35);
    background:rgba(5,12,30,.80);
    outline:none; font-size:11.5px; font-weight:600;
    color:var(--text);
    box-shadow:0 0 0 4px rgba(15,122,58,.12);
  }
  [data-theme="light"] .cellEditor{
    background:rgba(255,255,255,.98);
    color:#0b1220;
    border-color:rgba(15,122,58,.30);
  }

  /* ── TOAST ── */
  .toast{
    position:fixed; top:14px; left:50%; transform:translateX(-50%);
    z-index:99999; width:min(440px,calc(100vw - 20px));
    padding:10px 14px; border-radius:999px;
    border:1px solid var(--panelBorder);
    background:rgba(5,12,30,.95);
    backdrop-filter:blur(22px) saturate(1.5);
    box-shadow:0 0 0 1px rgba(59,130,246,.08),0 18px 52px rgba(0,0,0,.55);
    display:flex; align-items:center; gap:10px;
    animation:toastIn .18s ease-out;
    font-size:12px; font-weight:650; color:var(--text);
  }
  [data-theme="light"] .toast{ background:rgba(255,255,255,.95); color:var(--text); box-shadow:0 18px 52px rgba(11,18,32,.16); }
  .toastDot{ width:9px; height:9px; border-radius:999px; flex:0 0 auto; }
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

  /* ── AVATAR ── */
  .avatar{
    width:32px; height:32px; border-radius:999px;
    display:flex; align-items:center; justify-content:center;
    border:1px solid rgba(232,240,254,.14);
    background:linear-gradient(135deg,rgba(15,122,58,.25),rgba(59,130,246,.15));
    color:#7effc0; font-size:11px; font-weight:850;
    box-shadow:0 0 0 3px rgba(15,122,58,.12);
    flex:0 0 auto;
  }
  [data-theme="light"] .avatar{
    border-color:rgba(11,18,32,.12);
    background:linear-gradient(135deg,rgba(15,122,58,.12),rgba(59,130,246,.08));
    color:var(--primary);
    box-shadow:0 0 0 3px rgba(15,122,58,.08);
  }

  /* ── SPINNER ── */
  .spinRing{
    display:inline-block; border-radius:999px;
    border:2px solid rgba(232,240,254,.12);
    border-top-color:var(--blue);
    animation:spin .75s linear infinite;
    flex:0 0 auto;
  }
  [data-theme="light"] .spinRing{ border-color:rgba(11,18,32,.10); border-top-color:var(--blue); }

  /* ── MOBILE BOTTOM DOCK ── */
  .mobileDock{
  display:none;
  position:fixed; left:10px; right:10px; bottom:10px; z-index:60000;
    padding:10px 12px;
    border:1px solid var(--panelBorder);
    border-radius:18px;
    background:rgba(5,12,30,.92);
    backdrop-filter:blur(18px);
    box-shadow:var(--shadow2);
    align-items:center; justify-content:space-between; gap:10px;
  }
  [data-theme="light"] .mobileDock{ background:rgba(255,255,255,.94); }
  .dockLeft{ display:flex; align-items:center; gap:10px; min-width:0; }
  .dockMeta{ display:flex; flex-direction:column; gap:1px; min-width:0; }
  .dockLine{ font-size:11px; font-weight:750; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:56vw; }
  .dockSub{ font-size:10px; font-weight:600; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:56vw; }
  .dockRight{ display:flex; gap:7px; align-items:center; }

  /* ── MOBILE SHEET ── */
  .sheetOverlay{
    display:none;
    position:fixed; inset:0; z-index:80000;
    background:rgba(6,15,36,.65);
    backdrop-filter:blur(6px);
    align-items:flex-end; justify-content:center; padding:10px;
  }
  .sheet{
    width:min(760px,100%);
    max-height:88vh;
    background:rgba(5,12,30,.95);
    backdrop-filter:blur(28px) saturate(1.5);
    border:1px solid var(--panelBorder);
    border-radius:22px; box-shadow:var(--shadow2);
    overflow:hidden; display:flex; flex-direction:column;
    transform:translateY(14px); opacity:0;
    animation:sheetIn .18s ease-out forwards;
    position:relative;
  }
  [data-theme="light"] .sheet{ background:rgba(255,255,255,.97); }
  .sheet::before{ content:""; position:absolute; top:0; left:0; right:0; height:1.5px; background:var(--topline); border-radius:22px 22px 0 0; }
  .grab{
    width:48px; height:4px; border-radius:999px;
    background:rgba(232,240,254,.18); align-self:center; margin:12px 0 6px;
  }
  [data-theme="light"] .grab{ background:rgba(11,18,32,.15); }
  .sheetHead{
    padding:10px 12px 10px; border-bottom:1px solid var(--panelBorder);
    display:flex; align-items:center; justify-content:space-between; gap:10px;
  }
  .sheetTitle{ font-weight:750; font-size:12.5px; color:var(--text); display:flex; align-items:center; gap:8px; }
  .sheetBody{ padding:12px; overflow-y:auto; display:flex; flex-direction:column; gap:10px; }
  .sheetRow{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .sheetRow .fieldInput,
  .sheetRow .fieldSelect{ flex:1 1 0; min-width:0; }

  /* ── RESPONSIVE ── */
@media (max-width:1024px){
  .desktopBars{ display:none !important; }
  .mobileDock{ display:flex !important; }
  .main{ padding-bottom:90px; }
  .tableWrap{ padding-bottom:10px; }
  .sheetOverlay.open{ display:flex !important; }
  .topBar{ flex-wrap:nowrap; min-height:auto; padding:8px 10px; gap:6px; overflow:hidden; }
  .topDivider{ display:none; }
}
  .sheetOverlay.open{ display:flex !important; }
`;

// ─── ICONS ───────────────────────────────────────────────────────────────────
function Icon({ name, size = 15 }: {
  name:
    | "back" | "search" | "filter" | "clear" | "reload" | "save" | "delete"
    | "apply" | "first" | "prev" | "next" | "last" | "info" | "lock"
    | "chevDown" | "sliders" | "undo" | "colDelete" | "caretDown" | "edit"
    | "moon" | "sun" | "check" | "x";
  size?: number;
}) {
  const p = { stroke:"currentColor", strokeWidth:2, strokeLinecap:"round" as const, strokeLinejoin:"round" as const };
  const s = { width:size, height:size, viewBox:"0 0 24 24", fill:"none" };
  switch (name) {
    case "back": return <svg {...s}><path {...p} d="M15 18l-6-6 6-6"/><path {...p} d="M9 12h12"/></svg>;
    case "search": return <svg {...s}><path {...p} d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"/><path {...p} d="M16 16l5 5"/></svg>;
    case "filter": return <svg {...s}><path {...p} d="M4 5h16"/><path {...p} d="M7 12h10"/><path {...p} d="M10 19h4"/></svg>;
    case "clear": return <svg {...s}><path {...p} d="M6 6l12 12"/><path {...p} d="M18 6L6 18"/></svg>;
    case "reload": return <svg {...s}><path {...p} d="M21 12a9 9 0 1 1-3-6.7"/><path {...p} d="M21 3v6h-6"/></svg>;
    case "save": return <svg {...s}><path {...p} d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path {...p} d="M17 21v-8H7v8"/><path {...p} d="M7 3v5h8"/></svg>;
    case "delete": return <svg {...s}><path {...p} d="M3 6h18"/><path {...p} d="M8 6V4h8v2"/><path {...p} d="M19 6l-1 14H6L5 6"/><path {...p} d="M10 11v6"/><path {...p} d="M14 11v6"/></svg>;
    case "apply": return <svg {...s}><path {...p} d="M20 6L9 17l-5-5"/></svg>;
    case "first": return <svg {...s}><path {...p} d="M7 6v12"/><path {...p} d="M18 18l-6-6 6-6"/></svg>;
    case "prev": return <svg {...s}><path {...p} d="M15 18l-6-6 6-6"/></svg>;
    case "next": return <svg {...s}><path {...p} d="M9 6l6 6-6 6"/></svg>;
    case "last": return <svg {...s}><path {...p} d="M17 6v12"/><path {...p} d="M6 6l6 6-6 6"/></svg>;
    case "info": return <svg {...s}><path {...p} d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"/><path {...p} d="M12 10v6"/><path {...p} d="M12 7h.01"/></svg>;
    case "lock": return <svg {...s}><path {...p} d="M7 11V8a5 5 0 0 1 10 0v3"/><path {...p} d="M6 11h12v10H6V11Z"/><path {...p} d="M12 15v3"/></svg>;
    case "chevDown": return <svg {...s}><path {...p} d="M6 9l6 6 6-6"/></svg>;
    case "sliders": return <svg {...s}><path {...p} d="M4 21v-7"/><path {...p} d="M4 10V3"/><path {...p} d="M12 21v-9"/><path {...p} d="M12 8V3"/><path {...p} d="M20 21v-5"/><path {...p} d="M20 12V3"/><path {...p} d="M2 14h4"/><path {...p} d="M10 8h4"/><path {...p} d="M18 16h4"/></svg>;
    case "undo": return <svg {...s}><path {...p} d="M9 14l-4-4 4-4"/><path {...p} d="M5 10h9a6 6 0 1 1 0 12h-1"/></svg>;
    case "colDelete": return <svg {...s}><path {...p} d="M4 5h16"/><path {...p} d="M10 5V3h4v2"/><path {...p} d="M8 8h8"/><path {...p} d="M19 6l-1 14H6L5 6"/><path {...p} d="M10 11v6"/><path {...p} d="M14 11v6"/></svg>;
    case "caretDown": return <svg {...s}><path {...p} d="M6 9l6 6 6-6"/></svg>;
    case "edit": return <svg {...s}><path {...p} d="M12 20h9"/><path {...p} d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z"/></svg>;
    case "moon": return <svg {...s}><path {...p} d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
    case "sun": return <svg {...s}><circle {...p} cx="12" cy="12" r="4"/><path {...p} d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>;
    case "check": return <svg {...s}><path {...p} d="M20 6L9 17l-5-5"/></svg>;
    case "x": return <svg {...s}><path {...p} d="M6 6l12 12"/><path {...p} d="M18 6L6 18"/></svg>;
    default: return null;
  }
}

function SpinRing({ size = 15 }: { size?: number }) {
  return <span className="spinRing" style={{ width: size, height: size }} aria-hidden="true" />;
}

function OverlaySpinner({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="overlaySaving" role="alert" aria-live="assertive" aria-busy="true">
      <div className="overlayCard">
        <div className="overlayTop">
          <div className="overlayIcon"><SpinRing size={18} /></div>
          <div>
            <div className="overlayTitle">{title}</div>
            {subtitle ? <div className="overlaySub">{subtitle}</div> : null}
          </div>
        </div>
        <div className="overlayHint">
          <Icon name="lock" size={13} />
          Actions are temporarily disabled to prevent duplicate updates.
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function LayerEditPage() {
  const params = useParams<{ layerId: string }>();
  const layerId = params.layerId;
  const sp = useSearchParams();
  const nameFromUrl = sp.get("name") || "";
  const router = useRouter();

  const [layerName, setLayerName] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState<ToastState>({ show: false });

  const [darkMode, setDarkMode] = useState(true);
  const [authName, setAuthName] = useState("Guest");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  // table tools
  const [q, setQ] = useState("");
  const [selectedSet, setSelectedSet] = useState<Record<string, boolean>>({});
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

  // pending (staged) edits
  const [pending, setPending] = useState<Record<string, Record<string, any>>>({});

  // col popover
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  const pickAllRef = useRef<HTMLInputElement | null>(null);

  const uiLocked = saving || loading || deleting;
  const pendingCount = useMemo(() => {
    let n = 0;
    for (const fid of Object.keys(pending)) n += Object.keys(pending[fid] || {}).length;
    return n;
  }, [pending]);
  const selectedCount = useMemo(() => Object.values(selectedSet).filter(Boolean).length, [selectedSet]);
  const hasUnsaved = pendingCount > 0 || !!editing;

  // ── theme ──
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const isDark = saved !== null ? saved === "dark" : true;
    setDarkMode(isDark);
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  // ── auth ──
  useEffect(() => {
    try {
      const loggedIn = localStorage.getItem("is_logged_in") === "1";
      const userRaw = localStorage.getItem("auth_user");
      const loginTime = Number(localStorage.getItem("login_time") || "0");
      if (!loggedIn || !userRaw || !loginTime) { window.location.href = "/login"; return; }
      try {
        const u = JSON.parse(userRaw);
        setAuthName(u?.name || u?.full_name || u?.username || "User");
      } catch {}
      const last = Number(localStorage.getItem("last_activity") || "0");
      if (!last) localStorage.setItem("last_activity", String(Date.now()));
    } catch { window.location.href = "/login"; }
  }, []);

  useEffect(() => { if (nameFromUrl) setLayerName(nameFromUrl); }, [layerId, nameFromUrl]);

  // ── beforeunload ──
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (uiLocked) return;
      if (pendingCount > 0 || !!editing) { e.preventDefault(); e.returnValue = ""; return ""; }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [pendingCount, editing, uiLocked]);

  // ── col menu click-outside ──
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!colMenuOpen) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (colMenuBtnRef.current?.contains(t)) return;
      const menu = document.getElementById("colMenuPopover");
      if (menu?.contains(t)) return;
      setColMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [colMenuOpen]);

  // ── derived ──
  const columns = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r.props || {})) if (k !== "__fid") set.add(k);
    for (const fid of Object.keys(pending))
      for (const k of Object.keys(pending[fid] || {}))
        if (k !== "__fid") set.add(k);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, pending]);

  const filteredRows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      if (r.__fid.toLowerCase().includes(qq)) return true;
      for (const [k, v] of Object.entries(r.props || {}))
        if (`${k}:${stringifyCell(v)}`.toLowerCase().includes(qq)) return true;
      const p = pending[r.__fid];
      if (p) for (const [k, v] of Object.entries(p)) {
        const disp = v === DELETE_PROP ? "" : v;
        if (`${k}:${stringifyCell(disp)}`.toLowerCase().includes(qq)) return true;
      }
      return false;
    });
  }, [rows, q, pending]);

  const filteredFids = useMemo(() => filteredRows.map((r) => r.__fid), [filteredRows]);
  const pageCount = useMemo(() => Math.max(1, Math.ceil(filteredRows.length / Math.max(1, pageSize))), [filteredRows.length, pageSize]);
  const pageSafe = useMemo(() => Math.min(Math.max(1, page), pageCount), [page, pageCount]);
  const pagedRows = useMemo(() => { const s = (pageSafe - 1) * pageSize; return filteredRows.slice(s, s + pageSize); }, [filteredRows, pageSafe, pageSize]);

  useEffect(() => setPage(1), [q, pageSize, layerId]);

  const allFilteredSelected = useMemo(() => {
    if (!filteredFids.length) return false;
    for (const fid of filteredFids) if (!selectedSet[fid]) return false;
    return true;
  }, [filteredFids, selectedSet]);

  const someFilteredSelected = useMemo(() => {
    if (!filteredFids.length) return false;
    let any = false, anyNot = false;
    for (const fid of filteredFids) {
      if (selectedSet[fid]) any = true; else anyNot = true;
      if (any && anyNot) return true;
    }
    return false;
  }, [filteredFids, selectedSet]);

  useEffect(() => {
    if (!pickAllRef.current) return;
    pickAllRef.current.indeterminate = !allFilteredSelected && someFilteredSelected;
  }, [allFilteredSelected, someFilteredSelected]);

  function showToast(type: "success" | "error" | "info", message: string) {
    setToast({ show: true, type, message });
    window.setTimeout(() => setToast({ show: false }), 2500);
  }

  function getDisplayValue(fid: string, base: any, col: string) {
    if (pending?.[fid] && Object.prototype.hasOwnProperty.call(pending[fid], col)) {
      const v = pending[fid][col];
      return v === DELETE_PROP ? "" : v;
    }
    return base;
  }

  function getTargets(): string[] {
    if (applyScope === "all") return rows.map((r) => r.__fid);
    if (applyScope === "filtered") return filteredFids;
    return Object.entries(selectedSet).filter(([, v]) => v).map(([k]) => k);
  }

  function scopeText(scope: "selected" | "filtered" | "all") {
    if (scope === "selected") return "Selected rows";
    if (scope === "filtered") return "Filtered rows";
    return "All rows";
  }

  const deleteTargets = useMemo(() => getTargets(), [applyScope, rows, filteredFids, selectedSet]);

  // ── navigation ──
  function goBack() {
    if (uiLocked) return;
    if (editing) commitEdit();
    if (hasUnsaved && !window.confirm("You have unsaved changes. Continue?")) return;
    window.close();
    window.setTimeout(() => { if (window.history.length > 1) router.back(); else router.push("/viewmap"); }, 50);
  }

  // ── cell editing ──
  function startEdit(fid: string, col: string, current: any) {
    if (uiLocked) return;
    setEditing({ fid, col });
    setEditingValue(stringifyCell(current));
  }
  function cancelEdit() { setEditing(null); setEditingValue(""); }
  function commitEdit() {
    if (uiLocked || !editing) return;
    const { fid, col } = editing;
    const nextVal = parseValueSmart(editingValue);
    setPending((prev) => {
      const next = { ...prev };
      const byFid = { ...(next[fid] || {}) };
      byFid[col] = nextVal;
      next[fid] = byFid;
      return next;
    });
    setEditing(null); setEditingValue("");
  }
  function onEditorKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  }

  // ── selection ──
  function toggleRow(fid: string, next?: boolean) {
    if (uiLocked) return;
    setSelectedSet((prev) => ({ ...prev, [fid]: typeof next === "boolean" ? next : !prev[fid] }));
  }
  function selectFiltered() {
    if (uiLocked) return;
    const next: Record<string, boolean> = {};
    for (const fid of filteredFids) next[fid] = true;
    setSelectedSet(next);
  }
  function clearSelectionOnly() { if (uiLocked) return; setSelectedSet({}); }

  // ── load ──
  async function load() {
    if (saving || deleting) return;
    setLoading(true); setErr("");
    try {
      const r = await fetch(`/api/layers/${layerId}/geojson?mode=full`, { cache: "no-store" });
      const j: any = safeJsonParse(await r.text());
      if (j?.ok === false) throw new Error(j.error || "Failed to load GeoJSON");
      const fc = j?.geojson ?? j?.data ?? j?.result ?? j?.fc ?? j;
      if (!fc || fc.type !== "FeatureCollection") throw new Error("API did not return a GeoJSON FeatureCollection");
      const apiName = (j?.layer?.name ?? "").trim();
      if (apiName) setLayerName(apiName);
      const feats: any[] = Array.isArray(fc.features) ? fc.features : [];
      const rws: Row[] = feats.map((f, idx) => {
        const fid = String(f?.properties?.__fid ?? f?.id ?? "");
        if (!fid) throw new Error("Missing __fid in GeoJSON feature properties.");
        return { __fid: fid, __idx: idx, props: { ...(f?.properties ?? {}) } };
      });
      setRows(rws); setSelectedSet({}); setPending({}); setEditing(null); setEditingValue("");
      showToast("info", "Layer loaded.");
    } catch (e: any) { setErr(e?.message ?? "Failed"); showToast("error", e?.message ?? "Failed"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [layerId]);

  // ── field calculator ──
  function applyStage() {
    if (uiLocked) return;
    const targets = new Set(getTargets());
    if (targets.size === 0) { showToast("info", "No target rows."); return; }

    if (calcMode === "update") {
      const field = activeCol.trim();
      if (!field) { showToast("info", "Choose a column."); return; }
      if (!isValidFieldName(field)) { showToast("error", "Invalid column name."); return; }
      const val = parseValueSmart(newValue);
      setPending((prev) => {
        const next = { ...prev };
        for (const fid of targets) { const b = { ...(next[fid] || {}) }; b[field] = val; next[fid] = b; }
        return next;
      });
      showToast("success", `Staged ${targets.size} row(s).`);
      return;
    }

    const field = newCol.trim();
    if (!field) { showToast("info", "Enter a new column name."); return; }
    if (!isValidFieldName(field)) { showToast("error", "Invalid column name."); return; }
    const val = parseValueSmart(newValue);
    setPending((prev) => {
      const next = { ...prev };
      for (const fid of targets) { const b = { ...(next[fid] || {}) }; b[field] = val; next[fid] = b; }
      return next;
    });
    showToast("success", `Staged ${targets.size} row(s).`);
  }

  function getTargetsForColumnDelete(): string[] {
    if (applyScope === "all") return rows.map((r) => r.__fid);
    if (applyScope === "filtered") return filteredFids;
    const sel = Object.entries(selectedSet).filter(([, v]) => v).map(([fid]) => fid);
    if (sel.length > 0) return sel;
    if (filteredFids.length > 0) return filteredFids;
    return rows.map((r) => r.__fid);
  }

  function stageDeleteColumn(field: string) {
    if (uiLocked) return;
    const f = field.trim();
    if (!f) { showToast("info", "Choose a column first."); return; }
    if (!isValidFieldName(f)) { showToast("error", "Invalid column name."); return; }
    const targets = getTargetsForColumnDelete();
    if (!targets.length) { showToast("info", "No rows to apply this on."); return; }
    if (!window.confirm(`Delete column "${f}" from ${targets.length} row(s)?`)) return;
    setPending((prev) => {
      const next = { ...prev };
      for (const fid of targets) { const b = { ...(next[fid] || {}) }; b[f] = DELETE_PROP; next[fid] = b; }
      return next;
    });
    showToast("success", `Staged delete of "${f}" for ${targets.length} row(s).`);
  }

  function discardEdits() {
    if (uiLocked || !pendingCount) return;
    if (!confirm("Discard ALL unsaved edits?")) return;
    setPending({}); cancelEdit(); showToast("info", "Edits discarded.");
  }

  // ── save ──
  async function saveChanges() {
    if (uiLocked || pendingCount === 0) return;
    const deletes = new Map<string, string[]>();
    const fieldMap = new Map<string, Map<string, { value: any; fids: string[] }>>();
    for (const [fid, changes] of Object.entries(pending)) {
      for (const [field, value] of Object.entries(changes || {})) {
        if (value === DELETE_PROP) {
          if (!deletes.has(field)) deletes.set(field, []);
          deletes.get(field)!.push(fid); continue;
        }
        const valueKey = JSON.stringify(value);
        if (!fieldMap.has(field)) fieldMap.set(field, new Map());
        const vmap = fieldMap.get(field)!;
        if (!vmap.has(valueKey)) vmap.set(valueKey, { value, fids: [] });
        vmap.get(valueKey)!.fids.push(fid);
      }
    }
    setSaving(true); setErr("");
    try {
      for (const [field, fids] of deletes.entries()) {
        const r = await fetch(`/api/layers/${layerId}/features/bulk`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fids, remove_properties: [field] }),
        });
        const j: any = safeJsonParse(await r.text());
        if (!j?.ok) throw new Error(j?.error || `Delete column failed for ${field}`);
      }
      for (const [field, vmap] of fieldMap.entries()) {
        for (const { value, fids } of vmap.values()) {
          const r = await fetch(`/api/layers/${layerId}/features/bulk`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fids, properties: { [field]: value } }),
          });
          const j: any = safeJsonParse(await r.text());
          if (!j?.ok) throw new Error(j?.error || `Save failed for ${field}`);
        }
      }
      await load(); showToast("success", "Updates saved."); setMobilePanelOpen(false);
    } catch (e: any) { setErr(e?.message ?? "Save failed"); showToast("error", e?.message ?? "Save failed"); }
    finally { setSaving(false); }
  }

  // ── delete rows ──
  async function deleteFids(fids: string[], scopeLabel?: string) {
    if (uiLocked || !fids.length) return;
    if (!confirm(`Delete ${fids.length} record(s)${scopeLabel ? ` (${scopeLabel})` : ""}?\nThis cannot be undone.`)) return;
    setDeleting(true); setErr("");
    try {
      const r = await fetch(`/api/layers/${layerId}/features/bulk`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fids, confirm: true }),
      });
      const j: any = safeJsonParse(await r.text());
      if (!j?.ok) throw new Error(j?.error || "Delete failed");
      setSelectedSet((prev) => { const n = { ...prev }; for (const fid of fids) delete n[fid]; return n; });
      setPending((prev) => { const n = { ...prev }; for (const fid of fids) delete n[fid]; return n; });
      await load(); showToast("success", `Deleted ${fids.length} record(s).`);
    } catch (e: any) { setErr(e?.message ?? "Delete failed"); showToast("error", e?.message ?? "Delete failed"); }
    finally { setDeleting(false); }
  }

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <>
      <AutoLogout />
      <div className="shell" aria-disabled={uiLocked ? "true" : "false"}>
        <style>{STYLES}</style>
        <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>

        {/* ── AMBIENT BG ── */}
        <div className="ambientBg" aria-hidden="true">
          <div className="ambientGrid" />
          <div className="ambientScan" />
          <div className="ambientBlob" style={{ width:600, height:600, top:"-15%", left:"-8%", background:"rgba(15,122,58,.10)", animationDuration:"14s" }} />
          <div className="ambientBlob" style={{ width:500, height:500, bottom:"-10%", right:"-5%", background:"rgba(59,130,246,.09)", animationDuration:"18s", animationDelay:"-6s" }} />
        </div>

        {/* ── TOAST ── */}
        {toast.show ? (
          <div className="toast" role="status" aria-live="polite">
            <span className={`toastDot ${toast.type}`} />
            {toast.message}
          </div>
        ) : null}

        {/* ── OVERLAY SPINNER ── */}
        {(saving || deleting) ? (
          <OverlaySpinner
            title={saving ? "Saving your updates…" : "Deleting records…"}
            subtitle={saving ? "Please don't close this page." : "Removing selected records and refreshing."}
          />
        ) : null}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TOP BAR                                                           */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="topBar">
          <button className="btn btnGhost iconBtn" onClick={goBack} disabled={uiLocked} title="Back" aria-label="Go back">
            <Icon name="back" size={14} />
          </button>

          <div className="topDivider" />

          <div className="topMeta">
            <div className="topTitle">
              <Icon name="edit" size={12} />
              {" "}Attribute Editor
            </div>
            <div className="topSub" title={layerName || layerId}>
              {layerName || layerId}
            </div>
          </div>

          <div className="topDivider" />

          {/* Status pills */}
          <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
            <div className="pill">
              {loading ? <SpinRing size={11} /> : null}
              {loading ? "Loading…" : `${rows.length} rows`}
            </div>
            {selectedCount > 0 ? (
              <div className="pill pillSuccess">
                <Icon name="check" size={10} />
                {selectedCount} selected
              </div>
            ) : null}
            {pendingCount > 0 ? (
              <div className="pill pillWarn">
                <Icon name="edit" size={10} />
                {pendingCount} unsaved
              </div>
            ) : null}
          </div>

          {/* Spacer */}
          <div style={{ flex:1 }} />

          {/* Top-right controls */}
          <div style={{ display:"flex", gap:7, alignItems:"center" }}>
            {/* Theme toggle */}
            <button
              className="btn btnGhost iconBtn"
              onClick={() => setDarkMode(v => !v)}
              title={darkMode ? "Light mode" : "Dark mode"}
              type="button"
            >
              <Icon name={darkMode ? "sun" : "moon"} size={13} />
            </button>

            {/* Reload */}
            <button className="btn btnGhost iconBtn" onClick={load} disabled={uiLocked} title="Reload" type="button">
              {loading ? <SpinRing size={14} /> : <Icon name="reload" size={14} />}
            </button>

            {/* Avatar */}
            <span className="avatar" title={authName}>{authName?.[0]?.toUpperCase() ?? "U"}</span>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* MAIN                                                              */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="main">
          <div className="tableCard">

            {/* ── DESKTOP TOOLBAR ── */}
            <div className="toolBar desktopBars">
              {/* Scope */}
              <select className="fieldSelect" value={applyScope} onChange={(e) => setApplyScope(e.target.value as any)} disabled={uiLocked}>
                <option value="selected">Apply: Selected rows</option>
                <option value="filtered">Apply: Filtered rows</option>
                <option value="all">Apply: All rows</option>
              </select>

              {/* Mode */}
              <select className="fieldSelect" value={calcMode} onChange={(e) => setCalcMode(e.target.value as any)} disabled={uiLocked}>
                <option value="update">Update column</option>
                <option value="add">Add new column</option>
              </select>

              {/* Column selector or new col name */}
              {calcMode === "update" ? (
                <div className="popoverWrap">
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <select
                      className="fieldSelect"
                      value={activeCol}
                      onChange={(e) => setActiveCol(e.target.value)}
                      style={{ minWidth:200 }}
                      disabled={uiLocked}
                    >
                      <option value="">Choose column…</option>
                      {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button
                      ref={colMenuBtnRef}
                      className="btn btnGhost iconBtn"
                      type="button"
                      disabled={uiLocked}
                      onClick={() => setColMenuOpen(v => !v)}
                      title="Column options"
                      aria-label="Column options"
                    >
                      <Icon name="caretDown" size={13} />
                    </button>
                  </div>
                  {colMenuOpen ? (
                    <div id="colMenuPopover" className="popover" role="menu">
                      <button
                        className="popItem red"
                        type="button"
                        disabled={uiLocked || !activeCol}
                        onClick={() => { setColMenuOpen(false); stageDeleteColumn(activeCol); }}
                      >
                        <Icon name="colDelete" size={13} />
                        Delete this column
                        <span className="popItemSub">{activeCol || "select a column"}</span>
                      </button>
                      <div className="popSep" />
                      <button
                        className="popItem"
                        type="button"
                        onClick={() => { setColMenuOpen(false); showToast("info", "Select a column then use ▾ to delete it."); }}
                      >
                        <Icon name="info" size={13} />
                        How it works
                        <span className="popItemSub">quick help</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <input
                  className="fieldInput"
                  value={newCol}
                  onChange={(e) => setNewCol(e.target.value)}
                  placeholder="New column name (e.g. PO_NAME)"
                  style={{ minWidth:220 }}
                  disabled={uiLocked}
                />
              )}

              {/* Value */}
              <input
                className="fieldInput"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={calcMode === "update" ? "New value…" : "Default value for new column…"}
                style={{ flex:1, minWidth:200 }}
                disabled={uiLocked}
              />

              <div className="toolBarRight">
                {/* Apply */}
                <button
                  className="btn btnPrimary"
                  type="button"
                  onClick={applyStage}
                  disabled={uiLocked || (applyScope === "selected" && selectedCount === 0) || (calcMode === "update" && !activeCol) || (calcMode === "add" && !newCol.trim())}
                  title="Stage changes"
                >
                  <Icon name="apply" size={13} />
                  Stage
                </button>

                {/* Delete rows */}
                <button
                  className="btn btnDanger"
                  type="button"
                  onClick={() => deleteFids(deleteTargets, scopeText(applyScope))}
                  disabled={uiLocked || deleteTargets.length === 0}
                  title={`Delete ${scopeText(applyScope)}`}
                >
                  <Icon name="delete" size={13} />
                  Delete
                </button>

                {/* Discard */}
                <button
                  className="btn btnWarn iconBtn"
                  type="button"
                  onClick={discardEdits}
                  disabled={uiLocked || pendingCount === 0}
                  title="Discard all staged edits"
                >
                  <Icon name="undo" size={13} />
                </button>

                {/* Save */}
                <button
                  className="btn btnDark"
                  type="button"
                  onClick={saveChanges}
                  disabled={uiLocked || pendingCount === 0}
                  title="Save all staged edits"
                >
                  {saving ? <SpinRing size={13} /> : <Icon name="save" size={13} />}
                  Save
                </button>
              </div>
            </div>

            {/* ── PAGER / SEARCH BAR ── */}
            <div className="pagerBar desktopBars">
              {/* Search */}
              <div className="searchWrap" style={{ maxWidth:340 }}>
                <Icon name="search" size={13} />
                <input
                  className="searchInput"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search table…"
                  disabled={uiLocked}
                />
                {q ? (
                  <button className="btn btnGhost miniIconBtn" onClick={() => setQ("")} type="button" title="Clear">
                    <Icon name="x" size={11} />
                  </button>
                ) : null}
              </div>

              {/* Info pills */}
              <div className="pill">
                <Icon name="filter" size={10} />
                {filteredRows.length} rows · Page {pageSafe}/{pageCount}
              </div>

              <div className="helper">
                <Icon name="info" size={12} />
                Double-click cell to edit
              </div>

              {/* Select filtered */}
              <button
                className="btn btnGhost iconBtn"
                type="button"
                onClick={selectFiltered}
                disabled={uiLocked || filteredFids.length === 0}
                title="Select all filtered rows"
              >
                <Icon name="filter" size={13} />
              </button>

              {/* Clear selection */}
              <button
                className="btn btnGhost iconBtn"
                type="button"
                onClick={clearSelectionOnly}
                disabled={uiLocked || selectedCount === 0}
                title="Clear selection"
              >
                <Icon name="clear" size={13} />
              </button>

              <div className="pagerRight">
                <button className="btn btnGhost iconBtn" onClick={() => setPage(1)} disabled={uiLocked || pageSafe <= 1} title="First page" type="button"><Icon name="first" size={13} /></button>
                <button className="btn btnGhost iconBtn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={uiLocked || pageSafe <= 1} title="Prev page" type="button"><Icon name="prev" size={13} /></button>
                <button className="btn btnGhost iconBtn" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={uiLocked || pageSafe >= pageCount} title="Next page" type="button"><Icon name="next" size={13} /></button>
                <button className="btn btnGhost iconBtn" onClick={() => setPage(pageCount)} disabled={uiLocked || pageSafe >= pageCount} title="Last page" type="button"><Icon name="last" size={13} /></button>

                <select
                  className="fieldSelect"
                  value={pageSize}
                  onChange={(e) => setPageSize(Math.max(1, Number(e.target.value) || 100))}
                  disabled={uiLocked}
                  title="Rows per page"
                >
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                  <option value={200}>200 / page</option>
                  <option value={500}>500 / page</option>
                </select>
              </div>
            </div>

            {/* ── ERROR ── */}
            {err ? (
              <div className="errorBar">
                <Icon name="x" size={13} />
                {err}
              </div>
            ) : null}

            {/* ── TABLE ── */}
            <div
              className="tableWrap"
              onClick={() => editing && !uiLocked && cancelEdit()}
              style={{ pointerEvents: uiLocked ? "none" : "auto" }}
            >
              <table>
                <thead>
                  <tr>
                    <th style={{ width:50 }}>
                      <input
                        ref={pickAllRef}
                        className="rowChk"
                        type="checkbox"
                        checked={allFilteredSelected}
                        disabled={uiLocked}
                        onChange={() => {
                          if (uiLocked || !filteredFids.length) return;
                          if (allFilteredSelected) {
                            setSelectedSet((prev) => { const n = { ...prev }; for (const fid of filteredFids) delete n[fid]; return n; });
                          } else {
                            setSelectedSet((prev) => { const n = { ...prev }; for (const fid of filteredFids) n[fid] = true; return n; });
                          }
                        }}
                        aria-label="Select all filtered rows"
                      />
                    </th>
                    <th style={{ minWidth:200 }}>__fid</th>
                    {columns.map((c) => <th key={c}>{c}</th>)}
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
                        <td style={{ fontWeight:650, fontFamily:"ui-monospace,monospace", fontSize:11 }}>{r.__fid}</td>
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
                              onDoubleClick={(e) => { if (uiLocked) return; e.stopPropagation(); startEdit(r.__fid, c, displayVal); }}
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
                      <td colSpan={2 + columns.length} style={{ padding:16, opacity:.65, fontWeight:600 }}>
                        {loading ? "Loading…" : "No rows found."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* MOBILE BOTTOM DOCK                                                */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="mobileDock" aria-hidden={false}>
          <div className="dockLeft">
            <button
              className="btn btnGhost iconBtn"
              type="button"
              onClick={() => setMobilePanelOpen(v => !v)}
              disabled={uiLocked}
              aria-label="Open controls"
            >
              <Icon name="sliders" size={14} />
            </button>
            <div className="dockMeta">
              <div className="dockLine">
                Page {pageSafe}/{pageCount} · {filteredRows.length} rows
              </div>
              <div className="dockSub">
                Sel: {selectedCount} · Unsaved: {pendingCount}
              </div>
            </div>
          </div>
          <div className="dockRight">
            <button className="btn btnDanger iconBtn" type="button" onClick={() => deleteFids(deleteTargets, scopeText(applyScope))} disabled={uiLocked || deleteTargets.length === 0} title="Delete">
              <Icon name="delete" size={13} />
            </button>
            <button className="btn btnWarn iconBtn" type="button" onClick={discardEdits} disabled={uiLocked || pendingCount === 0} title="Discard">
              <Icon name="undo" size={13} />
            </button>
            <button className="btn btnDark iconBtn" type="button" onClick={saveChanges} disabled={uiLocked || pendingCount === 0} title="Save">
              {saving ? <SpinRing size={13} /> : <Icon name="save" size={13} />}
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* MOBILE SHEET                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div
          className={`sheetOverlay ${mobilePanelOpen ? "open" : ""}`}
          onClick={() => setMobilePanelOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <div className="sheetHead">
              <div className="sheetTitle">
                <Icon name="sliders" size={13} />
                Controls
              </div>
              <button className="btn btnGhost iconBtn" onClick={() => setMobilePanelOpen(false)} type="button" aria-label="Close">
                <Icon name="chevDown" size={13} />
              </button>
            </div>
            <div className="sheetBody">

              {/* Search */}
              <div className="searchWrap">
                <Icon name="search" size={13} />
                <input className="searchInput" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search table…" disabled={uiLocked} />
                {q ? <button className="btn btnGhost miniIconBtn" onClick={() => setQ("")} type="button"><Icon name="x" size={11} /></button> : null}
              </div>

              {/* Pager */}
              <div className="sheetRow">
                <button className="btn btnGhost iconBtn" onClick={() => setPage(1)} disabled={uiLocked || pageSafe <= 1} type="button"><Icon name="first" size={13} /></button>
                <button className="btn btnGhost iconBtn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={uiLocked || pageSafe <= 1} type="button"><Icon name="prev" size={13} /></button>
                <span className="pill" style={{ flex:1, justifyContent:"center" }}>Page {pageSafe}/{pageCount}</span>
                <button className="btn btnGhost iconBtn" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={uiLocked || pageSafe >= pageCount} type="button"><Icon name="next" size={13} /></button>
                <button className="btn btnGhost iconBtn" onClick={() => setPage(pageCount)} disabled={uiLocked || pageSafe >= pageCount} type="button"><Icon name="last" size={13} /></button>
                <select className="fieldSelect" value={pageSize} onChange={(e) => setPageSize(Math.max(1, Number(e.target.value) || 100))} disabled={uiLocked}>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
              </div>

              {/* Selection */}
              <div className="sheetRow">
                <button className="btn btnPrimary" style={{ flex:1 }} onClick={selectFiltered} disabled={uiLocked || filteredFids.length === 0} type="button">
                  <Icon name="filter" size={13} />
                  Select filtered
                </button>
                <button className="btn btnGhost" style={{ flex:1 }} onClick={clearSelectionOnly} disabled={uiLocked || selectedCount === 0} type="button">
                  <Icon name="clear" size={13} />
                  Clear sel.
                </button>
                <button className="btn btnGhost iconBtn" onClick={load} disabled={uiLocked} type="button" title="Reload">
                  <Icon name="reload" size={13} />
                </button>
              </div>

              {/* Scope + Mode */}
              <div className="sheetRow">
                <select className="fieldSelect" style={{ flex:1 }} value={applyScope} onChange={(e) => setApplyScope(e.target.value as any)} disabled={uiLocked}>
                  <option value="selected">Apply: Selected</option>
                  <option value="filtered">Apply: Filtered</option>
                  <option value="all">Apply: All</option>
                </select>
                <select className="fieldSelect" style={{ flex:1 }} value={calcMode} onChange={(e) => setCalcMode(e.target.value as any)} disabled={uiLocked}>
                  <option value="update">Update column</option>
                  <option value="add">Add column</option>
                </select>
              </div>

              {/* Column / new col name */}
              <div className="sheetRow">
                {calcMode === "update" ? (
                  <>
                    <select className="fieldSelect" style={{ flex:1 }} value={activeCol} onChange={(e) => setActiveCol(e.target.value)} disabled={uiLocked}>
                      <option value="">Choose column…</option>
                      {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button
                      className="btn btnWarn iconBtn"
                      type="button"
                      disabled={uiLocked || !activeCol}
                      onClick={() => stageDeleteColumn(activeCol)}
                      title="Delete selected column"
                    >
                      <Icon name="colDelete" size={13} />
                    </button>
                  </>
                ) : (
                  <input className="fieldInput" style={{ flex:1 }} value={newCol} onChange={(e) => setNewCol(e.target.value)} placeholder="New column name" disabled={uiLocked} />
                )}
              </div>

              {/* Value */}
              <input
                className="fieldInput"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="Value (text / 123 / true / null)"
                disabled={uiLocked}
              />

              {/* Actions */}
              <div className="sheetRow">
                <button
                  className="btn btnPrimary"
                  style={{ flex:1 }}
                  type="button"
                  onClick={applyStage}
                  disabled={uiLocked || (applyScope === "selected" && selectedCount === 0) || (calcMode === "update" && !activeCol) || (calcMode === "add" && !newCol.trim())}
                >
                  <Icon name="apply" size={13} />
                  Stage changes
                </button>
              </div>

            </div>
          </div>
        </div>

      </div>
    </>
  );
}
