"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";

type ToastKind = "success" | "error" | "info";

const SESSION_MS = 5 * 60 * 1000;

function cx(...cls: Array<string | false | null | undefined>) {
  return cls.filter(Boolean).join(" ");
}

function Toast({
  kind, title, message, onClose,
}: {
  kind: ToastKind; title: string; message?: string; onClose: () => void;
}) {
  return (
    <div className={cx("toast", kind)} role="status" aria-live="polite">
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

type ApiLoginResp =
  | { ok: true; user: { id: number; username: string; email: string; usertype: string } }
  | { ok: false; error: string };

function doLogout(redirectReason: "expired" | "logout" = "logout") {
  try {
    localStorage.removeItem("auth_user");
    localStorage.removeItem("is_logged_in");
    localStorage.removeItem("login_time");
    localStorage.removeItem("remember_me");
  } catch {}
  window.location.href = `/login?reason=${redirectReason}`;
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: ToastKind; title: string; message?: string } | null>(null);
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

  // ── Leaflet map background centered on Cagayan, PH ───────────────────────
  useEffect(() => {
    // Load Leaflet CSS
    const existingLink = document.getElementById("leaflet-css");
    if (!existingLink) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    function initMap() {
      const L = (window as any).L;
      if (!L) return;

      const container = document.getElementById("loginMapBg");
      if (!container) return;

      // destroy previous instance if any
      if ((container as any)._leaflet_id) {
        try { (container as any)._mapInstance?.remove(); } catch {}
        (container as any)._leaflet_id = undefined;
      }

      const map = L.map("loginMapBg", {
        center: [17.6132, 121.7270], // Cagayan, Northern Luzon
        zoom: 8,
        zoomControl: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        dragging: false,
        touchZoom: false,
        keyboard: false,
        attributionControl: false,
      });

      // CartoDB Dark Matter — no API key needed
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { subdomains: "abcd", maxZoom: 19 }
      ).addTo(map);

      // Glowing green dot marker icon
      const glowIcon = L.divIcon({
        className: "",
        html: `
          <div style="position:relative;width:14px;height:14px;">
            <div style="
              position:absolute;inset:0;border-radius:50%;
              background:rgba(15,122,58,0.9);
              box-shadow:0 0 0 3px rgba(15,122,58,0.25),0 0 16px rgba(15,122,58,0.7);
              animation:leafletPinPulse 3s ease-out infinite;
            "></div>
            <div style="
              position:absolute;top:50%;left:50%;
              transform:translate(-50%,-50%);
              width:5px;height:5px;border-radius:50%;background:#fff;
            "></div>
          </div>
        `,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      // Real Cagayan province municipality coordinates
      const locations: [number, number][] = [
        [18.3515, 121.8070], // Tuguegarao City (capital)
        [18.0667, 122.0833], // Aparri
        [17.9472, 121.8152], // Solana
        [17.6132, 121.7270], // Amulung
        [17.4333, 121.6333], // Enrile
        [18.2333, 121.6333], // Abulug
        [17.8000, 121.9000], // Gattaran
        [18.1500, 121.9500], // Lasam
      ];

      locations.forEach(([lat, lng]) => {
        L.marker([lat, lng], { icon: glowIcon }).addTo(map);
      });

      (container as any)._mapInstance = map;
      (container as any)._mapCleanup = () => {
        map.remove();
      };
    }

    const existingScript = document.getElementById("leaflet-js");
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
      const container = document.getElementById("loginMapBg");
      if (container && (container as any)._mapCleanup) {
        (container as any)._mapCleanup();
      }
    };
  }, []);

  useEffect(() => {
    try {
      const loggedIn = localStorage.getItem("is_logged_in") === "1";
      const u = localStorage.getItem("auth_user");
      const loginTime = Number(localStorage.getItem("login_time") || "0");
      if (loggedIn && u) {
        const age = Date.now() - loginTime;
        if (!loginTime || age >= SESSION_MS) { doLogout("expired"); return; }
        window.location.href = "/admin/layers";
        return;
      }
    } catch {}
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason");
    if (reason === "expired") setToast({ kind: "info", title: "Session expired", message: "Please login again." });
    if (reason === "logout") setToast({ kind: "success", title: "Logged out", message: "You are now signed out." });
  }, []);

  const canSubmit = useMemo(() => {
    if (!username.trim()) return false;
    if (!password.trim()) return false;
    return true;
  }, [username, password]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setToast(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await res.json()) as ApiLoginResp;
      if (!data.ok) {
        setToast({ kind: "error", title: "Login failed", message: data.error || "Invalid credentials." });
        setBusy(false);
        return;
      }
      localStorage.setItem("auth_user", JSON.stringify(data.user));
      localStorage.setItem("is_logged_in", "1");
      localStorage.setItem("login_time", Date.now().toString());
      localStorage.setItem("remember_me", remember ? "1" : "0");
      setToast({ kind: "success", title: "Welcome", message: `Logged in as ${data.user.username}` });
      window.location.href = "/viewmap";
    } catch (err: any) {
      setToast({ kind: "error", title: "Network error", message: err?.message ?? "Please try again." });
      setBusy(false);
    }
  }

  function goSignup() { window.location.href = "/signup"; }

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

        /* ── MAP BG ── */
        .mapBg{ position:fixed; inset:0; z-index:0; overflow:hidden; }
        .leaflet-control-attribution{ display:none !important; }

        /* Leaflet marker pulse animation */
        @keyframes leafletPinPulse{
          0%,100%{ box-shadow:0 0 0 3px rgba(15,122,58,.25),0 0 16px rgba(15,122,58,.7); }
          50%{ box-shadow:0 0 0 10px rgba(15,122,58,0),0 0 22px rgba(15,122,58,.4); }
        }

        /* dark vignette overlay over the map */
        .mapOverlay{
          position:absolute; inset:0; z-index:2; pointer-events:none;
          background:
            radial-gradient(ellipse 70% 60% at 50% 50%, rgba(6,15,36,.45) 0%, rgba(6,15,36,.78) 100%),
            linear-gradient(180deg, rgba(6,15,36,.55) 0%, rgba(6,15,36,.30) 50%, rgba(6,15,36,.65) 100%);
        }

        /* ── GRID ── */
        .gridOverlay{
          position:absolute; inset:0; z-index:3; pointer-events:none;
          background-image:
            linear-gradient(rgba(59,130,246,.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,.05) 1px, transparent 1px);
          background-size:52px 52px;
          animation:gridDrift 35s linear infinite;
        }
        @keyframes gridDrift{ 0%{background-position:0 0} 100%{background-position:52px 52px} }

        /* ── SCAN LINE ── */
        .scanLine{
          position:absolute; left:0; right:0; height:2px; z-index:4; pointer-events:none;
          background:linear-gradient(90deg,transparent,rgba(59,130,246,.30),rgba(15,122,58,.45),rgba(59,130,246,.30),transparent);
          animation:scan 8s ease-in-out infinite;
        }
        @keyframes scan{
          0%{top:-2px;opacity:0} 5%{opacity:1} 95%{opacity:.7} 100%{top:100%;opacity:0}
        }

        /* ── GLOW BLOBS ── */
        .glowBlob{
          position:absolute; border-radius:50%; filter:blur(90px);
          animation:blobFloat ease-in-out infinite alternate; pointer-events:none; z-index:3;
        }
        @keyframes blobFloat{
          0%{transform:translate(0,0) scale(1)}
          100%{transform:translate(28px,-28px) scale(1.07)}
        }

        /* ── PARTICLES ── */
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

        /* ── SVG ROUTE LINES ── */
        .mapLine{ stroke:#3b82f6; stroke-width:1; fill:none; stroke-dasharray:8 6; animation:dashMove 14s linear infinite; }
        .mapLine2{ stroke:#0f7a3a; stroke-width:1.2; fill:none; stroke-dasharray:5 8; animation:dashMove2 20s linear infinite; }
        @keyframes dashMove{ to{stroke-dashoffset:-70} }
        @keyframes dashMove2{ to{stroke-dashoffset:90} }

        /* ── PAGE ── */
        .page{
          min-height:100vh; display:flex; align-items:center; justify-content:center;
          padding:24px 14px; position:relative; z-index:10;
        }

        /* ── CARD ── */
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
        .brandTitle{ font-size:13px; font-weight:850; letter-spacing:-.2px; color:#e8f0fe; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .brandSub{ font-size:11px; font-weight:600; color:rgba(232,240,254,.48); white-space:nowrap; }
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
        input{ width:100%; border:0; outline:0; background:transparent; color:#e8f0fe; font-size:13px; font-weight:650; }
        input::placeholder{ color:rgba(232,240,254,.25); font-weight:500; }
        [data-theme="light"] .inputWrap{ background:rgba(255,255,255,.92); border-color:rgba(11,18,32,.10); }
        [data-theme="light"] .inputWrap:focus-within{ border-color:rgba(15,122,58,.35); box-shadow:0 0 0 4px rgba(15,122,58,.10); }
        [data-theme="light"] input{ color:#0b1220; }
        [data-theme="light"] input::placeholder{ color:rgba(11,18,32,.35); }

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

        .row2{ margin-top:13px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .check{ display:flex; align-items:center; gap:8px; font-size:12px; font-weight:650; color:rgba(232,240,254,.50); user-select:none; cursor:pointer; }
        .check input{ width:15px; height:15px; accent-color:var(--primary); cursor:pointer; }
        [data-theme="light"] .check{ color:rgba(11,18,32,.65); }

        .btn{
          border:1px solid rgba(232,240,254,.10); background:rgba(255,255,255,.06); color:#e8f0fe;
          font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:10px;
          user-select:none; transition:transform .10s ease,border-color .15s ease,box-shadow .15s ease,background .15s ease;
          padding:12px 14px; border-radius:14px; font-size:13px; justify-content:center;
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
        .btnWide{ width:100%; margin-top:10px; }

        [data-theme="light"] .btn{ background:rgba(255,255,255,.92); border-color:rgba(11,18,32,.10); color:#0b1220; }
        [data-theme="light"] .btnPrimary{ border-color:rgba(15,122,58,.26); background:linear-gradient(180deg,rgba(15,122,58,.12),rgba(255,255,255,.92)); color:#0a5428; }

        .help{
          margin-top:16px; padding-top:12px; border-top:1px solid rgba(232,240,254,.07);
          font-size:11.5px; font-weight:600; color:rgba(232,240,254,.30);
          display:flex; flex-direction:column; gap:4px; text-align:center;
        }
        [data-theme="light"] .help{ border-top-color:rgba(11,18,32,.08); color:rgba(11,18,32,.52); }
        .devCredit{ font-size:11px; color:rgba(232,240,254,.22); }
        .devCredit a{ color:inherit; text-decoration:none; }
        .devCredit a:hover{ text-decoration:underline; }
        [data-theme="light"] .devCredit{ color:rgba(11,18,32,.38); }

        /* ── TOAST ── */
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
        .toast.error .toastDot{ background:rgba(217,45,32,.85); box-shadow:0 0 0 6px rgba(217,45,32,.15); }
        .toast.info .toastDot{ background:rgba(59,130,246,.85); box-shadow:0 0 0 6px rgba(59,130,246,.15); }
        .toastText{ min-width:0; display:flex; flex-direction:column; gap:1px; }
        .toastTitle{ font-size:12px; font-weight:800; color:#e8f0fe; }
        .toastMsg{ font-size:11.5px; font-weight:600; color:rgba(232,240,254,.52); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .toastX{ margin-left:auto; border:0; background:transparent; cursor:pointer; width:30px; height:30px; border-radius:999px; display:flex; align-items:center; justify-content:center; color:rgba(232,240,254,.55); font-size:13px; }
        .toastX:hover{ background:rgba(232,240,254,.08); }

        @media (max-width:420px){ .card{ padding:18px; border-radius:20px; } }
        @keyframes spin{ to{ transform:rotate(360deg); } }
      `}</style>

      {/* ── MAP BACKGROUND ───────────────────────────────────────── */}
      <div className="mapBg">

        {/* Leaflet map — renders real Cagayan PH tiles with geo-anchored markers */}
        <div id="loginMapBg" style={{ position:"absolute", inset:0, width:"100%", height:"100%", zIndex:1 }} />

        {/* Dark vignette */}
        <div className="mapOverlay" />

        {/* Animated grid */}
        <div className="gridOverlay" />

        {/* Scan line */}
        <div className="scanLine" />

        {/* Glow blobs */}
        <div className="glowBlob" style={{ width:550, height:550, top:"-12%", left:"-6%", background:"rgba(15,122,58,.13)", animationDuration:"13s" }} />
        <div className="glowBlob" style={{ width:450, height:450, bottom:"-8%", right:"-4%", background:"rgba(59,130,246,.10)", animationDuration:"16s", animationDelay:"-5s" }} />
        <div className="glowBlob" style={{ width:280, height:280, top:"38%", left:"52%", background:"rgba(59,130,246,.07)", animationDuration:"11s", animationDelay:"-8s" }} />

        {/* Floating particles */}
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="particle" style={{
            width: 2 + Math.sin(i * 1.9) * 2,
            height: 2 + Math.sin(i * 1.9) * 2,
            left: `${(i * 6 + 6) % 93}%`,
            bottom: `${(i * 8 + 4) % 25}%`,
            animationDuration: `${9 + i * 1.2}s`,
            animationDelay: `${i * 0.65}s`,
            opacity: 0.3 + Math.sin(i) * 0.2,
            zIndex: 5,
          }} />
        ))}

        {/* Animated SVG route lines */}
        <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:.20, zIndex:5, pointerEvents:"none" }} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <style>{`
              .mapLine{ stroke:#3b82f6; stroke-width:1; fill:none; stroke-dasharray:8 6; animation:dashMove 14s linear infinite; }
              .mapLine2{ stroke:#0f7a3a; stroke-width:1.2; fill:none; stroke-dasharray:5 8; animation:dashMove2 20s linear infinite; }
              @keyframes dashMove{ to{stroke-dashoffset:-70} }
              @keyframes dashMove2{ to{stroke-dashoffset:90} }
            `}</style>
          </defs>
          {[12, 25, 38, 52, 65, 78].map((y, i) => (
            <line key={`h${i}`} className="mapLine" x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`} style={{ animationDelay:`${i * -2.3}s` }} />
          ))}
          {[8, 20, 33, 47, 60, 73, 86].map((x, i) => (
            <line key={`v${i}`} className="mapLine2" x1={`${x}%`} y1="0" x2={`${x}%`} y2="100%" style={{ animationDelay:`${i * -1.8}s` }} />
          ))}
        </svg>
      </div>

      {/* ── TOAST ── */}
      {toast ? <Toast kind={toast.kind} title={toast.title} message={toast.message} onClose={() => setToast(null)} /> : null}

      {/* ── LOGIN CARD ── */}
      <div className="page">
        <div className="card" role="main" aria-label="Login">

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
              onClick={() => setDarkMode((v) => !v)}
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
            <h1 className="formTitle">Sign In</h1>
            <div className="formSub">Enter your credentials to access the map platform.</div>
          </div>

          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="username">Username</label>
              <div className="inputWrap">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity:.45, flexShrink:0 }}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username" autoComplete="username" />
              </div>
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="inputWrap">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity:.45, flexShrink:0 }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input id="password" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
                <button className="iconMiniBtn" type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}>
                  <EyeIcon open={showPw} />
                </button>
              </div>
            </div>

            <div className="row2">
              <label className="check">
                <input checked={remember} onChange={(e) => setRemember(e.target.checked)} type="checkbox" />
                Remember me
              </label>
            </div>

            <button className="btn btnPrimary btnWide" disabled={!canSubmit || busy} type="submit">
              {busy ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation:"spin .75s linear infinite" }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  Signing in…
                </>
              ) : <strong>Sign In</strong>}
            </button>

            <button className="btn btnWide" type="button" onClick={goSignup} disabled={busy}>
              Create Account
            </button>

            <div className="help">
              <span>© DENR · PENRO Cagayan</span>
              <span className="devCredit">
                Developed by{" "}
                <a href="https://www.facebook.com/arnold.mendoza.5283166/directory_privacy_and_legal_info" target="_blank" rel="noopener noreferrer">
                  Arnold G. Mendoza
                </a>
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
