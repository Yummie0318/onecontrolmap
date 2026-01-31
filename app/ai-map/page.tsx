"use client";

import { useMemo, useRef, useState, useEffect } from "react";
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

const LOADING_STEPS = [
  "Parsing query…",
  "Matching layer…",
  "Running SQL…",
  "Rendering map…",
] as const;

function ThinkingModal({ open }: { open: boolean }) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    const t = setInterval(() => {
      setStepIndex((i) => (i + 1) % LOADING_STEPS.length);
    }, 900);
    return () => clearInterval(t);
  }, [open]);

  if (!open) return null;

  return (
    <div className="overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="modal">
        <div className="brandRow">
          <div className="pulseDot" aria-hidden="true" />
          <div className="brandText">
            <div className="modalTitle">Processing your request</div>
            <div className="modalSub">{LOADING_STEPS[stepIndex]}</div>
          </div>
        </div>

        <div className="progress" aria-hidden="true">
          <div className="bar" />
        </div>

        <style>{`
          .overlay{
            position: fixed;
            inset: 0;
            background: rgba(10,10,10,.40);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));
          }
          .modal{
            width: min(560px, 96vw);
            background: #fff;
            border: 1px solid rgba(0,0,0,.08);
            border-radius: 18px;
            padding: 16px;
            box-shadow: 0 30px 120px rgba(0,0,0,.22);
          }
          .brandRow{
            display:flex;
            gap: 12px;
            align-items:flex-start;
          }
          .pulseDot{
            width: 10px;
            height: 10px;
            border-radius: 999px;
            background: #111;
            margin-top: 6px;
            animation: pulse 1.1s ease-in-out infinite;
          }
          @keyframes pulse{
            0%,100%{ transform: scale(1); opacity: .7; }
            50%{ transform: scale(1.55); opacity: 1; }
          }
          .brandText{ min-width: 0; }
          .modalTitle{
            font-weight: 900;
            letter-spacing: -.02em;
            color: #111;
            font-size: 14px;
            line-height: 1.2;
          }
          .modalSub{
            margin-top: 4px;
            font-size: 13px;
            color: #444;
            line-height: 1.35;
            word-break: break-word;
          }
          .progress{
            margin-top: 14px;
            height: 10px;
            border-radius: 999px;
            background: rgba(0,0,0,.06);
            overflow: hidden;
          }
          .bar{
            height: 100%;
            width: 42%;
            background: rgba(0,0,0,.85);
            border-radius: 999px;
            animation: slide 1.1s ease-in-out infinite;
          }
          @keyframes slide{
            0%{ transform: translateX(-120%); }
            100%{ transform: translateX(260%); }
          }

          @media (prefers-reduced-motion: reduce){
            .pulseDot, .bar{ animation: none; }
            .bar{ width: 60%; transform: translateX(0); }
          }
        `}</style>
      </div>
    </div>
  );
}

/**
 * ✅ Assistant summary card (NO LONG SENTENCE)
 * Shows ONLY:
 * Assistant
 * AI Search
 * Chips (dataset + count)
 */
function ResultChipsInline({
  dataset,
  count,
}: {
  dataset: string | null;
  count: number;
}) {
  const chips: string[] = [];
  if (dataset) chips.push(dataset);
  chips.push(`${count} feature(s)`);

  return (
    <div className="chipsInline" aria-label="Result tags">
      {chips.map((c, i) => (
        <span className="chip" key={`${c}-${i}`} title={c}>
          {c}
        </span>
      ))}

      <style>{`
        .chipsInline{
          width: 100%;
          display:flex;
          gap: 8px;
          align-items:center;
          flex-wrap: wrap;
          padding: 2px 0; /* very small height */
        }
        .chip{
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0,0,0,.10);
          background: rgba(0,0,0,.03);
          color: #111;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Mobile: horizontal scroll instead of wrapping */
        @media (max-width: 520px){
          .chipsInline{
            flex-wrap: nowrap;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            padding-bottom: 2px;
          }
          .chip{ flex: 0 0 auto; }
        }
      `}</style>
    </div>
  );
}


