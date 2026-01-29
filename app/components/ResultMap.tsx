"use client";

import {
  GeoJSON,
  LayersControl,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/** ✅ Fix Leaflet default marker icons in Next.js */
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: (markerIcon2x as any).src ?? markerIcon2x,
  iconUrl: (markerIcon as any).src ?? markerIcon,
  shadowUrl: (markerShadow as any).src ?? markerShadow,
});

type Props = {
  geojson: any | null;
};

function InvalidateOnEvents() {
  const map = useMap();

  useMapEvents({
    // when the map gets shown after layout changes, invalidate
    resize: () => map.invalidateSize(),
    zoomend: () => map.invalidateSize(),
  });

  useEffect(() => {
    // extra safety invalidations
    const t1 = setTimeout(() => map.invalidateSize(), 0);
    const t2 = setTimeout(() => map.invalidateSize(), 200);
    const t3 = setTimeout(() => map.invalidateSize(), 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [map]);

  return null;
}

function FitToGeoJson({ geojson }: { geojson: any | null }) {
  const map = useMap();

  useEffect(() => {
    const feats = geojson?.features;
    if (!Array.isArray(feats) || feats.length === 0) return;

    try {
      const layer = L.geoJSON(geojson);
      const bounds = layer.getBounds();
      if (bounds?.isValid()) {
        map.fitBounds(bounds, { padding: [24, 24] });
        setTimeout(() => map.invalidateSize(), 120);
      }
    } catch (err) {
      console.warn("Failed to fit bounds:", err);
    }
  }, [geojson, map]);

  return null;
}

export default function ResultMap({ geojson }: Props) {
  // React 19 typings workaround
  const AnyMapContainer = MapContainer as any;
  const AnyTileLayer = TileLayer as any;
  const AnyGeoJSON = GeoJSON as any;
  const AnyLayersControl = LayersControl as any;

  const feats = geojson?.features;
  const hasData = Array.isArray(feats) && feats.length > 0;

  // ✅ force the whole map to remount when query changes (very reliable)
  const mapKey = useMemo(() => {
    const n = Array.isArray(feats) ? feats.length : 0;
    const firstId = feats?.[0]?.id ?? feats?.[0]?.properties?.id ?? "x";
    return `map-${n}-${String(firstId)}`;
  }, [feats]);

  // ✅ track tile loading to confirm it is painting
  const [tilesOk, setTilesOk] = useState(false);
  const tileOkRef = useRef(false);

  const tileHandlers = {
    load: () => {
      if (!tileOkRef.current) {
        tileOkRef.current = true;
        setTilesOk(true);
      }
    },
    tileerror: (e: any) => {
      console.warn("Tile error:", e);
    },
  } as any;

  const geoKey = useMemo(() => {
    if (!hasData) return "empty";
    const firstId = feats?.[0]?.id ?? feats?.[0]?.properties?.id ?? "x";
    return `geo-${feats.length}-${String(firstId)}`;
  }, [hasData, feats]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <AnyMapContainer
        key={mapKey}
        center={[17.7, 121.7]}
        zoom={8}
        zoomControl
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          borderRadius: 16,
          border: "1px solid #e5e5e5",
          background: "#fff",
        }}
        whenReady={(ctx: any) => {
          // ✅ guaranteed invalidate when leaflet says it's ready
          ctx?.target?.invalidateSize?.();
          setTimeout(() => ctx?.target?.invalidateSize?.(), 200);
        }}
      >
        <InvalidateOnEvents />

        {/* ✅ Basemap toggle (you asked for this) */}
        <AnyLayersControl position="topright">
          <AnyLayersControl.BaseLayer checked name="Street (OSM)">
            <AnyTileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
              eventHandlers={tileHandlers}
            />
          </AnyLayersControl.BaseLayer>

          <AnyLayersControl.BaseLayer name="Light (Carto)">
            <AnyTileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution="&copy; OpenStreetMap contributors &copy; CARTO"
              eventHandlers={tileHandlers}
            />
          </AnyLayersControl.BaseLayer>

          <AnyLayersControl.BaseLayer name="Satellite (Esri)">
            <AnyTileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri"
              eventHandlers={tileHandlers}
            />
          </AnyLayersControl.BaseLayer>
        </AnyLayersControl>

        <FitToGeoJson geojson={geojson} />

        {hasData ? (
          <AnyGeoJSON
            key={geoKey}
            data={geojson}
            onEachFeature={(feature: any, layer: any) => {
              const p = feature?.properties ?? {};
              const title = p.NAME_PO || p.CBFMA_NO || p.MUNI_CITY || "Feature";

              const lines = Object.entries(p)
                .slice(0, 12)
                .map(([k, v]) => `<b>${k}</b>: ${String(v)}`)
                .join("<br/>");

              layer.bindPopup(
                `<div style="min-width:220px"><b>${title}</b><br/>${lines}</div>`
              );
            }}
          />
        ) : null}
      </AnyMapContainer>

      {/* ✅ if tiles never report "load", show a helpful overlay */}
      {!tilesOk ? (
        <div
          style={{
            position: "absolute",
            left: 14,
            bottom: 14,
            background: "rgba(255,255,255,0.96)",
            border: "1px solid #e7e7e7",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 12,
            color: "#111",
            boxShadow: "0 18px 60px rgba(0,0,0,0.12)",
          }}
        >
          <b>Loading basemap…</b>
          <div style={{ color: "#555", marginTop: 2 }}>
            If this stays, open DevTools → Network → look for tile requests.
          </div>
        </div>
      ) : null}

      {/* ✅ No results overlay */}
      {tilesOk && !hasData ? (
        <div
          style={{
            position: "absolute",
            left: 14,
            bottom: 62,
            background: "rgba(255,255,255,0.95)",
            border: "1px solid #e7e7e7",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 12,
            color: "#111",
            boxShadow: "0 18px 60px rgba(0,0,0,0.12)",
          }}
        >
          <b>No results</b>
          <div style={{ color: "#555", marginTop: 2 }}>
            Try another filter (example: “region ilike %cagayan%”).
          </div>
        </div>
      ) : null}
    </div>
  );
}
