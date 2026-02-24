"use client";

import { useEffect } from "react";

const SESSION_MS = 5 * 60 * 1000; // 5 minutes
const ACTIVITY_KEY = "last_activity";

function logout(reason: "expired" | "logout" = "expired") {
  try {
    localStorage.removeItem("auth_user");
    localStorage.removeItem("is_logged_in");
    localStorage.removeItem("login_time");
    localStorage.removeItem("remember_me");
    localStorage.removeItem(ACTIVITY_KEY);
  } catch {}
  window.location.href = `/login?reason=${reason}`;
}

export default function AutoLogout() {
  useEffect(() => {
    let timer: any;

    const isLoggedIn = () => localStorage.getItem("is_logged_in") === "1";

    const touch = () => {
      try {
        localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
      } catch {}
    };

    const getLast = () => {
      const v = Number(localStorage.getItem(ACTIVITY_KEY) || "0");
      return v || 0;
    };

    const checkExpired = () => {
      if (!isLoggedIn()) {
        logout("expired");
        return;
      }

      const last = getLast();
      if (!last) {
        // first time on page after login
        touch();
        return;
      }

      const idle = Date.now() - last;
      if (idle >= SESSION_MS) logout("expired");
    };

    const resetTimer = () => {
      touch(); // ✅ update last activity
      clearTimeout(timer);

      // ✅ logout after SESSION_MS of inactivity
      timer = setTimeout(() => {
        checkExpired(); // checks idle based on last_activity
      }, SESSION_MS);
    };

    // initial
    resetTimer();
    checkExpired();

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    const onActivity = () => resetTimer();

    events.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true } as any));

    const interval = window.setInterval(checkExpired, 10_000);

    return () => {
      clearTimeout(timer);
      window.clearInterval(interval);
      events.forEach((ev) => window.removeEventListener(ev, onActivity as any));
    };
  }, []);

  return null;
}