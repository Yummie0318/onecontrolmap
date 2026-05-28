"use client";

import React, { useState, useMemo, useEffect } from "react";
import Image from "next/image";

type ToastKind = "success" | "error" | "info";

function Toast({
  kind, title, message, onClose,
}: {
  kind: ToastKind; title: string; message?: string; onClose: () => void;
}) {
  return (
    <div className={`toast ${kind}`} role="status" aria-live="polite">
      <div className="toastDot" aria-hidden="true" />
      <div className="toastText">
        <div className="toastTitle">{title}</div>
        {message ? <div className="toastMsg">{message}</div> : null}
      </div>
      <button className="toastX" onClick={onClose} type="button" aria-label="Close">✕</button>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      {open ? (
        <>
          <path d="M2.1 12s3.6-7 9.9-7 9.9 7 9.9 7-3.6 7-9.9 7-9.9-7-9.9-7Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d="M2.1 12s3.6-7 9.9-7c2.1 0 4 0.6 5.5 1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21.9 12s-3.6 7-9.9 7c-2.2 0-4.1-.6-5.7-1.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [showCf, setShowCf]     = useState(false);
  const [busy, setBusy]         = useState(false);
  const [toast, setToast]       = useState<{ kind: ToastKind; title: string; message?: string } | null>(null);
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

  // ── Leaflet world map background (same as login) ──────────────────────────
  useEffect(() => {
    const existingLink = document.getElementById("leaflet-css");
    if (!existingLink) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const existingScript = document.getElementById("leaflet-js");
    function initMap() {
      const L = (window as any).L;
      if (!L) return;
      const container = document.getElementById("signupMapBg");
      if (!container) return;
      if ((container as any)._leaflet_id) {
        try { L.map("signupMapBg").remove(); } catch {}
        (container as any)._leaflet_id = undefined;
      }
      const map = L.map("signupMapBg", {
        center: [20, 0], zoom: 2,
        zoomControl: false, scrollWheelZoom: false,
        doubleClickZoom: false, dragging: false,
        touchZoom: false, keyboard: false, attributionControl: false,
      });
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { subdomains: "abcd", maxZoom: 19 }
      ).addTo(map);
      let lng = 0;
      const drift = setInterval(() => {
        lng += 0.04;
        map.setView([15, lng], 2, { animate: false });
      }, 50);
      (container as any)._mapCleanup = () => { clearInterval(drift); map.remove(); };
    }

    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "leaflet-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => setTimeout(initMap, 100);
      document.head.appendChild(script);
    } else {
      setTimeout(initMap, 100);
    }

    return () => {
      const container = document.getElementById("signupMapBg");
      if (container && (container as any)._mapCleanup) (container as any)._mapCleanup();
    };
  }, []);

  const canSubmit = useMemo(() => {
    return (
      username.trim().length > 0 &&
      email.trim().length > 0 &&
      password.length >= 6 &&
      password === confirm
    );
  }, [username, email, password, confirm]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setToast(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), email: email.trim(), password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setToast({ kind: "error", title: "Sign up failed", message: data.error });
        setBusy(false);
        return;
      }
      setToast({ kind: "success", title: "Account created!", message: "Redirecting to login…" });
      setTimeout(() => { window.location.href = "/login"; }, 1500);
    } catch (err: any) {
      setToast({ kind: "error", title: "Network error", message: err?.message ?? "Please try again." });
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <style>{`
        :root{
          --primary:#0f7a3a;
          --blue:#3b82f6;
          --text:#e8f0fe;
          --muted:rgba(232,240,254,.55);
          --stroke:rgba(232,240,254,.10);
          --stroke2:rgba(232,240,254,.20);
          --shadow2:0 30px 90px rgba(0,0,0,.55);
        }
        [data-theme="light"]{
          --text:#0b1220;
          --muted:rgba(11,18,32,.58);
          --stroke:rgba(11,18,32,.10);
          --stroke2:rgba(11,18,32,.18);
          --shadow2:0 30px 90px rgba(11,18,32,.14);
        }
        html,body{ height:100%; margin:0; }
        body{ color:var(--text); background:#060f24; font-family:ui-sans-serif,system-ui,-apple-system,sans-serif; }
        *{ box-sizing:border-box; }
        ::selection{ background:rgba(15,122,58,.25); }

        .mapBg{ position:fixed; inset:0; z-index:0; overflow:hidden; }
        .leaflet-control-attribution{ display:none !important; }

        .mapOverlay{
          position:absolute; inset:0; z-index:2; pointer-events:none;
          background:
            radial-gradient(ellipse 70% 60% at 50% 50%, rgba(6,15,36,.45) 0%, rgba(6,15,36,.78) 100%),
            linear-gradient(180deg, rgba(6,15,36,.55) 0%, rgba(6,15,36,.30) 50%, rgba(6,15,36,.65) 100%);
        }

        .gridOverlay{
          position:absolute; inset:0; z-index:3; pointer-events:none;
          background-image:
            linear-gradient(rgba(59,130,246,.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,.05) 1px, transparent 1px);
          background-size:52px 52px;
          animation:gridDrift 35s linear infinite;
        }
        @keyframes gridDrift{ 0%{background-position:0 0} 100%{background-position:52px 52px} }

        .scanLine{
          position:absolute; left:0; right:0; height:2px; z-index:4; pointer-events:none;
          background:linear-gradient(90deg,transparent,rgba(59,130,246,.30),rgba(15,122,58,.45),rgba(59,130,246,.30),transparent);
          animation:scan 8s ease-in-out infinite;
        }
        @keyframes scan{
          0%{top:-2px;opacity:0} 5%{opacity:1} 95%{opacity:.7} 100%{top:100%;opacity:0}
        }

        .glowBlob{
          position:absolute; border-radius:50%; filter:blur(90px);
          animation:blobFloat ease-in-out infinite alternate; pointer-events:none; z-index:3;
        }
        @keyframes blobFloat{
          0%{transform:translate(0,0) scale(1)}
          100%{transform:translate(28px,-28px) scale(1.07)}
        }

        .radar{
          position:absolute; border-radius:50%; pointer-events:none; z-index:4;
          border:1px solid rgba(15,122,58,.45);
          animation:radarPulse 4s ease-out infinite;
        }
        @keyframes radarPulse{
          0%{transform:scale(0);opacity:.9}
          100%{transform:scale(4.5);opacity:0}
        }

        .pin{
          position:absolute; width:10px; height:10px; border-radius:50%; z-index:5;
          background:rgba(15,122,58,.95); pointer-events:none;
          box-shadow:0 0 0 0 rgba(15,122,58,.6);
          animation:pinPulse 3s ease-out infinite;
        }
        .pin::after{
          content:""; position:absolute; top:50%; left:50%;
          transform:translate(-50%,-50%); width:4px; height:4px;
          border-radius:50%; background:#fff;
        }
        @keyframes pinPulse{
          0%,100%{box-shadow:0 0 0 0 rgba(15,122,58,.6)}
          50%{box-shadow:0 0 0 12px rgba(15,122,58,0)}
        }

        .particle{
          position:absolute; border-radius:50%; pointer-events:none; z-index:4;
          background:rgba(59,130,246,.6);
          box-shadow:0 0 10px 2px rgba(59,130,246,.30);
          animation:floatUp linear infinite;
        }
        @keyframes floatUp{
          0%{transform:translateY(0) scale(1);opacity:0}
          10%{opacity:1} 90%{opacity:.5}
          100%{transform:translateY(-100vh) scale(.3);opacity:0}
        }

        .mapLine{ stroke:#3b82f6; stroke-width:1; fill:none; stroke-dasharray:8 6; animation:dashMove 14s linear infinite; }
        .mapLine2{ stroke:#0f7a3a; stroke-width:1.2; fill:none; stroke-dasharray:5 8; animation:dashMove2 20s linear infinite; }
        @keyframes dashMove{ to{stroke-dashoffset:-70} }
        @keyframes dashMove2{ to{stroke-dashoffset:90} }

        .page{
          min-height:100vh; display:flex; align-items:center; justify-content:center;
          padding:24px 14px; position:relative; z-index:10;
        }

        .card{
          width:min(460px,100%);
          border:1px solid rgba(232,240,254,.13);
          background:rgba(5,12,30,.78);
          backdrop-filter:blur(32px) saturate(1.4);
          box-shadow:0 0 0 1px rgba(59,130,246,.08), 0 8px 32px rgba(0,0,0,.35), 0 40px 120px rgba(0,0,0,.55);
          border-radius:26px; overflow:hidden; padding:26px; position:relative;
        }
        .card::before{
          content:""; position:absolute; top:0; left:0; right:0; height:2px;
          background:linear-gradient(90deg,transparent,rgba(59,130,246,.55),rgba(15,122,58,.75),rgba(59,130,246,.55),transparent);
        }
        [data-theme="light"] .card{
          background:rgba(255,255,255,.86);
          border-color:rgba(11,18,32,.10);
          box-shadow:var(--shadow2);
        }

        .topRow{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }
        .brand{ display:flex; align-items:center; gap:10px; min-width:0; }
        .brandLogo{
          width:48px; height:48px; border-radius:14px; flex:0 0 auto; overflow:hidden;
          border:1px solid rgba(232,240,254,.12); background:rgba(255,255,255,.96);
          box-shadow:0 0 0 3px rgba(59,130,246,.10),0 12px 30px rgba(0,0,0,.30);
          display:flex; align-items:center; justify-content:center;
        }
        .brandTxt{ min-width:0; display:flex; flex-direction:column; line-height:1.18; }
        .brandTitle{ font-size:13px; font-weight:850; letter-spacing:-.2px; color:#e8f0fe; }
        .brandSub{ font-size:11px; font-weight:600; color:rgba(232,240,254,.48); }
        [data-theme="light"] .brandTitle{ color:#0b1220; }
        [data-theme="light"] .brandSub{ color:rgba(11,18,32,.55); }

        .header{ margin-top:4px; margin-bottom:16px; }
        .formTitle{ font-size:22px; font-weight:900; letter-spacing:-.5px; margin:0; color:#e8f0fe; }
        .formSub{ font-size:12px; font-weight:600; color:rgba(232,240,254,.42); margin-top:5px; }
        [data-theme="light"] .formTitle{ color:#0b1220; }
        [data-theme="light"] .formSub{ color:rgba(11,18,32,.55); }

        .field{ display:flex; flex-direction:column; gap:7px; margin-top:13px; }
        label{ font-size:11.5px; font-weight:750; color:rgba(232,240,254,.60); letter-spacing:.2px; text-transform:uppercase; }
        [data-theme="light"] label{ color:rgba(11,18,32,.70); }

        .inputWrap{
          display:flex; align-items:center; gap:10px; padding:11px 13px;
          border-radius:14px; border:1px solid rgba(232,240,254,.10);
          background:rgba(255,255,255,.05);
          transition:box-shadow .15s ease,border-color .15s ease,background .15s ease;
        }
        .inputWrap:focus-within{
          border-color:rgba(15,122,58,.50); box-shadow:0 0 0 4px rgba(15,122,58,.12);
          background:rgba(255,255,255,.08);
        }
        .inputWrap.error{
          border-color:rgba(217,45,32,.55); box-shadow:0 0 0 4px rgba(217,45,32,.12);
        }
        input{ width:100%; border:0; outline:0; background:transparent; color:#e8f0fe; font-size:13px; font-weight:650; }
        input::placeholder{ color:rgba(232,240,254,.25); font-weight:500; }
        [data-theme="light"] .inputWrap{ background:rgba(255,255,255,.92); border-color:rgba(11,18,32,.10); }
        [data-theme="light"] .inputWrap:focus-within{ border-color:rgba(15,122,58,.35); box-shadow:0 0 0 4px rgba(15,122,58,.10); background:rgba(255,255,255,.98); }
        [data-theme="light"] .inputWrap.error{ border-color:rgba(217,45,32,.40); box-shadow:0 0 0 4px rgba(217,45,32,.08); }
        [data-theme="light"] input{ color:#0b1220; }
        [data-theme="light"] input::placeholder{ color:rgba(11,18,32,.35); }

        .hint{ font-size:11px; font-weight:600; color:rgba(255,130,110,.85); margin-top:3px; }
        [data-theme="light"] .hint{ color:rgba(217,45,32,.80); }

        .iconMiniBtn{
          width:34px; height:34px; display:flex; align-items:center; justify-content:center;
          border-radius:11px; border:1px solid rgba(232,240,254,.10);
          background:rgba(255,255,255,.06); cursor:pointer; color:rgba(232,240,254,.65);
          transition:transform .10s ease,box-shadow .15s ease,border-color .15s ease,background .15s ease;
          flex:0 0 auto;
        }
        .iconMiniBtn:hover{ transform:translateY(-1px); border-color:rgba(232,240,254,.22); background:rgba(255,255,255,.11); box-shadow:0 6px 18px rgba(0,0,0,.25); }
        .iconMiniBtn:active{ transform:translateY(0); }
        [data-theme="light"] .iconMiniBtn{ background:rgba(255,255,255,.92); border-color:rgba(11,18,32,.10); color:rgba(11,18,32,.78); }

        .btn{
          border:1px solid rgba(232,240,254,.10); background:rgba(255,255,255,.06); color:#e8f0fe;
          font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:10px;
          user-select:none; transition:transform .10s ease,border-color .15s ease,box-shadow .15s ease,background .15s ease;
          padding:12px 14px; border-radius:14px; font-size:13px; justify-content:center;
          width:100%; margin-top:10px;
        }
        .btn:hover{ border-color:rgba(232,240,254,.22); background:rgba(255,255,255,.10); box-shadow:0 10px 28px rgba(0,0,0,.28); transform:translateY(-1px); }
        .btn:active{ transform:translateY(0); }
        .btn[disabled]{ opacity:.42; cursor:not-allowed; transform:none; box-shadow:none; }

        .btnPrimary{
          border-color:rgba(15,122,58,.40);
          background:linear-gradient(160deg,rgba(15,122,58,.25),rgba(15,122,58,.12));
          color:#7effc0;
        }
        .btnPrimary:hover{
          background:linear-gradient(160deg,rgba(15,122,58,.36),rgba(15,122,58,.20));
          border-color:rgba(15,122,58,.60);
          box-shadow:0 0 22px rgba(15,122,58,.22),0 10px 28px rgba(0,0,0,.28);
        }
        .btnPrimary strong{ font-weight:900; }

        [data-theme="light"] .btn{ background:rgba(255,255,255,.92); border-color:rgba(11,18,32,.10); color:#0b1220; }
        [data-theme="light"] .btnPrimary{ border-color:rgba(15,122,58,.26); background:linear-gradient(180deg,rgba(15,122,58,.12),rgba(255,255,255,.92)); color:#0a5428; }

        .backLink{
          display:block; text-align:center; margin-top:14px; font-size:12px;
          font-weight:700; color:rgba(232,240,254,.35); text-decoration:none;
          padding-top:14px; border-top:1px solid rgba(232,240,254,.07);
          transition:color .15s;
        }
        .backLink:hover{ color:rgba(126,255,192,.85); }
        [data-theme="light"] .backLink{ color:rgba(11,18,32,.48); border-top-color:rgba(11,18,32,.08); }
        [data-theme="light"] .backLink:hover{ color:var(--primary); }

        .help{
          margin-top:10px; font-size:11.5px; font-weight:600;
          color:rgba(232,240,254,.28); display:flex; flex-direction:column;
          gap:3px; text-align:center;
        }
        [data-theme="light"] .help{ color:rgba(11,18,32,.45); }
        .devCredit{ font-size:11px; color:rgba(232,240,254,.20); }
        .devCredit a{ color:inherit; text-decoration:none; }
        .devCredit a:hover{ text-decoration:underline; }
        [data-theme="light"] .devCredit{ color:rgba(11,18,32,.35); }

        .toast{
          position:fixed; top:14px; left:50%; transform:translateX(-50%); z-index:99999;
          width:min(480px,calc(100vw - 20px)); padding:10px 14px; border-radius:999px;
          border:1px solid rgba(232,240,254,.10); background:rgba(5,12,30,.94);
          box-shadow:0 0 0 1px rgba(59,130,246,.08),0 18px 52px rgba(0,0,0,.50);
          display:flex; align-items:center; gap:10px;
          backdrop-filter:blur(22px); animation:toastIn .18s ease-out;
        }
        @keyframes toastIn{ from{transform:translateX(-50%) translateY(-10px);opacity:0} to{transform:translateX(-50%) translateY(0);opacity:1} }
        .toastDot{ width:10px; height:10px; border-radius:999px; background:rgba(232,240,254,.15); flex:0 0 auto; }
        .toast.success .toastDot{ background:rgba(15,122,58,.85); box-shadow:0 0 0 6px rgba(15,122,58,.15); }
        .toast.error   .toastDot{ background:rgba(217,45,32,.85); box-shadow:0 0 0 6px rgba(217,45,32,.15); }
        .toast.info    .toastDot{ background:rgba(59,130,246,.85); box-shadow:0 0 0 6px rgba(59,130,246,.15); }
        .toastText{ min-width:0; display:flex; flex-direction:column; gap:1px; }
        .toastTitle{ font-size:12px; font-weight:800; color:#e8f0fe; }
        .toastMsg{ font-size:11.5px; font-weight:600; color:rgba(232,240,254,.52); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .toastX{ margin-left:auto; border:0; background:transparent; cursor:pointer; width:30px; height:30px; border-radius:999px; display:flex; align-items:center; justify-content:center; color:rgba(232,240,254,.55); font-size:13px; }
        .toastX:hover{ background:rgba(232,240,254,.08); }

        @keyframes spin{ to{ transform:rotate(360deg); } }
        @media (max-width:420px){ .card{ padding:18px; border-radius:20px; } }
      `}</style>

      {/* ── WORLD MAP BACKGROUND ── */}
      <div className="mapBg">
        <div id="signupMapBg" style={{ position:"absolute", inset:0, width:"100%", height:"100%", zIndex:1 }} />
        <div className="mapOverlay" />
        <div className="gridOverlay" />
        <div className="scanLine" />

        <div className="glowBlob" style={{ width:550, height:550, top:"-12%", left:"-6%", background:"rgba(15,122,58,.13)", animationDuration:"13s" }} />
        <div className="glowBlob" style={{ width:450, height:450, bottom:"-8%", right:"-4%", background:"rgba(59,130,246,.10)", animationDuration:"16s", animationDelay:"-5s" }} />
        <div className="glowBlob" style={{ width:280, height:280, top:"38%", left:"52%", background:"rgba(59,130,246,.07)", animationDuration:"11s", animationDelay:"-8s" }} />

        {[
          { top:"38%", left:"82%", size:55, delay:"0s" },
          { top:"52%", left:"78%", size:45, delay:"1.6s" },
          { top:"30%", left:"85%", size:40, delay:"3.0s" },
          { top:"45%", left:"75%", size:50, delay:"2.3s" },
        ].map((r, i) => (
          <div key={i} className="radar" style={{
            top:r.top, left:r.left, width:r.size, height:r.size,
            marginLeft:-r.size/2, marginTop:-r.size/2,
            animationDelay:r.delay, animationDuration:"4.5s", zIndex:5,
          }} />
        ))}

        {[
          { top:"38%", left:"82%", delay:"0s" },
          { top:"52%", left:"78%", delay:"0.8s" },
          { top:"30%", left:"85%", delay:"1.5s" },
          { top:"45%", left:"75%", delay:"2.1s" },
          { top:"42%", left:"80%", delay:"0.4s" },
        ].map((p, i) => (
          <div key={i} className="pin" style={{ top:p.top, left:p.left, animationDelay:p.delay, zIndex:6 }} />
        ))}

        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="particle" style={{
            width: 2 + Math.sin(i * 1.9) * 2,
            height: 2 + Math.sin(i * 1.9) * 2,
            left:`${(i * 6 + 6) % 93}%`,
            bottom:`${(i * 8 + 4) % 25}%`,
            animationDuration:`${9 + i * 1.2}s`,
            animationDelay:`${i * 0.65}s`,
            opacity: 0.3 + Math.sin(i) * 0.2,
            zIndex:5,
          }} />
        ))}

        <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:.20, zIndex:5, pointerEvents:"none" }} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <style>{`
              .mapLine{ stroke:#3b82f6; stroke-width:1; fill:none; stroke-dasharray:8 6; animation:dashMove 14s linear infinite; }
              .mapLine2{ stroke:#0f7a3a; stroke-width:1.2; fill:none; stroke-dasharray:5 8; animation:dashMove2 20s linear infinite; }
              @keyframes dashMove{ to{stroke-dashoffset:-70} }
              @keyframes dashMove2{ to{stroke-dashoffset:90} }
            `}</style>
          </defs>
          {[12,25,38,52,65,78].map((y, i) => (
            <line key={`h${i}`} className="mapLine" x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`} style={{ animationDelay:`${i * -2.3}s` }} />
          ))}
          {[8,20,33,47,60,73,86].map((x, i) => (
            <line key={`v${i}`} className="mapLine2" x1={`${x}%`} y1="0" x2={`${x}%`} y2="100%" style={{ animationDelay:`${i * -1.8}s` }} />
          ))}
          <path className="mapLine"  d="M 20% 35% Q 50% 20% 82% 38%" style={{ animationDelay:"-3s" }} />
          <path className="mapLine2" d="M 5% 55% Q 40% 42% 78% 52%" style={{ animationDelay:"-7s" }} />
          <path className="mapLine"  d="M 82% 38% Q 84% 45% 78% 52%" style={{ animationDelay:"-1s" }} />
          <path className="mapLine2" d="M 55% 60% Q 68% 50% 80% 45%" style={{ animationDelay:"-5s" }} />
          <path className="mapLine"  d="M 30% 70% Q 55% 55% 75% 52%" style={{ animationDelay:"-9s" }} />
        </svg>
      </div>

      {/* ── TOAST ── */}
      {toast && <Toast kind={toast.kind} title={toast.title} message={toast.message} onClose={() => setToast(null)} />}

      {/* ── SIGNUP CARD ── */}
      <div className="page">
        <div className="card" role="main" aria-label="Sign Up">

          <div className="topRow">
            <div className="brand">
              <div className="brandLogo" title="DENR">
                <Image src="/images/denr.png" alt="DENR Logo" width={36} height={36} style={{ objectFit:"contain" }} />
              </div>
              <div className="brandTxt">
                <div className="brandTitle">One Control Map</div>
                <div className="brandSub">PENRO Cagayan</div>
              </div>
            </div>
            <button
              className="iconMiniBtn" type="button"
              onClick={() => setDarkMode(v => !v)}
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          </div>

          <div className="header">
            <h1 className="formTitle">Create Account</h1>
            <div className="formSub">Register to access the map platform.</div>
          </div>

          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="username">Username</label>
              <div className="inputWrap">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity:.45, flexShrink:0 }}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                <input id="username" type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. jdelacruz" autoComplete="username" />
              </div>
            </div>

            <div className="field">
              <label htmlFor="email">Email</label>
              <div className="inputWrap">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity:.45, flexShrink:0 }}>
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
                <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
              </div>
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="inputWrap">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity:.45, flexShrink:0 }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input id="password" type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters" autoComplete="new-password" />
                <button className="iconMiniBtn" type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? "Hide" : "Show"}>
                  <EyeIcon open={showPw} />
                </button>
              </div>
              {password.length > 0 && password.length < 6 && (
                <div className="hint">Password must be at least 6 characters.</div>
              )}
            </div>

            <div className="field">
              <label htmlFor="confirm">Confirm Password</label>
              <div className={`inputWrap ${confirm.length > 0 && confirm !== password ? "error" : ""}`}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity:.45, flexShrink:0 }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <input id="confirm" type={showCf ? "text" : "password"} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" autoComplete="new-password" />
                <button className="iconMiniBtn" type="button" onClick={() => setShowCf(v => !v)} aria-label={showCf ? "Hide" : "Show"}>
                  <EyeIcon open={showCf} />
                </button>
              </div>
              {confirm.length > 0 && confirm !== password && (
                <div className="hint">Passwords do not match.</div>
              )}
            </div>

            <button className="btn btnPrimary" disabled={!canSubmit || busy} type="submit">
              {busy ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation:"spin .75s linear infinite" }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  Creating account…
                </>
              ) : <strong>Sign Up</strong>}
            </button>
          </form>

          <a className="backLink" href="/login">← Back to Login</a>

          <div className="help">
            <span>© DENR · PENRO Cagayan</span>
            <span className="devCredit">
              Developed by{" "}
              <a href="https://www.facebook.com/arnold.mendoza.5283166/directory_privacy_and_legal_info" target="_blank" rel="noopener noreferrer">
                Arnold G. Mendoza
              </a>
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}
