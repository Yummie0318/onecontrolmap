"use client";

import { useEffect } from "react";

const SESSION_MS = 5 * 60 * 1000; // 5 minutes

function logout(reason: "expired" | "logout" = "expired") {
  try {
    localStorage.removeItem("auth_user");
    localStorage.removeItem("is_logged_in");
    localStorage.removeItem("login_time");
    localStorage.removeItem("remember_me");
  } catch {}
  window.location.href = `/login?reason=${reason}`;
}

export default function AutoLogout() {
  useEffect(() => {
    let timer: any;

    const checkExpired = () => {
      const loggedIn = localStorage.getItem("is_logged_in") === "1";
      const loginTime = Number(localStorage.getItem("login_time") || "0");

      if (!loggedIn || !loginTime) {
        logout("expired");
        return;
      }

      const age = Date.now() - loginTime;
      if (age >= SESSION_MS) {
        logout("expired");
      }
    };

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => logout("expired"), SESSION_MS);
    };

    // initial checks
    checkExpired();
    resetTimer();

    // reset on activity
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true } as any));

    // also check every 10s (covers “no activity but tab open”)
    const interval = window.setInterval(checkExpired, 10_000);

    return () => {
      clearTimeout(timer);
      window.clearInterval(interval);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer as any));
    };
  }, []);

  return null;
}