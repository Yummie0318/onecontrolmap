"use client";

import dynamic from "next/dynamic";

const ResultMap = dynamic(() => import("./ResultMap"), {
  ssr: false,
  loading: () => (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          background: "#fff",
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          color: "#111",
          fontSize: 14,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "2px solid rgba(0,0,0,.15)",
            borderTopColor: "#111",
            animation: "spin .9s linear infinite",
          }}
        />
        <div style={{ fontWeight: 600 }}>Loading map…</div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  ),
});

export default ResultMap;