export default function AiMapPage() {
  const [message, setMessage] = useState("show me cbfma of cenro alcala");
  const [loading, setLoading] = useState(false);

  const [geojson, setGeojson] = useState<any | null>(null);

  const [dataset, setDataset] = useState<string | null>(null);


  const [error, setError] = useState<string>("");
  const [debug, setDebug] = useState<any | null>(null);

  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const featureCount = useMemo(() => geojson?.features?.length ?? 0, [geojson]);
  const showMap = geojson !== null;

  const tips = useMemo(
    () => ["cbfma for renewal", "protected area", "cbfma po alias mufmpc", "smallest cbfma"],
    []
  );

  function applyTip(t: string) {
    setMessage(t);
    requestAnimationFrame(() => inputRef.current?.focus());
    // Optional: auto-run immediately after clicking a tip
    // runQuery(t);
  }

  async function runQuery(forcedMessage?: string) {
    const q = (forcedMessage ?? message).trim();
    if (!q) return;

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    setDebug(null);

    setDataset(null);


    try {
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
      <ThinkingModal open={loading} />

      {!showMap ? (
        <div className="center">
          <div className="hero">
            <h1 className="title">One Control Map Search</h1>
            <p className="subtitle">
              Search GIS layers using natural language (CBFMA, PA, NGP, SIFMA, Fire).
            </p>
          </div>

          <div className="searchRow">
            <input
              ref={inputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder='Try: "cbfma cenro alcala" or "cbfma po alias mufmpc"'
              className="input"
              onKeyDown={(e) => e.key === "Enter" && runQuery()}
            />

            <button
              type="button"
              onClick={() => runQuery()}
              disabled={loading || !message.trim()}
              className="btn"
            >
              Search
            </button>
          </div>

          {error ? <div className="error">❌ {error}</div> : null}

          <div className="miniInfo">
            <div className="tipsTitle">Tips</div>
            <div className="tipsGrid">
              {tips.map((t) => (
                <button
                  type="button"
                  key={t}
                  className="tip"
                  onClick={() => applyTip(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mapShell">
          <div className="topBar">
            <div className="topRow">
              <div className="topLeft">
                <div className="topTitle">One Control Map</div>
                <div className="topSub">
                  {featureCount} feature(s)
                  {dataset ? ` • ${dataset}` : ""}
                </div>
              </div>

              <div className="searchRow topSearch">
                <input
                  ref={inputRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Search again…"
                  className="input"
                  onKeyDown={(e) => e.key === "Enter" && runQuery()}
                />
                <button
                  type="button"
                  onClick={() => runQuery()}
                  disabled={loading || !message.trim()}
                  className="btn"
                >
                  Search
                </button>
              </div>

              <div className="tipsInline" aria-label="Quick tips">
                {tips.slice(0, 3).map((t) => (
                  <button
                    type="button"
                    key={t}
                    className="tipInline"
                    onClick={() => applyTip(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* ✅ NO explanation line anymore */}
  
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
          padding: calc(18px + env(safe-area-inset-top)) 16px calc(18px + env(safe-area-inset-bottom));
          gap: 14px;
          text-align:center;
        }
        .hero{
          width: min(920px, 100%);
          display:flex;
          flex-direction:column;
          gap: 6px;
        }
        .title{
          margin: 0;
          font-size: clamp(20px, 3.6vw, 28px);
          font-weight: 950;
          letter-spacing: -.03em;
        }
        .subtitle{
          margin: 0;
          font-size: 13px;
          color: #555;
          line-height: 1.45;
        }

        .searchRow{
          width: min(920px, 100%);
          display:flex;
          gap: 10px;
          align-items:center;
        }
        .input{
          flex: 1;
          padding: 12px 14px;
          border: 1px solid rgba(0,0,0,.16);
          border-radius: 14px;
          font-size: 15px;
          outline: none;
          background: #fff;
          min-width: 0;
        }
        .input:focus{
          border-color: rgba(0,0,0,.35);
          box-shadow: 0 0 0 4px rgba(0,0,0,.06);
        }
        .btn{
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid rgba(0,0,0,.12);
          background: #111;
          color: #fff;
          font-weight: 900;
          cursor: pointer;
          min-width: 110px;
        }
        .btn:disabled{
          opacity: .55;
          cursor: not-allowed;
        }

        @media (max-width: 640px){
          .searchRow{
            flex-direction: column;
            align-items: stretch;
          }
          .btn{
            width: 100%;
            min-width: unset;
          }
        }

        .error{
          width: min(920px, 100%);
          border: 1px solid rgba(220,38,38,.25);
          background: rgba(220,38,38,.08);
          color: #7f1d1d;
          padding: 10px 12px;
          border-radius: 14px;
          text-align: left;
          white-space: pre-wrap;
        }

        .miniInfo{
          width: min(920px, 100%);
          text-align: left;
          border: 1px solid rgba(0,0,0,.08);
          border-radius: 16px;
          padding: 12px;
          background: rgba(0,0,0,.02);
        }
        .tipsTitle{
          font-weight: 900;
          font-size: 12px;
          color: #111;
          margin-bottom: 10px;
        }
        .tipsGrid{
          display:flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .tip{
          font-size: 12px;
          padding: 7px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0,0,0,.10);
          background: #fff;
          color: #111;
          cursor: pointer;
          text-align: left;
        }
        .tip:active{ transform: translateY(1px); }

        .mapShell{
          height: 100vh;
          display:flex;
          flex-direction:column;
          overflow: hidden;
        }
        .topBar{
          position: sticky;
          top: 0;
          z-index: 5;
          padding: calc(12px + env(safe-area-inset-top)) 14px 12px;
          border-bottom: 1px solid rgba(0,0,0,.08);
          background: rgba(255,255,255,.92);
          backdrop-filter: blur(10px);
          display:flex;
          flex-direction:column;
            gap: 8px;
          flex: 0 0 auto;
        }
        .topRow{
          width: 100%;
          display:flex;
          flex-direction:column;
          gap: 10px;
        }

        .topLeft{
          display:flex;
          flex-direction:column;
          gap: 2px;
        }
        .topTitle{
          font-weight: 950;
          letter-spacing: -.02em;
        }
        .topSub{
          font-size: 12px;
          color: #555;
        }
        .topSearch{
          width: 100%;
        }

        .tipsInline{
          display:flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .tipInline{
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0,0,0,.10);
          background: rgba(0,0,0,.03);
          color: #111;
          cursor:pointer;
        }
        @media (max-width: 520px){
          .tipsInline{
            flex-wrap: nowrap;
            overflow-x: auto;
            padding-bottom: 2px;
            -webkit-overflow-scrolling: touch;
          }
          .tipInline{ flex: 0 0 auto; }
        }

        .errorTop{
          margin: 10px 14px 0;
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
          border: 1px solid rgba(0,0,0,.10);
          background: #fff;
          border-radius: 14px;
          box-shadow: 0 20px 80px rgba(0,0,0,.18);
          padding: 10px;
          z-index: 20;
        }
        .debugTitle{ font-weight: 950; margin-bottom: 6px; }
        .debugPre{
          margin: 0;
          font-size: 12px;
          background: rgba(0,0,0,.03);
          border: 1px solid rgba(0,0,0,.08);
          border-radius: 12px;
          padding: 10px;
          overflow-x: auto;
        }
      `}</style>
    </div>
  );
}
