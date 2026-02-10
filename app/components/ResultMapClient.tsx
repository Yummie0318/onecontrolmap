// C:\Users\Yummie03\Desktop\onemap\app\components\ResultMapClient.tsx
"use client";

import dynamic from "next/dynamic";

export type MapLayerInput = {
  id: string;
  name?: string;
  color?: string; // default fallback color for the layer
  geom_type?: string | null;
  geojson: any; // FeatureCollection
};

export type ResultMapProps = {
  // backward compatibility (single layer)
  geojson?: any | null;

  // multi-layer support
  layers?: MapLayerInput[];
};

const DEFAULT_FALLBACK_COLOR = "#0b1220";

const ResultMap = dynamic<ResultMapProps>(() => import("./ResultMap"), {
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

export default function ResultMapClient(props: ResultMapProps) {
  // ✅ Normalize:
  // - If caller gives geojson only, wrap it into one layer.
  // - If caller gives layers, ensure each layer has a fallback color.
  const normalizedLayers: MapLayerInput[] | undefined = (() => {
    if (Array.isArray(props.layers) && props.layers.length) {
      return props.layers.map((l) => ({
        ...l,
        color: l.color ?? DEFAULT_FALLBACK_COLOR,
      }));
    }

    if (props.geojson && props.geojson.type === "FeatureCollection") {
      return [
        {
          id: "single",
          name: "Layer",
          color: DEFAULT_FALLBACK_COLOR,
          geom_type: null,
          geojson: props.geojson,
        },
      ];
    }

    return undefined;
  })();

  return <ResultMap layers={normalizedLayers} geojson={props.geojson ?? null} />;
}
