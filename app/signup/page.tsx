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

  // ✅ Read theme from localStorage on mount (syncs with login page)
  useEffect(() => {
    const saved = localStorage.getItem("theme") === "dark";
    setDarkMode(saved);
    document.documentElement.setAttribute("data-theme", saved ? "dark" : "light");
  }, []);

  // ✅ Persist theme change
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

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
    <div className="page">
      <style>{`
        :root{
          --bg0:#ffffff; --bg1:#f6f8fb;
          --text:#0b1220; --muted:rgba(11,18,32,.60);
          --stroke:rgba(11,18,32,.10); --stroke2:rgba(11,18,32,.18);
          --shadow2:0 30px 90px rgba(11,18,32,.14);
          --primary:#0f7a3a;
          --primaryBg:rgba(15,122,58,.12);
        }

        /* ✅ Dark mode variables — identical to login page */
        [data-theme="dark"] {
          --bg0:#0d1117;
          --bg1:#161b22;
          --text:#e6edf3;
          --muted:rgba(230,237,243,.55);
          --stroke:rgba(230,237,243,.10);
          --stroke2:rgba(230,237,243,.18);
          --shadow2:0 30px 90px rgba(0,0,0,.50);
          --primaryBg:rgba(15,122,58,.18);
        }

        [data-theme="dark"] body {
          background:
            radial-gradient(900px 560px at 12% 0%, rgba(15,122,58,.10), transparent 60%),
            radial-gradient(900px 560px at 88% 18%, rgba(17,102,204,.10), transparent 60%),
            linear-gradient(180deg, var(--bg0), var(--bg1));
        }

        [data-theme="dark"] .card {
          background: rgba(22,27,34,.92);
          border-color: rgba(230,237,243,.10);
        }

        [data-theme="dark"] .brandTitle { color: rgba(230,237,243,.92); }
        [data-theme="dark"] .brandSub   { color: rgba(230,237,243,.52); }

        [data-theme="dark"] .brandLogo {
          background: #ffffff;
          border-color: rgba(230,237,243,.10);
        }

        [data-theme="dark"] .formTitle { color: rgba(230,237,243,.92); }
        [data-theme="dark"] .formSub   { color: rgba(230,237,243,.52); }

        [data-theme="dark"] label { color: rgba(230,237,243,.72); }

        [data-theme="dark"] .inputWrap {
          background: rgba(13,17,23,.60);
          border-color: rgba(230,237,243,.10);
        }
        [data-theme="dark"] .inputWrap:focus-within {
          border-color: rgba(15,122,58,.40);
          box-shadow: 0 0 0 5px rgba(15,122,58,.12);
        }
        [data-theme="dark"] .inputWrap.error {
          border-color: rgba(217,45,32,.50);
          box-shadow: 0 0 0 5px rgba(217,45,32,.10);
        }

        [data-theme="dark"] input { color: rgba(230,237,243,.92); }
        [data-theme="dark"] input::placeholder { color: rgba(230,237,243,.28); }

        [data-theme="dark"] .iconMiniBtn {
          background: rgba(22,27,34,.92);
          border-color: rgba(230,237,243,.10);
          color: rgba(230,237,243,.70);
        }
        [data-theme="dark"] .iconMiniBtn:hover {
          border-color: rgba(230,237,243,.20);
          box-shadow: 0 12px 28px rgba(0,0,0,.30);
        }

        [data-theme="dark"] .btn {
          background: rgba(22,27,34,.92);
          border-color: rgba(230,237,243,.10);
          color: rgba(230,237,243,.88);
        }
        [data-theme="dark"] .btnPrimary {
          border-color: rgba(15,122,58,.30);
          background: linear-gradient(180deg, rgba(15,122,58,.16), rgba(22,27,34,.92));
        }

        [data-theme="dark"] .backLink {
          color: rgba(230,237,243,.45);
          border-top-color: rgba(230,237,243,.08);
        }
        [data-theme="dark"] .backLink:hover { color: #3fb96e; }

        [data-theme="dark"] .help      { color: rgba(230,237,243,.35); }
        [data-theme="dark"] .devCredit { color: rgba(230,237,243,.25); }

        [data-theme="dark"] .toast {
          background: rgba(22,27,34,.96);
          border-color: rgba(230,237,243,.10);
          color: rgba(230,237,243,.88);
        }
        [data-theme="dark"] .toastTitle { color: rgba(230,237,243,.92); }
        [data-theme="dark"] .toastMsg   { color: rgba(230,237,243,.52); }
        [data-theme="dark"] .toastX     { color: rgba(230,237,243,.60); }
        [data-theme="dark"] .toastX:hover { background: rgba(230,237,243,.08); }

        html,body{ height:100%; margin:0; }
        body{
          color: var(--text);
          background:
            radial-gradient(900px 560px at 12% 0%, rgba(15,122,58,.12), transparent 60%),
            radial-gradient(900px 560px at 88% 18%, rgba(17,102,204,.10), transparent 60%),
            linear-gradient(180deg, var(--bg0), var(--bg1));
        }
        *{ box-sizing:border-box; }
        ::selection{ background: rgba(15,122,58,.18); }

        .page{ min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px 14px; }

        .card{
          width:min(520px,100%); border:1px solid var(--stroke);
          background:rgba(255,255,255,.90); backdrop-filter:blur(18px);
          box-shadow:var(--shadow2); border-radius:26px; overflow:hidden; padding:22px;
        }

        .topRow{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }

        .brand{ display:flex; align-items:center; gap:10px; min-width:0; }

        .brandLogo{
          width:48px; height:48px; border-radius:14px; border:1px solid rgba(11,18,32,.10);
          background:#ffffff; box-shadow:0 14px 34px rgba(11,18,32,.10);
          display:flex; align-items:center; justify-content:center; overflow:hidden; flex:0 0 auto;
        }
        .brandTxt{ min-width:0; display:flex; flex-direction:column; line-height:1.15; }
        .brandTitle{ font-size:13px; font-weight:850; letter-spacing:-.2px; }
        .brandSub{ font-size:11px; font-weight:600; color:var(--muted); }

        .formTitle{ font-size:18px; font-weight:900; letter-spacing:-0.35px; margin:0 0 4px; }
        .formSub{ font-size:12px; font-weight:600; color:rgba(11,18,32,.62); margin-bottom:4px; }

        .field{ display:flex; flex-direction:column; gap:6px; margin-top:12px; }
        label{ font-size:12px; font-weight:750; color:rgba(11,18,32,.78); }

        .inputWrap{
          display:flex; align-items:center; gap:10px; padding:10px 12px;
          border-radius:16px; border:1px solid var(--stroke);
          background:rgba(255,255,255,.94);
          transition:box-shadow .15s, border-color .15s;
        }
        .inputWrap:focus-within{ border-color:rgba(15,122,58,.35); box-shadow:0 0 0 5px rgba(15,122,58,.10); }
        .inputWrap.error{ border-color:rgba(217,45,32,.40); box-shadow:0 0 0 5px rgba(217,45,32,.08); }

        input{ width:100%; border:0; outline:0; background:transparent; color:var(--text); font-size:13px; font-weight:650; }
        input::placeholder{ color:rgba(11,18,32,.42); font-weight:550; }

        .hint{ font-size:11px; font-weight:600; color:rgba(217,45,32,.80); margin-top:2px; }

        .iconMiniBtn{
          width:36px; height:36px; display:flex; align-items:center; justify-content:center;
          border-radius:12px; border:1px solid rgba(11,18,32,.10); background:rgba(255,255,255,.92);
          cursor:pointer; transition:transform .10s, box-shadow .15s; color:rgba(11,18,32,.78);
        }
        .iconMiniBtn:hover{ transform:translateY(-1px); box-shadow:0 12px 28px rgba(11,18,32,.10); }
        .iconMiniBtn:active{ transform:translateY(0); }

        .btn{
          border:1px solid var(--stroke); background:rgba(255,255,255,.92); color:var(--text);
          font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:10px;
          transition:transform .10s, box-shadow .15s; padding:10px 12px;
          border-radius:16px; font-size:13px; justify-content:center; width:100%; margin-top:14px;
        }
        .btn:hover{ box-shadow:0 12px 28px rgba(11,18,32,.10); transform:translateY(-1px); }
        .btn:active{ transform:translateY(0); }
        .btn[disabled]{ opacity:.55; cursor:not-allowed; transform:none; box-shadow:none; }
        .btnPrimary{ border-color:rgba(15,122,58,.26); background:linear-gradient(180deg,rgba(15,122,58,.12),rgba(255,255,255,.92)); }

        .backLink{
          display:block; text-align:center; margin-top:12px; font-size:12px;
          font-weight:700; color:rgba(11,18,32,.55); text-decoration:none;
          padding-top:12px; border-top:1px solid rgba(11,18,32,.08);
          transition:color .15s;
        }
        .backLink:hover{ color:var(--primary); }

        .help{ margin-top:12px; font-size:12px; color:#777; text-align:center; }
        .devCredit{ font-size:11px; color:#aaa; }
        .devCredit a{ color:inherit; text-decoration:none; }
        .devCredit a:hover{ text-decoration:underline; }

        .toast{
          position:fixed; top:14px; left:50%; transform:translateX(-50%); z-index:65000;
          width:min(520px,calc(100vw - 20px)); padding:10px 12px; border-radius:999px;
          border:1px solid var(--stroke); background:rgba(255,255,255,.92);
          box-shadow:0 18px 52px rgba(11,18,32,.14); display:flex; align-items:center;
          gap:10px; backdrop-filter:blur(14px);
        }
        .toastDot{ width:10px; height:10px; border-radius:999px; border:1px solid rgba(11,18,32,.16); background:rgba(11,18,32,.08); box-shadow:0 0 0 8px rgba(11,18,32,.04); }
        .toast.success .toastDot{ background:rgba(18,161,80,.70); box-shadow:0 0 0 8px rgba(18,161,80,.14); border-color:rgba(18,161,80,.28); }
        .toast.error   .toastDot{ background:rgba(217,45,32,.70); box-shadow:0 0 0 8px rgba(217,45,32,.14); border-color:rgba(217,45,32,.28); }
        .toast.info    .toastDot{ background:rgba(17,102,204,.70); box-shadow:0 0 0 8px rgba(17,102,204,.14); border-color:rgba(17,102,204,.28); }
        .toastText{ min-width:0; display:flex; flex-direction:column; gap:1px; }
        .toastTitle{ font-size:12px; font-weight:800; }
        .toastMsg{ font-size:12px; font-weight:650; color:rgba(11,18,32,.62); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .toastX{ margin-left:auto; border:0; background:transparent; cursor:pointer; width:34px; height:34px; border-radius:999px; display:flex; align-items:center; justify-content:center; color:rgba(11,18,32,.70); }
        .toastX:hover{ background:rgba(11,18,32,.06); }

        @media (max-width:420px){ .card{ padding:18px; border-radius:22px; } }
      `}</style>

      {toast && <Toast kind={toast.kind} title={toast.title} message={toast.message} onClose={() => setToast(null)} />}

      <div className="card" role="main" aria-label="Sign Up">
        <div className="topRow">
          <div className="brand">
            <div className="brandLogo" title="DENR">
              <Image src="/images/denr.png" alt="DENR Logo" width={34} height={34} style={{ objectFit: "contain" }} />
            </div>
            <div className="brandTxt">
              <div className="brandTitle">One Control Map</div>
              <div className="brandSub">PENRO Cagayan</div>
            </div>
          </div>

          {/* ✅ Dark mode toggle — same as login */}
          <button
            className="iconMiniBtn"
            type="button"
            onClick={() => setDarkMode(v => !v)}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {darkMode ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
        </div>

        <div className="formTitle">Create Account</div>
        <div className="formSub">Register to access the system.</div>

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <div className="inputWrap">
              <input id="username" type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. jdelacruz" autoComplete="username" />
            </div>
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <div className="inputWrap">
              <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </div>
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="inputWrap">
              <input
                id="password" type={showPw ? "text" : "password"}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters" autoComplete="new-password"
              />
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
              <input
                id="confirm" type={showCf ? "text" : "password"}
                value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter password" autoComplete="new-password"
              />
              <button className="iconMiniBtn" type="button" onClick={() => setShowCf(v => !v)} aria-label={showCf ? "Hide" : "Show"}>
                <EyeIcon open={showCf} />
              </button>
            </div>
            {confirm.length > 0 && confirm !== password && (
              <div className="hint">Passwords do not match.</div>
            )}
          </div>

          <button className="btn btnPrimary" disabled={!canSubmit || busy} type="submit">
            {busy ? "Creating account…" : <strong>Sign Up</strong>}
          </button>
        </form>

        <a className="backLink" href="/login">← Back to Login</a>

        <div className="help">
          <span>© DENR</span><br />
          <span className="devCredit">
            Developed by{" "}
            <a href="https://www.facebook.com/arnold.mendoza.5283166/directory_privacy_and_legal_info" target="_blank" rel="noopener noreferrer">
              Arnold G. Mendoza
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}