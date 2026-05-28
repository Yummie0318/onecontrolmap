"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ResultMap from "@/app/components/ResultMapClient";
import { createPortal } from "react-dom";
import AutoLogout from "@/app/components/AutoLogout";
import Image from "next/image";

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
    --violet:#7c3aed;
    --green:#10b981;

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
  @keyframes toastIn{ from{transform:translateX(-50%) translateY(-10px);opacity:0} to{transform:translateX(-50%) translateY(0);opacity:1} }
  @keyframes popIn{ from{transform:translateY(6px) scale(.98);opacity:0} to{transform:translateY(0) scale(1);opacity:1} }
  @keyframes menuIn{ to{transform:translateY(0);opacity:1} }
  @keyframes scanAnim{ 0%{top:-2px;opacity:0} 5%{opacity:1} 95%{opacity:.6} 100%{top:100%;opacity:0} }
  @keyframes gridDrift{ 0%{background-position:0 0} 100%{background-position:52px 52px} }
  @keyframes blobPulse{ 0%{transform:scale(1)} 100%{transform:scale(1.06) translate(18px,-18px)} }

  /* ── SHELL ── */
  .shell{ height:100vh; width:100%; display:flex; flex-direction:column; position:relative; overflow:hidden; }

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

  /* ── TOP BAR ── */
  .topBar{
    height:58px; padding:0 14px;
    border-bottom:1px solid var(--panelBorder);
    background:rgba(5,12,30,.82);
    backdrop-filter:blur(20px) saturate(1.5);
    display:flex; align-items:center; justify-content:space-between; gap:12px;
    position:relative; z-index:70000; flex-shrink:0;
  }
  [data-theme="light"] .topBar{ background:rgba(255,255,255,.82); }
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

  .topRight{ display:flex; align-items:center; gap:8px; }

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
  [data-theme="light"] .btnDanger{ border-color:rgba(217,45,32,.22); background:rgba(217,45,32,.06); color:rgba(180,35,24,.90); }
  .btnGhost{ background:rgba(255,255,255,.04); }
  [data-theme="light"] .btnGhost{ background:rgba(255,255,255,.90); }
  .iconBtn{ width:38px; height:38px; padding:0; justify-content:center; border-radius:13px; }
  .miniIconBtn{ width:32px; height:32px; padding:0; justify-content:center; border-radius:999px; }

  /* admin badge on upload */
  .adminBadge{
    position:absolute; top:-5px; right:-5px;
    background:rgba(15,122,58,.90); color:#fff;
    font-size:8px; font-weight:800; padding:2px 4px;
    border-radius:6px; line-height:1; letterSpacing:.2px;
    border:1.5px solid var(--bg0); pointer-events:none;
  }

  /* ── AVATAR ── */
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
  [data-theme="light"] .profileMenu{ background:rgba(255,255,255,.96); }
  .profileMenu::before{
    content:""; position:absolute; top:0; left:0; right:0; height:1.5px;
    background:var(--topline);
  }
  .profileHead{ padding:12px 12px 10px; display:flex; align-items:center; justify-content:space-between; gap:10px; }
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
  .profileItem.danger{ color:rgba(255,130,120,.90); }
  [data-theme="light"] .profileItem.danger{ color:rgba(180,35,24,.90); }
  [data-theme="light"] .profileItem:hover{ background:rgba(15,122,58,.05); }
  .profileFooter{
    padding:8px 12px 10px; font-size:10.5px; color:var(--muted);
    text-align:center; border-top:1px solid var(--panelBorder);
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
  [data-theme="light"] .toast{ background:rgba(255,255,255,.95); color:var(--text); box-shadow:0 18px 52px rgba(11,18,32,.16); }
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

  /* ── MAIN GRID ── */
  .main{
    flex:1; min-height:0;
    display:grid; grid-template-columns:420px 1fr;
    gap:10px; padding:10px;
    position:relative; z-index:1;
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
  .panel::before,.mapStack::before{
    content:""; position:absolute; top:0; left:0; right:0; height:1.5px;
    background:var(--topline); border-radius:22px 22px 0 0;
  }

  /* ── PANEL HEAD ── */
  .panelHead{
    padding:11px 12px;
    border-bottom:1px solid var(--panelBorder);
    display:flex; align-items:center; justify-content:space-between; gap:10px;
    background:rgba(5,12,30,.60);
    backdrop-filter:blur(12px);
    flex-shrink:0;
  }
  [data-theme="light"] .panelHead{ background:rgba(255,255,255,.82); }
  .panelTitle{
    font-size:12.5px; font-weight:750; letter-spacing:-.15px;
    display:flex; align-items:center; gap:8px; color:var(--text);
    min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .panelMeta{ font-size:10.5px; font-weight:600; color:var(--muted); display:flex; align-items:center; gap:6px; white-space:nowrap; }

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

  /* ── LIST ── */
  .list{
    flex:1; min-height:0; overflow-y:auto; overflow-x:hidden;
    -webkit-overflow-scrolling:touch;
  }

  /* ── ROW ITEMS ── */
  .row{
    padding:10px 12px;
    border-bottom:1px solid var(--panelBorder);
    display:flex; gap:10px; align-items:center; justify-content:space-between;
    transition:background .12s ease,border-color .12s ease;
    cursor:pointer;
  }
  .row:hover{
    background:rgba(15,122,58,.05);
    border-bottom-color:rgba(15,122,58,.14);
  }
  [data-theme="light"] .row:hover{ background:rgba(255,255,255,.98); border-bottom-color:rgba(15,122,58,.12); }
  .rowActive{
    background:rgba(15,122,58,.10) !important;
    border-bottom-color:rgba(15,122,58,.20) !important;
  }
  .rowLeft{ min-width:0; display:flex; flex-direction:column; gap:3px; flex:1; }
  .rowTitle{
    font-weight:700; letter-spacing:-.06px; font-size:11.5px;
    color:var(--text); line-height:1.25;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
    overflow:hidden; white-space:normal;
  }
  .rowMeta{ font-size:10px; font-weight:550; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .rowBtns{ display:flex; align-items:center; gap:6px; flex:0 0 auto; }

  /* ── PILL / CHIP ── */
  .pill,.chip{
    font-size:10.5px; font-weight:620; color:var(--muted);
    border:1px solid var(--panelBorder);
    padding:5px 9px; border-radius:999px;
    background:rgba(255,255,255,.04);
    display:inline-flex; align-items:center; gap:6px; white-space:nowrap;
  }
  [data-theme="light"] .pill,[data-theme="light"] .chip{ background:rgba(255,255,255,.80); color:rgba(11,18,32,.72); }

  /* ── MAP AREA ── */
  .mapArea{ position:relative; flex:1; min-height:0; }
  .mapInner{ position:absolute; inset:0; }
  .mapLoading{
    position:absolute; inset:0;
    background:rgba(5,12,30,.65); backdrop-filter:blur(6px);
    display:grid; place-items:center; pointer-events:none;
    font-weight:650; font-size:12px; color:var(--muted);
  }
  [data-theme="light"] .mapLoading{ background:rgba(255,255,255,.55); }

  /* ── ERROR BAR ── */
  .errorBar{
    padding:9px 12px;
    background:rgba(217,45,32,.10);
    border-top:1px solid rgba(217,45,32,.20);
    color:rgba(255,150,140,.90);
    font-size:11px; font-weight:650;
    display:flex; gap:8px; align-items:center;
    flex-shrink:0;
  }
  [data-theme="light"] .errorBar{ color:#7a0b1a; background:rgba(217,45,32,.07); border-top-color:rgba(217,45,32,.14); }

  /* ── MODALS ── */
  .overlayModal{
    position:fixed; inset:0;
    background:rgba(6,15,36,.65); backdrop-filter:blur(6px);
    display:grid; place-items:center; padding:12px; z-index:10050;
  }
  [data-theme="light"] .overlayModal{ background:rgba(11,18,32,.38); }
  .modal{
    width:min(560px,100%);
    border-radius:22px; border:1px solid var(--panelBorder);
    background:rgba(5,12,30,.95);
    backdrop-filter:blur(28px) saturate(1.5);
    box-shadow:var(--shadow2);
    overflow:hidden; max-height:calc(100vh - 24px);
    display:flex; flex-direction:column;
    animation:popIn .14s ease-out;
    position:relative;
  }
  [data-theme="light"] .modal{ background:rgba(255,255,255,.96); }
  .modal::before{ content:""; position:absolute; top:0; left:0; right:0; height:1.5px; background:var(--topline); }
  .modalHead{
    padding:12px; border-bottom:1px solid var(--panelBorder);
    display:flex; align-items:center; justify-content:space-between; gap:10px;
    font-size:13px; font-weight:750; letter-spacing:-.1px; color:var(--text);
  }
  .modalBody{ padding:14px; font-size:12px; color:var(--muted); overflow:auto; display:flex; flex-direction:column; gap:10px; }
  .modalFoot{
    padding:12px; border-top:1px solid var(--panelBorder);
    display:flex; justify-content:flex-end; gap:8px;
  }
  .fieldInput{
    width:100%; padding:10px 12px; border-radius:13px;
    border:1px solid var(--inputBorder);
    background:var(--inputBg); outline:none;
    font-weight:600; font-size:12px; color:var(--text);
    transition:border-color .15s ease,box-shadow .15s ease;
  }
  .fieldInput:focus{
    border-color:rgba(15,122,58,.45);
    box-shadow:0 0 0 4px rgba(15,122,58,.10);
  }
  .fieldInput::placeholder{ color:var(--muted2); }
  .fileInputWrap{
    border:1px dashed var(--panelBorder);
    border-radius:13px;
    padding:20px;
    text-align:center;
    color:var(--muted);
    font-size:11.5px; font-weight:550;
    transition:border-color .15s ease,background .15s ease;
    cursor:pointer;
  }
  .fileInputWrap:hover{ border-color:rgba(15,122,58,.40); background:rgba(15,122,58,.04); }

  /* ── DOTS MENU ── */
  .ttAnchor{ position:relative; display:inline-flex; align-items:center; }
  .ttFloat{
    position:fixed; z-index:200000;
    background:rgba(5,12,30,.95);
    backdrop-filter:blur(14px);
    border:1px solid var(--panelBorder);
    box-shadow:0 18px 50px rgba(0,0,0,.55);
    padding:6px 10px; border-radius:10px;
    font-size:11px; font-weight:600; color:var(--text);
    white-space:nowrap; pointer-events:none;
  }
  [data-theme="light"] .ttFloat{ background:rgba(255,255,255,.96); color:rgba(11,18,32,.88); box-shadow:0 18px 50px rgba(11,18,32,.18); }
  .ttFloat.isTop{ transform:translate(-50%, calc(-100% - 10px)); }
  .ttFloat.isBottom{ transform:translate(-50%, 10px); }

  .dotsMenu{
    position:fixed; z-index:250000;
    border-radius:16px; border:1px solid var(--panelBorder);
    background:rgba(5,12,30,.95);
    backdrop-filter:blur(28px) saturate(1.5);
    box-shadow:var(--shadow2);
    overflow:hidden; animation:popIn .12s ease-out;
  }
  [data-theme="light"] .dotsMenu{ background:rgba(255,255,255,.96); }
  .dotsMenu::before{ content:""; position:absolute; top:0; left:0; right:0; height:1.5px; background:var(--topline); }
  .dotsMenuHead{
    padding:10px 12px 9px;
    border-bottom:1px solid var(--panelBorder);
    background:rgba(255,255,255,.03);
  }
  [data-theme="light"] .dotsMenuHead{ background:rgba(255,255,255,.80); }
  .dotsMenuTitle{ font-weight:750; font-size:12px; letter-spacing:-.1px; color:var(--text); overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .dotsMenuSub{ margin-top:3px; font-size:10px; font-weight:550; color:var(--muted); overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .dotsItem{
    width:100%; display:flex; align-items:center; gap:10px;
    padding:10px 12px; border:0; background:transparent;
    cursor:pointer; font-weight:620; font-size:12px; color:var(--text);
    transition:background .12s ease;
  }
  .dotsItem:hover{ background:rgba(255,255,255,.05); }
  [data-theme="light"] .dotsItem:hover{ background:rgba(11,18,32,.04); }
  .dotsIco{
    width:26px; height:26px; border-radius:9px;
    border:1px solid var(--panelBorder);
    background:rgba(255,255,255,.05);
    display:flex; align-items:center; justify-content:center; flex:0 0 auto;
  }
  [data-theme="light"] .dotsIco{ background:rgba(255,255,255,.92); }
  .dotsSep{ height:1px; background:var(--panelBorder); margin:4px 10px; }
  .dotsItem.blue{ color:rgba(96,165,250,.95); }
  .dotsItem.green{ color:rgba(52,211,153,.95); }
  .dotsItem.violet{ color:rgba(167,139,250,.95); }
  .dotsItem.red{ color:rgba(252,165,165,.95); }
  [data-theme="light"] .dotsItem.blue{ color:#2563eb; }
  [data-theme="light"] .dotsItem.green{ color:#059669; }
  [data-theme="light"] .dotsItem.violet{ color:#7c3aed; }
  [data-theme="light"] .dotsItem.red{ color:#dc2626; }

  /* ── SPINNER ── */
  .spinRing{
    display:inline-block; border-radius:999px;
    border:2px solid rgba(232,240,254,.12);
    border-top-color:var(--blue);
    animation:spin .75s linear infinite;
  }
  [data-theme="light"] .spinRing{ border-color:rgba(11,18,32,.10); border-top-color:var(--blue); }

  /* ── RESPONSIVE ── */
  @media (max-width:980px){
    body{ overflow:auto; }
    .main{ grid-template-columns:1fr; }
    .mapArea{ min-height:52vh; }
  }
`;

// ─── TYPES ───────────────────────────────────────────────────────────────────
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

// ─── HELPERS ─────────────────────────────────────────────────────────────────
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

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

// ─── ICONS ───────────────────────────────────────────────────────────────────
function Icon({ name, size = 16 }: {
  name: "upload"|"reload"|"user"|"eye"|"download"|"rename"|"open"|"trash"|"close"|"x"|"info"|"check"|"dots"|"layers"|"map"|"logout"|"moon"|"sun";
  size?: number;
}) {
  const p = { stroke:"currentColor", strokeWidth:2, strokeLinecap:"round" as const, strokeLinejoin:"round" as const };
  const s = { width:size, height:size, viewBox:"0 0 24 24", fill:"none", xmlns:"http://www.w3.org/2000/svg" as const };
  switch (name) {
    case "upload": return <svg {...s}><path {...p} d="M12 16V4"/><path {...p} d="M7 9l5-5 5 5"/><path {...p} d="M4 20h16"/></svg>;
    case "reload": return <svg {...s}><path {...p} d="M21 12a9 9 0 1 1-3-6.7"/><path {...p} d="M21 3v6h-6"/></svg>;
    case "user": return <svg {...s}><path {...p} d="M20 21a8 8 0 1 0-16 0"/><path {...p} d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/></svg>;
    case "eye": return <svg {...s}><path {...p} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><path {...p} d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></svg>;
    case "download": return <svg {...s}><path {...p} d="M12 3v10"/><path {...p} d="M7 10l5 5 5-5"/><path {...p} d="M4 20h16"/></svg>;
    case "rename": return <svg {...s}><path {...p} d="M12 20h9"/><path {...p} d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z"/></svg>;
    case "open": return <svg {...s}><path {...p} d="M14 3h7v7"/><path {...p} d="M10 14L21 3"/><path {...p} d="M21 14v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/></svg>;
    case "trash": return <svg {...s}><path {...p} d="M3 6h18"/><path {...p} d="M8 6V4h8v2"/><path {...p} d="M19 6l-1 14H6L5 6"/><path {...p} d="M10 11v6"/><path {...p} d="M14 11v6"/></svg>;
    case "close": case "x": return <svg {...s}><path {...p} d="M6 6l12 12"/><path {...p} d="M18 6L6 18"/></svg>;
    case "info": return <svg {...s}><path {...p} d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"/><path {...p} d="M12 10v6"/><path {...p} d="M12 7h.01"/></svg>;
    case "check": return <svg {...s}><path {...p} d="M20 6L9 17l-5-5"/></svg>;
    case "dots": return <svg {...s}><path {...p} d="M12 5h.01"/><path {...p} d="M12 12h.01"/><path {...p} d="M12 19h.01"/></svg>;
    case "layers": return <svg {...s}><path {...p} d="M12 2L2 7l10 5 10-5-10-5Z"/><path {...p} d="M2 17l10 5 10-5"/><path {...p} d="M2 12l10 5 10-5"/></svg>;
    case "map": return <svg {...s}><path {...p} d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path {...p} d="M9 3v15"/><path {...p} d="M15 6v15"/></svg>;
    case "logout": return <svg {...s}><path {...p} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline {...p} points="16 17 21 12 16 7"/><line {...p} x1="21" y1="12" x2="9" y2="12"/></svg>;
    case "moon": return <svg {...s}><path {...p} d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
    case "sun": return <svg {...s}><circle {...p} cx="12" cy="12" r="4"/><path {...p} d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>;
    default: return null;
  }
}

function SpinRing({ size = 16 }: { size?: number }) {
  return <span className="spinRing" style={{ width: size, height: size }} aria-hidden="true" />;
}

// ─── TOOLTIP ─────────────────────────────────────────────────────────────────
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; placement: "top"|"bottom" } | null>(null);

  function updatePos() {
    const el = anchorRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const placement: "top"|"bottom" = r.top > 56 ? "top" : "bottom";
    setPos({ x: clamp(r.left + r.width / 2, 16, window.innerWidth - 16), y: placement === "top" ? r.top : r.bottom, placement });
  }

  useEffect(() => {
    if (!open) return;
    const h = () => updatePos();
    window.addEventListener("scroll", h, true); window.addEventListener("resize", h);
    return () => { window.removeEventListener("scroll", h, true); window.removeEventListener("resize", h); };
  }, [open]);

  return (
    <span ref={anchorRef} className="ttAnchor"
      onMouseEnter={() => { setOpen(true); requestAnimationFrame(updatePos); }}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => { setOpen(true); requestAnimationFrame(updatePos); }}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && pos ? createPortal(
        <div className={`ttFloat ${pos.placement === "bottom" ? "isBottom" : "isTop"}`} role="tooltip" style={{ left: pos.x, top: pos.y }}>{text}</div>,
        document.body
      ) : null}
    </span>
  );
}

// ─── DOTS MENU ───────────────────────────────────────────────────────────────
type MenuPos = { left: number; top: number; placement: "down"|"up" };

function DotsMenu({ layer, disabled, onPreview, onDownload, onRename, onEdit, onDelete }: {
  layer: LayerRow; disabled: boolean;
  onPreview: () => void; onDownload: () => void;
  onRename: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);

  function close() { setOpen(false); }

  function updatePos() {
    const el = btnRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const menuW = 220, menuH = 240;
    const placement: "down"|"up" = r.bottom + menuH + 10 < window.innerHeight ? "down" : "up";
    setPos({ left: clamp(r.right - menuW, 12, window.innerWidth - menuW - 12), top: clamp(placement === "down" ? r.bottom + 8 : r.top - menuH - 8, 12, window.innerHeight - 12), placement });
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onPtr = (e: MouseEvent) => {
      const btn = btnRef.current; if (!btn) return;
      if (btn.contains(e.target as Node)) return;
      const menu = document.getElementById(`dots-menu-${layer.id}`);
      if (menu && menu.contains(e.target as Node)) return;
      close();
    };
    const onScroll = () => updatePos(), onResize = () => updatePos();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPtr, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPtr, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, layer.id]);

  function click(action: () => void) { if (disabled) return; close(); action(); }

  return (
    <>
      <Tooltip text="More actions">
        <button ref={btnRef} onClick={() => { if (!disabled) { setOpen(v => !v); requestAnimationFrame(updatePos); } }}
          disabled={disabled} className="btn btnGhost miniIconBtn" aria-label="More actions" aria-expanded={open}>
          <Icon name="dots" size={13} />
        </button>
      </Tooltip>

      {open && pos ? createPortal(
        <div id={`dots-menu-${layer.id}`}
          className="dotsMenu"
          style={{ left: pos.left, top: pos.top, width: 220 }}
          role="menu" aria-label={`Actions for ${layer.name}`}
        >
          <div className="dotsMenuHead">
            <div className="dotsMenuTitle" title={layer.name}>{layer.name}</div>
            <div className="dotsMenuSub">{layer.geom_type ?? "-"} · {layer.feature_count ?? 0} feat · SRID {layer.srid ?? "-"}</div>
          </div>

          <button className="dotsItem blue" role="menuitem" onClick={() => click(onPreview)}>
            <span className="dotsIco"><Icon name="eye" size={13} /></span>Preview
          </button>
          <button className="dotsItem green" role="menuitem" onClick={() => click(onDownload)}>
            <span className="dotsIco"><Icon name="download" size={13} /></span>Download GeoJSON
          </button>
          <button className="dotsItem violet" role="menuitem" onClick={() => click(onRename)}>
            <span className="dotsIco"><Icon name="rename" size={13} /></span>Rename
          </button>
          <button className="dotsItem" role="menuitem" onClick={() => click(onEdit)}>
            <span className="dotsIco"><Icon name="open" size={13} /></span>Edit Attributes
          </button>
          <div className="dotsSep" />
          <button className="dotsItem red" role="menuitem" onClick={() => click(onDelete)}>
            <span className="dotsIco"><Icon name="trash" size={13} /></span>Delete
          </button>
        </div>,
        document.body
      ) : null}
    </>
  );
}

// ─── OVERLAY SPINNER ─────────────────────────────────────────────────────────
function OverlaySpinner({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="overlaySaving" role="alert" aria-live="assertive" aria-busy="true">
      <div className="overlayCard">
        <div className="overlayTop">
          <div className="overlayIcon">
            <span className="spinRing" style={{ width:18, height:18 }} />
          </div>
          <div>
            <div className="overlayTitle">{title}</div>
            {subtitle ? <div className="overlaySub">{subtitle}</div> : null}
          </div>
        </div>
        <div className="overlayHint">
          <Icon name="info" size={13} />
          Actions are temporarily disabled to prevent duplicate requests.
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function AdminLayersPage() {
  const [layers, setLayers] = useState<LayerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [geojson, setGeojson] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [toast, setToast] = useState<ToastState>({ show: false });
  const [darkMode, setDarkMode] = useState(true);

  // upload
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // rename
  const [showRename, setShowRename] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  // profile
  const [profileOpen, setProfileOpen] = useState(false);
  const profileWrapRef = useRef<HTMLDivElement | null>(null);
  const [authUser, setAuthUser] = useState<{ username: string; usertype: string } | null>(null);

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
      try { setAuthUser(JSON.parse(userRaw)); } catch {}
      const last = Number(localStorage.getItem("last_activity") || "0");
      if (!last) localStorage.setItem("last_activity", String(Date.now()));
    } catch { window.location.href = "/login"; }
  }, []);

  // ── profile click-outside ──
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!profileWrapRef.current) return;
      if (!profileWrapRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // ── derived ──
  const selectedLayer = useMemo(() => layers.find((l) => l.id === selectedId) ?? null, [layers, selectedId]);
  const featureCount = useMemo(() => geojson?.features?.length ?? 0, [geojson]);
  const mapKey = useMemo(() => selectedId ?? "none", [selectedId]);
  const filteredLayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return layers;
    return layers.filter((l) => `${l.name} ${l.source_filename ?? ""} ${l.geom_type ?? ""} ${l.srid ?? ""}`.toLowerCase().includes(q));
  }, [layers, search]);
  const uiLocked = loadingList || !!busyId || uploading || renaming;

  function showToast(type: "success"|"error"|"info", message: string) {
    setToast({ show: true, type, message });
    window.setTimeout(() => setToast({ show: false }), 2400);
  }

  // ── data ops ──
  async function refresh() {
    setLoadingList(true); setError("");
    try {
      const r = await fetch("/api/layers", { cache: "no-store" });
      const j: any = safeJsonParse(await r.text());
      if (!j.ok) throw new Error(j.error || "Failed to load layers");
      setLayers(j.layers || []);
      showToast("info", "Layers refreshed.");
    } catch (e: any) { setError(e?.message ?? "Failed"); showToast("error", e?.message ?? "Failed"); }
    finally { setLoadingList(false); }
  }

  useEffect(() => { refresh(); }, []);

  async function previewLayer(layerId: string) {
    setBusyId(layerId); setSelectedId(layerId); setGeojson(null); setError("");
    try {
      const r = await fetch(`/api/layers/${layerId}/geojson?mode=full`, { cache: "no-store" });
      const j: any = safeJsonParse(await r.text());
      if (j?.ok === false) throw new Error(j.error || "Failed to load GeoJSON");
      const fc = coerceFeatureCollection(j);
      if (!fc) throw new Error("API did not return a GeoJSON FeatureCollection.");
      setGeojson(fc);
      showToast("success", "Preview loaded.");
    } catch (e: any) { setError(e?.message ?? "Preview failed"); showToast("error", e?.message ?? "Preview failed"); }
    finally { setBusyId(null); }
  }

  function openEditorInNewTab(layerId: string) {
    const layer = layers.find((x) => x.id === layerId);
    window.open(`/admin/layers/${encodeURIComponent(layerId)}/edit?name=${encodeURIComponent(layer?.name ?? "")}`, "_blank", "noopener,noreferrer");
    showToast("info", "Opened editor in new tab.");
  }

  async function downloadGeoJSON(layerId: string, name: string) {
    setBusyId(layerId); setError("");
    try {
      const r = await fetch(`/api/layers/${layerId}/geojson?mode=full`, { cache: "no-store" });
      const j: any = safeJsonParse(await r.text());
      if (j?.ok === false) throw new Error(j.error || "Failed");
      const fc = coerceFeatureCollection(j);
      if (!fc) throw new Error("No FeatureCollection.");
      const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${(name || "layer").replace(/[^\w\-]+/g, "_")}.geojson`; a.click();
      URL.revokeObjectURL(url);
      showToast("success", "Download started.");
    } catch (e: any) { setError(e?.message ?? "Failed"); showToast("error", e?.message ?? "Failed"); }
    finally { setBusyId(null); }
  }

  async function deleteLayer(layerId: string, name: string) {
    if (uiLocked) return;
    if (!window.confirm(`Delete "${name}"?\n\nThis cannot be undone.`)) return;
    setBusyId(layerId); setError("");
    try {
      const r = await fetch(`/api/layers/${layerId}`, { method: "DELETE" });
      const j: any = safeJsonParse(await r.text());
      if (!j.ok) throw new Error(j.error || "Delete failed");
      if (selectedId === layerId) { setSelectedId(null); setGeojson(null); }
      await refresh();
      showToast("success", "Layer deleted.");
    } catch (e: any) { setError(e?.message ?? "Failed"); showToast("error", e?.message ?? "Failed"); }
    finally { setBusyId(null); }
  }

  async function uploadFile(file: File) {
    setShowUpload(false); setUploading(true); setUploadStatus(""); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (uploadName.trim()) form.append("name", uploadName.trim());
      const res = await fetch("/api/layers/upload", { method: "POST", body: form });
      const data: any = safeJsonParse(await res.text());
      if (!data.ok) {
        const msg = data.error ?? "Upload failed";
        showToast("error", msg);
        setShowUpload(true); setUploadStatus(`❌ ${msg}`); return;
      }
      showToast("success", "Upload complete.");
      await refresh();
      if (data.layerId) await previewLayer(data.layerId);
    } catch (e: any) {
      const msg = e?.message ?? "Unknown error";
      showToast("error", `Upload failed: ${msg}`);
      setShowUpload(true); setUploadStatus(`❌ Upload failed: ${msg}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function renameLayer() {
    if (!renameId) return;
    const newName = renameValue.trim(); if (!newName) return;
    setRenaming(true); setError("");
    try {
      const r = await fetch(`/api/layers/${renameId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }) });
      const j: any = safeJsonParse(await r.text());
      if (!j.ok) throw new Error(j.error || "Rename failed");
      setLayers((prev) => prev.map((l) => l.id === renameId ? { ...l, name: newName } : l));
      showToast("success", "Renamed."); closeRename();
    } catch (e: any) { setError(e?.message ?? "Failed"); showToast("error", e?.message ?? "Failed"); }
    finally { setRenaming(false); }
  }

  function logoutNow() {
    ["auth_user","is_logged_in","login_time","last_activity"].forEach((k) => { try { localStorage.removeItem(k); } catch {} });
    setProfileOpen(false);
    window.location.href = "/login";
  }

  function openRename(layer: LayerRow) { setRenameId(layer.id); setRenameValue(layer.name ?? ""); setShowRename(true); }
  function closeRename() { if (renaming) return; setShowRename(false); setRenameId(null); setRenameValue(""); }
  function openUpload() { setUploadStatus(""); setUploadName(""); setShowUpload(true); if (fileInputRef.current) fileInputRef.current.value = ""; }
  function closeUpload() { if (uploading) return; setShowUpload(false); }

  const overlayTitle = useMemo(() => {
    if (uploading) return "Uploading layer…";
    if (loadingList) return "Refreshing layers…";
    if (busyId && selectedId === busyId) return "Loading preview…";
    if (busyId) return "Working…";
    if (renaming) return "Renaming layer…";
    return "";
  }, [uploading, loadingList, busyId, selectedId, renaming]);

  // ─── RENDER ──────────────────────────────────────────────────────────────
  return (
    <>
      <AutoLogout />
      <div className="shell" aria-disabled={uiLocked ? "true" : "false"}>
        <style>{STYLES}</style>
        <style>{`@keyframes spin{ to{ transform:rotate(360deg); } }`}</style>

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
        {(uploading || loadingList || busyId || renaming) && overlayTitle ? (
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
              <div className="brandSub">PENRO Cagayan · Admin</div>
            </div>
          </div>

          {/* Center status pills */}
          <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, justifyContent:"center" }}>
            <div className="pill">
              <Icon name="layers" size={10} />
              {filteredLayers.length} layer{filteredLayers.length !== 1 ? "s" : ""}
            </div>
            {selectedLayer ? (
              <div className="pill">
                <Icon name="check" size={10} />
                {featureCount} features
              </div>
            ) : null}
          </div>

          <div className="topRight">
            {/* Upload */}
            <Tooltip text="Upload GeoJSON">
              <button
                className="btn btnPrimary iconBtn"
                type="button"
                onClick={openUpload}
                disabled={uiLocked}
                aria-label="Upload"
                style={{ position:"relative" }}
              >
                <Icon name="upload" size={15} />
                <span className="adminBadge">GeoJSON</span>
              </button>
            </Tooltip>

            {/* Refresh */}
            <Tooltip text="Refresh layers">
              <button className="btn btnGhost iconBtn" type="button" onClick={refresh} disabled={uiLocked} aria-label="Refresh">
                {loadingList ? <SpinRing size={15} /> : <Icon name="reload" size={15} />}
              </button>
            </Tooltip>

            {/* Profile */}
            <div className="profileWrap" ref={profileWrapRef}>
              <button
                className="btn btnGhost iconBtn"
                type="button"
                onClick={() => setProfileOpen(v => !v)}
                aria-expanded={profileOpen} aria-haspopup="menu"
                title="Profile"
                style={{ borderRadius:999, padding:0, border:0, background:"transparent", boxShadow:"none" }}
              >
                <span className="avatar">{authUser?.username?.[0]?.toUpperCase() ?? "A"}</span>
              </button>

              {profileOpen ? (
                <div className="profileMenu" role="menu">
                  <div className="profileHead">
                    <div>
                      <div className="profileName">{authUser?.username ?? "Admin"}</div>
                      <div className="profileRole">Administrator</div>
                    </div>
                    {/* Dark / Light toggle */}
                    <button
                      className="btn btnGhost"
                      type="button"
                      onClick={() => setDarkMode(v => !v)}
                      title={darkMode ? "Light mode" : "Dark mode"}
                      style={{ borderRadius:999, padding:"6px 10px", display:"flex", alignItems:"center", gap:6, flexShrink:0 }}
                    >
                      <Icon name={darkMode ? "sun" : "moon"} size={13} />
                      <span style={{ fontSize:11, fontWeight:620, color:"var(--muted)" }}>{darkMode ? "Light" : "Dark"}</span>
                    </button>
                  </div>

                  <div className="profileDivider" />

                  <button className="profileItem" role="menuitem" type="button"
                    onClick={() => { setProfileOpen(false); window.location.href = "/viewmap"; }}>
                    <Icon name="map" size={13} />
                    View Map
                  </button>

                  <div className="profileDivider" />

                  <button className="profileItem danger" role="menuitem" type="button" onClick={logoutNow}>
                    <Icon name="logout" size={13} />
                    Log Out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* MAIN GRID                                                         */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div className="main">

          {/* LEFT — Layer list */}
          <div className="panel">
            <div className="panelHead">
              <div className="panelTitle">
                <Icon name="layers" size={12} />
                Layers
              </div>
              <div className="panelMeta">
                {loadingList ? <SpinRing size={13} /> : <span style={{ color:"var(--muted)" }}>{filteredLayers.length}</span>}
              </div>
            </div>

            {/* Search */}
            <div style={{ padding:"10px 12px 8px", flexShrink:0 }}>
              <div className="searchWrap">
                <Icon name="eye" size={13} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search layers…"
                  className="searchInput"
                  disabled={uiLocked}
                />
                {search ? (
                  <button className="btn btnGhost miniIconBtn" onClick={() => setSearch("")} type="button" title="Clear">
                    <Icon name="x" size={11} />
                  </button>
                ) : null}
              </div>
            </div>

            {error ? (
              <div className="errorBar">
                <Icon name="x" size={13} />
                {error}
              </div>
            ) : null}

            <div className="list">
              {filteredLayers.length === 0 ? (
                <div style={{ padding:"16px 14px", color:"var(--muted)", fontWeight:550, fontSize:12 }}>
                  {loadingList ? "Loading layers…" : "No layers found."}
                </div>
              ) : null}

              {filteredLayers.map((l) => {
                const busy = busyId === l.id;
                const active = selectedId === l.id;
                return (
                  <div
                    key={l.id}
                    className={`row ${active ? "rowActive" : ""}`}
                    role="button" tabIndex={0}
                    onClick={() => !uiLocked && previewLayer(l.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !uiLocked) previewLayer(l.id); }}
                    style={{ cursor: uiLocked ? "default" : "pointer" }}
                    title={uiLocked ? "Please wait…" : l.name}
                  >
                    <div className="rowLeft">
                      <div className="rowTitle">{l.name}</div>
                      <div className="rowMeta">
                        {l.geom_type ?? "-"} · {l.feature_count ?? 0} feat · SRID {l.srid ?? "-"}
                      </div>
                    </div>

                    <div className="rowBtns" onClick={(e) => e.stopPropagation()}>
                      {busy ? <SpinRing size={14} /> : null}
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
            </div>
          </div>

          {/* RIGHT — Map preview */}
          <div className="mapStack">
            <div className="panelHead">
              <div className="panelTitle" style={{ flex:1, overflow:"hidden" }}>
                <Icon name="map" size={12} />
                <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {selectedLayer ? selectedLayer.name : "Preview"}
                </span>
              </div>
              <div className="panelMeta">
                {selectedLayer ? (
                  <><Icon name="check" size={12} />{featureCount} features</>
                ) : (
                  <><Icon name="info" size={12} />No layer selected</>
                )}
              </div>
            </div>

            <div className="mapArea">
              <div className="mapInner">
                <ResultMap key={mapKey} geojson={geojson} />
              </div>

              {busyId && selectedId === busyId ? (
                <div className="mapLoading">
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <SpinRing size={16} />
                    Loading preview…
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* UPLOAD MODAL                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {showUpload ? (
          <div role="dialog" aria-modal="true" onClick={closeUpload} className="overlayModal">
            <div onClick={(e) => e.stopPropagation()} className="modal">
              <div className="modalHead">
                <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <Icon name="upload" size={14} />
                  Upload GeoJSON
                </span>
                <button onClick={closeUpload} disabled={uploading} className="btn btnGhost miniIconBtn" aria-label="Close">
                  <Icon name="x" size={13} />
                </button>
              </div>

              <div className="modalBody">
                <input
                  placeholder="Layer name (optional)"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  className="fieldInput"
                  disabled={uploading}
                />

                <div
                  className="fileInputWrap"
                  onClick={() => fileInputRef.current?.click()}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") fileInputRef.current?.click(); }}
                >
                  <Icon name="upload" size={20} />
                  <div style={{ marginTop:8, fontWeight:650, color:"var(--text)" }}>Click to choose file</div>
                  <div style={{ marginTop:4, fontSize:11 }}>Accepts .geojson or .json</div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".geojson,application/geo+json,application/json"
                  disabled={uploading}
                  style={{ display:"none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
                />

                {uploadStatus ? (
                  <div style={{ whiteSpace:"pre-wrap", fontWeight:650, fontSize:11, color: uploadStatus.startsWith("❌") ? "rgba(255,140,130,.90)" : "var(--muted)" }}>
                    {uploadStatus}
                  </div>
                ) : null}
              </div>

              <div className="modalFoot">
                <button onClick={closeUpload} disabled={uploading} className="btn btnGhost">Close</button>
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn btnPrimary" type="button">
                  <Icon name="upload" size={13} />
                  Choose file
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* RENAME MODAL                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {showRename ? (
          <div role="dialog" aria-modal="true" onClick={closeRename} className="overlayModal">
            <div onClick={(e) => e.stopPropagation()} className="modal">
              <div className="modalHead">
                <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <Icon name="rename" size={14} />
                  Rename Layer
                </span>
                <button onClick={closeRename} disabled={renaming} className="btn btnGhost miniIconBtn" aria-label="Close">
                  <Icon name="x" size={13} />
                </button>
              </div>

              <div className="modalBody">
                <input
                  placeholder="New layer name"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && renameValue.trim() && !renaming) renameLayer(); }}
                  className="fieldInput"
                  autoFocus
                  disabled={renaming}
                />
              </div>

              <div className="modalFoot">
                <button onClick={closeRename} disabled={renaming} className="btn btnGhost">Cancel</button>
                <button onClick={renameLayer} disabled={renaming || !renameValue.trim()} className="btn btnPrimary">
                  {renaming ? <><SpinRing size={13} />Renaming…</> : <><Icon name="check" size={13} />Rename</>}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
