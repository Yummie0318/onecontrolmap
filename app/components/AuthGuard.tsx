"use client";

import { useEffect, useState } from "react";

const SESSION_MS = 5 * 60 * 1000; // must match login page

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    try {
      const loggedIn = localStorage.getItem("is_logged_in") === "1";
      const user     = localStorage.getItem("auth_user");
      const loginTime = Number(localStorage.getItem("login_time") || "0");

      if (!loggedIn || !user || !loginTime) {
        window.location.replace("/login");
        return;
      }

      const age = Date.now() - loginTime;
      if (age >= SESSION_MS) {
        // Clear stale session
        localStorage.removeItem("auth_user");
        localStorage.removeItem("is_logged_in");
        localStorage.removeItem("login_time");
        localStorage.removeItem("remember_me");
        window.location.replace("/login?reason=expired");
        return;
      }

      setChecking(false);
    } catch {
      window.location.replace("/login");
    }
  }, []);

  if (checking) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b1220",
        color: "rgba(230,237,243,0.5)",
        fontSize: "13px",
        fontWeight: 600,
        fontFamily: "sans-serif",
        gap: "10px"
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        Checking session…
      </div>
    );
  }

  return <>{children}</>;
}