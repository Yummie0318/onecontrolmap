"use client";

import { useMemo, useRef, useState } from "react";
import ResultMap from "../components/ResultMapClient";

type AiResponse = {
  ok: boolean;
  dataset?: string;
  normalized?: string;
  explanation?: string;
  geojson?: any;
  parsed?: any;
  meta?: any;
  error?: string;
};

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

/** ✅ ChatGPT-like assistant bubble */
function AssistantBubble({
  dataset,
  normalized,
  explanation,
  count,
}: {
  dataset: string | null;
  normalized: string | null;
  explanation: string | null;
  count: number;
}) {
  // show even if explanation missing, but keep it clean
  const line1 = explanation?.trim()
    ? explanation.trim()
    : "Here are the results I found on the map.";

  const chips: string[] = [];
  if (dataset) chips.push(dataset);
  if (normalized) chips.push(normalized);
  chips.push(`${count} feature(s)`);

  return (
    <div className="assistantWrap">
      <div className="assistantBubble">
        <div className="assistantTop">
          <div className="assistantAvatar" aria-hidden="true">
            AI
          </div>
          <div className="assistantText">
            <div className="assistantTitle">Assistant</div>
            <div className="assistantLine">{line1}</div>

            <div className="assistantChips">
              {chips.map((c, i) => (
                <span className="chip" key={`${c}-${i}`}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .assistantWrap{
          width: min(1100px, 100%);
          display:flex;
          justify-content:flex-start;
        }
        .assistantBubble{
          width: 100%;
          border: 1px solid #ededed;
          background: #fff;
          border-radius: 16px;
          padding: 12px 12px;
          box-shadow: 0 12px 40px rgba(0,0,0,.08);
        }
        .assistantTop{
          display:flex;
          gap: 10px;
          align-items:flex-start;
        }
        .assistantAvatar{
          width: 34px;
          height: 34px;
          border-radius: 999px;
          background: #111;
          color: #fff;
          display:flex;
          align-items:center;
          justify-content:center;
          font-weight: 900;
          font-size: 12px;
          flex: 0 0 auto;
        }
        .assistantText{
          min-width: 0;
          display:flex;
          flex-direction:column;
          gap: 4px;
        }
        .assistantTitle{
          font-weight: 900;
          letter-spacing: -.02em;
          font-size: 13px;
          color: #111;
        }
        .assistantLine{
          font-size: 13px;
          color: #333;
          line-height: 1.35;
          word-break: break-word;
        }
        .assistantChips{
          display:flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 6px;
        }
        .chip{
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid #e7e7e7;
          background: #fafafa;
          color: #111;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}

export default function AiMapPage() {
  const [message, setMessage] = useState("show me cbfma of cenro alcala");
  const [loading, setLoading] = useState(false);
  const [thinkingText, setThinkingText] = useState("Reading your query…");

  const [geojson, setGeojson] = useState<any | null>(null);

  const [dataset, setDataset] = useState<string | null>(null);
  const [normalized, setNormalized] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);

  const [error, setError] = useState<string>("");
  const [debug, setDebug] = useState<any | null>(null);

  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const featureCount = useMemo(() => {
    return geojson?.features?.length ?? 0;
  }, [geojson]);

  const showMap = geojson !== null;

  async function runQuery() {
    const q = message.trim();
    if (!q) return;

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setThinkingText("Understanding your request…");
    setError("");
    setDebug(null);

    setDataset(null);
    setNormalized(null);
    setExplanation(null);

    try {
      setThinkingText("Searching layers and building GeoJSON…");

      const r = await fetch("/api/ai/map-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, limit: 800 }),
        signal: controller.signal,
        cache: "no-store",
      });

      const j = (await r.json().catch(() => ({}))) as AiResponse;

      if (!j?.ok) {
        setDebug(j);
        throw new Error(j?.error || "Search failed");
      }

      const safeGeojson =
        j.geojson && typeof j.geojson === "object"
          ? j.geojson
          : { type: "FeatureCollection", features: [] };

      setGeojson(safeGeojson);
      setDataset(j.dataset ?? null);
      setNormalized(j.normalized ?? null);
      setExplanation(j.explanation ?? null);

      setDebug({ parsed: j.parsed, meta: j.meta });
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError(e?.message ?? "Something went wrong");
      setGeojson({ type: "FeatureCollection", features: [] });
    } finally {
      setLoading(false);
      inFlightRef.current = false;
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
              placeholder='Try: "cbfma cenro alcala" or "cbfma po alias mufmpc"'
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
              <b>Tip:</b> Try “cbfma alcala”, “cbfma cenro alcala”, “cbfma po alias mufmpc”, “pa aparri”.
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
                {dataset ? ` • ${dataset}` : ""}
                {normalized ? ` • ${normalized}` : ""}
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

            {/* ✅ ChatGPT-like assistant bubble */}
            <AssistantBubble
              dataset={dataset}
              normalized={normalized}
              explanation={explanation}
              count={featureCount}
            />
          </div>

          {error ? <div className="error errorTop">❌ {error}</div> : null}

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
          gap: 12px; /* more space for assistant bubble */
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

        .mapFull{
          flex: 1 1 auto;
          position: relative;
          min-height: 0;
        }

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
