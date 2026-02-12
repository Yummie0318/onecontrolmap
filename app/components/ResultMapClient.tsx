"use client";

import dynamic from "next/dynamic";

export type MapLayerInput = {
  id: string;
  name?: string;
  color?: string;
  geom_type?: string | null;
  geojson: any; // FeatureCollection
  orderNo?: number;
};

export type ResultMapProps = {
  geojson?: any | null;
  layers?: MapLayerInput[];

  // ✅ NEW: control basemap visibility (tiles only)
  showBasemap?: boolean;

  // ✅ NEW: background color when basemap is hidden
  backgroundColor?: string;
};

const DEFAULT_FALLBACK_COLOR = "#2563eb";

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
            borderTopColor: "#2563eb",
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
  const normalizedLayers: MapLayerInput[] | undefined = (() => {
    if (Array.isArray(props.layers) && props.layers.length) {
      return props.layers
        .map((l, i) => ({
          ...l,
          color: l.color ?? DEFAULT_FALLBACK_COLOR,
          orderNo: Number.isFinite(l.orderNo as any) ? (l.orderNo as number) : i + 1,
        }))
        .sort((a, b) => (a.orderNo ?? 9999) - (b.orderNo ?? 9999));
    }

    if (props.geojson && props.geojson.type === "FeatureCollection") {
      return [
        {
          id: "single",
          name: "Layer",
          color: DEFAULT_FALLBACK_COLOR,
          geom_type: null,
          geojson: props.geojson,
          orderNo: 1,
        },
      ];
    }

    return undefined;
  })();

  return (
    <ResultMap
      layers={normalizedLayers}
      geojson={props.geojson ?? null}
      showBasemap={props.showBasemap}
      backgroundColor={props.backgroundColor}
    />
  );
}
