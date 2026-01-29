"use client";

import { useMemo, useState } from "react";
import ResultMap from "../components/ResultMapClient";

type Plan = {
  layerName: string;
  filters: Array<{ field: string; op: string; value: any }>;
  limit: number;
  orderBy?: { field: string; direction: "asc" | "desc" } | null;
  aggregate?: { type: "count" | "sum" | "avg" | "min" | "max"; field?: string } | null;
  explanation?: string | null;
};

type Stats =
  | { featureCount?: number }
  | { aggregate?: { type: string; field?: string }; value?: number | null }
  | null;

function ThinkingModal({ open, text }: { open: boolean; text: string }) {
  if (!open) return null;
  return (
    <div className="overlay" role="status" aria-live="polite">
      <div className="modal">
        <div className="spinner" />
        <div className="modalText">
          <div className="modalTitle">Generating your request…</div>
          <div className="modalSub">{text}</div>
        </div>
      </div>

      <style>{`
        .overlay{
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,.30);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 18px;
        }
        .modal{
          width: min(520px, 94vw);
          background: #fff;
          border: 1px solid #e7e7e7;
          border-radius: 16px;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 30px 120px rgba(0,0,0,.18);
        }
        .spinner{
          width: 44px;
          height: 44px;
          border-radius: 999px;
          border: 2px solid rgba(0,0,0,.12);
          border-top-color: rgba(0,0,0,.75);
          animation: spin .9s linear infinite;
          flex: 0 0 auto;
        }
        @keyframes spin{ to { transform: rotate(360deg); } }
        .modalText{
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .modalTitle{
          font-weight: 900;
          letter-spacing: -.02em;
          color: #111;
        }
        .modalSub{
          font-size: 13px;
          color: #444;
          line-height: 1.35;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 420px;
        }
      `}</style>
    </div>
  );
}

export default function AiMapPage() {
  const [message, setMessage] = useState("show cbfma");
  const [loading, setLoading] = useState(false);
  const [thinkingText, setThinkingText] = useState("Reading your query…");

  const [plan, setPlan] = useState<Plan | null>(null);
  const [geojson, setGeojson] = useState<any | null>(null);
  const [stats, setStats] = useState<Stats>(null);
  const [layerPicked, setLayerPicked] = useState<string[] | null>(null);

  const [error, setError] = useState<string>("");
  const [debug, setDebug] = useState<any | null>(null);

  const featureCount = useMemo(() => {
    if (stats && "featureCount" in stats) return stats.featureCount ?? 0;
    return geojson?.features?.length ?? 0;
  }, [geojson, stats]);

  // ✅ show map ONLY when geojson exists (even if 0 features, still show basemap)
  const showMap = geojson !== null;

  async function runQuery() {
    const q = message.trim();
    if (!q || loading) return;

    setLoading(true);
    setThinkingText("Understanding your request…");
    setError("");
    setDebug(null);

    // ✅ hide map while searching again
    setPlan(null);
    setGeojson(null);
    setStats(null);
    setLayerPicked(null);

    try {
      // 1) AI plan
      setThinkingText("Planning the query (AI)…");
      const r1 = await fetch("/api/ai/map-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const j1 = await r1.json();

      if (!j1.ok) {
        setDebug(j1);
        throw new Error(j1.error || "AI planning failed");
      }

      setPlan(j1.plan);

      if (typeof j1.thinking_text === "string" && j1.thinking_text.trim()) {
        setThinkingText(j1.thinking_text.trim());
      } else {
        setThinkingText("Preparing GeoJSON…");
      }

      // 2) Run plan
      setThinkingText("Fetching GeoJSON and preparing the map…");
      const r2 = await fetch("/api/map/run-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: j1.plan }),
      });
      const j2 = await r2.json();

      if (!j2.ok) {
        setDebug(j2);
        throw new Error(j2.error || "DB query failed");
      }

      // ✅ IMPORTANT: even empty results should still show basemap,
      // so keep geojson as {} with features:[] instead of null
      const safeGeojson =
        j2.geojson && typeof j2.geojson === "object"
          ? j2.geojson
          : { type: "FeatureCollection", features: [] };

      setGeojson(safeGeojson);
      setStats(j2.stats ?? null);
      setLayerPicked(j2.layerPicked ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
      // still show map with empty basemap? optional:
      setGeojson({ type: "FeatureCollection", features: [] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <ThinkingModal open={loading} text={thinkingText} />

      {!showMap ? (
        <div className="center">
          <h1 className="title">One Control Map Search</h1>

          <div className="searchRow">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder='Try: "show all cbfma"'
              className="input"
              onKeyDown={(e) => {
                if (e.key === "Enter") runQuery();
              }}
            />

            <button
              type="button"
              onClick={runQuery}
              disabled={loading || !message.trim()}
              className="btn"
            >
              Search
            </button>
          </div>

          {error ? <div className="error">❌ {error}</div> : null}

          <div className="miniInfo">
            <div>
              <b>Tip:</b> Try “cbfma in Cenro Sub Office” or “cbfma for renewal” or “largest cbfma”.
            </div>
          </div>
        </div>
      ) : (
        <div className="mapShell">
          <div className="topBar">
            <div className="topLeft">
              <div className="topTitle">One Control Map</div>
              <div className="topSub">
                {featureCount} feature(s)
                {layerPicked?.length ? ` • ${layerPicked.join(", ")}` : ""}
                {plan?.explanation ? ` • ${plan.explanation}` : ""}
              </div>
            </div>

            <div className="searchRow topSearch">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Search again…"
                className="input"
                onKeyDown={(e) => {
                  if (e.key === "Enter") runQuery();
                }}
              />
              <button
                type="button"
                onClick={runQuery}
                disabled={loading || !message.trim()}
                className="btn"
              >
                Search
              </button>
            </div>
          </div>

          {error ? <div className="error errorTop">❌ {error}</div> : null}

          {/* ✅ the map area must be relative + have height */}
          <div className="mapFull">
            <ResultMap geojson={geojson} />
          </div>

          {debug ? (
            <div className="debugPanel">
              <div className="debugTitle">Debug</div>
              <pre className="debugPre">{JSON.stringify(debug, null, 2)}</pre>
            </div>
          ) : null}
        </div>
      )}

      <style>{`
        .page{
          height: 100vh;
          background: #fff;
          color: #111;
        }

        /* Center start view */
        .center{
          height: 100vh;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          padding: 20px;
          gap: 14px;
          text-align:center;
        }

        .title{
          margin: 0 0 6px;
          font-size: 22px;
          font-weight: 900;
          letter-spacing: -.02em;
        }

        .searchRow{
          width: min(820px, 92vw);
          display:flex;
          gap: 10px;
          align-items:center;
        }

        .input{
          flex: 1;
          padding: 12px 14px;
          border: 1px solid #dcdcdc;
          border-radius: 12px;
          font-size: 15px;
          outline: none;
          background: #fff;
        }
        .input:focus{
          border-color: #bdbdbd;
          box-shadow: 0 0 0 4px rgba(0,0,0,.06);
        }

        .btn{
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid #d0d0d0;
          background: #111;
          color: #fff;
          font-weight: 800;
          cursor: pointer;
          min-width: 92px;
        }
        .btn:disabled{
          opacity: .55;
          cursor: not-allowed;
        }

        .error{
          width: min(820px, 92vw);
          border: 1px solid rgba(220,38,38,.25);
          background: rgba(220,38,38,.08);
          color: #7f1d1d;
          padding: 10px 12px;
          border-radius: 12px;
          text-align: left;
          white-space: pre-wrap;
        }

        .miniInfo{
          width: min(820px, 92vw);
          font-size: 12px;
          color: #555;
        }

        /* Full map shell */
        .mapShell{
          height: 100vh;
          display:flex;
          flex-direction:column;
          overflow: hidden;
        }

        .topBar{
          padding: 14px 16px;
          border-bottom: 1px solid #ededed;
          background: #fff;
          display:flex;
          flex-direction:column;
          gap: 10px;
          flex: 0 0 auto;
        }

        .topLeft{
          display:flex;
          flex-direction:column;
          gap: 2px;
        }

        .topTitle{
          font-weight: 900;
          letter-spacing: -.02em;
        }

        .topSub{
          font-size: 12px;
          color: #555;
        }

        .topSearch{
          width: min(1100px, 100%);
        }

        .errorTop{
          margin: 10px 16px 0;
          width: auto;
          max-width: 1100px;
        }

        /* ✅ critical: this area drives leaflet height */
        .mapFull{
          flex: 1 1 auto;
          position: relative;
          min-height: 0; /* important with flex */
        }

        /* Optional debug panel */
        .debugPanel{
          position: fixed;
          right: 12px;
          bottom: 12px;
          width: min(520px, 92vw);
          max-height: 45vh;
          overflow: auto;
          border: 1px solid #eee;
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 20px 80px rgba(0,0,0,.18);
          padding: 10px;
        }
        .debugTitle{ font-weight: 900; margin-bottom: 6px; }
        .debugPre{
          margin: 0;
          font-size: 12px;
          background: #fafafa;
          border: 1px solid #eee;
          border-radius: 10px;
          padding: 10px;
          overflow-x: auto;
        }
      `}</style>
    </div>
  );
}
