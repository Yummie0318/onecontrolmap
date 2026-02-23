"use client";

import {
  GeoJSON,
  LayersControl,
  MapContainer,
  Pane,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/** ✅ Fix Leaflet default marker icons in Next.js */
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import type { ResultMapProps } from "./ResultMapClient";
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: (markerIcon2x as any).src ?? markerIcon2x,
  iconUrl: (markerIcon as any).src ?? markerIcon,
  shadowUrl: (markerShadow as any).src ?? markerShadow,
});

export type MapLayerInput = {
  id: string;
  name?: string;
  color?: string;
  geom_type?: string | null;
  geojson: any;
  orderNo?: number;
};

type Props = {
  geojson?: any | null;
  layers?: MapLayerInput[];

  // ✅ NEW
  showBasemap?: boolean;
  backgroundColor?: string;
};

const DEFAULT_FALLBACK_COLOR = "#0b1220";

function safeInvalidate(map: any) {
  try {
    const c = map?.getContainer?.();
    if (!c) return;
    map.invalidateSize();
  } catch {}
}

function InvalidateOnEvents() {
  const map = useMap();

  useMapEvents({
    resize: () => safeInvalidate(map),
    zoomend: () => safeInvalidate(map),
  });

  useEffect(() => {
    let alive = true;
    const t1 = setTimeout(() => alive && safeInvalidate(map), 0);
    const t2 = setTimeout(() => alive && safeInvalidate(map), 200);
    const t3 = setTimeout(() => alive && safeInvalidate(map), 600);
    return () => {
      alive = false;
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [map]);

  return null;
}

// ✅ extra invalidate when basemap toggles
function InvalidateOnBasemapToggle({ showBasemap }: { showBasemap: boolean }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => safeInvalidate(map), 0);
    const t2 = setTimeout(() => safeInvalidate(map), 150);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [map, showBasemap]);
  return null;
}

/** ✅ filter out null/invalid geometries so bounds won't throw */
function safeGeojsonForBounds(geojson: any) {
  const feats = geojson?.features;
  if (!Array.isArray(feats)) return null;

  const safe = feats.filter((f: any) => {
    const g = f?.geometry;
    if (!g) return false;
    if (!g.type) return false;
    if (!g.coordinates) return false;
    return true;
  });

  if (safe.length === 0) return null;
  return { ...geojson, features: safe };
}

function FitToGeoJson({ geojson }: { geojson: any | null }) {
  const map = useMap();

  useEffect(() => {
    let alive = true;
    let t: any = null;

    const safe = geojson ? safeGeojsonForBounds(geojson) : null;
    if (!safe) return;

    try {
      const layer = L.geoJSON(safe);
      const bounds = layer.getBounds();
      if (bounds?.isValid()) {
        map.fitBounds(bounds, { padding: [24, 24] });
        t = setTimeout(() => {
          if (!alive) return;
          safeInvalidate(map);
        }, 120);
      }
    } catch (err) {
      console.warn("Failed to fit bounds:", err);
    }

    return () => {
      alive = false;
      if (t) clearTimeout(t);
    };
  }, [geojson, map]);

  return null;
}

function FitToMany({ layers }: { layers: MapLayerInput[] }) {
  const map = useMap();

  useEffect(() => {
    let alive = true;
    let t: any = null;

    if (!layers.length) return;

    try {
      let merged: L.LatLngBounds | null = null;

      for (const l of layers) {
        const safe = safeGeojsonForBounds(l.geojson);
        if (!safe) continue;

        const gj = L.geoJSON(safe);
        const b = gj.getBounds();
        if (!b?.isValid()) continue;

        merged = merged ? merged.extend(b) : b;
      }

      if (merged && merged.isValid()) {
        map.fitBounds(merged, { padding: [24, 24] });

        t = setTimeout(() => {
          if (!alive) return;
          safeInvalidate(map);
        }, 120);
      }
    } catch (err) {
      console.warn("Failed to fit bounds:", err);
    }

    return () => {
      alive = false;
      if (t) clearTimeout(t);
    };
  }, [layers, map]);

  return null;
}

function styleForColor(color: string) {
  return {
    color,
    weight: 2.5,
    opacity: 0.95,
    fillColor: color,
    fillOpacity: 0.28,
  } as L.PathOptions;
}

function pointStyle(color: string) {
  return {
    radius: 5,
    color,
    weight: 2,
    opacity: 0.95,
    fillColor: color,
    fillOpacity: 0.85,
  } as L.CircleMarkerOptions;
}

function getFeatureColor(feature: any, layerColor: string) {
  const c = feature?.properties?.__color;
  if (typeof c === "string" && c.trim()) return c.trim();
  return layerColor;
}

function bindPopupDENR(feature: any, layer: any) {
  const p = feature?.properties ?? {};

  const title =
    p.PO_NAME ||
    p.PO_ALIAS ||
    p.PA ||
    p.PA_1 ||
    p.CBFMA_NO ||
    p.MUNI_CITY ||
    p.BARANGAY ||
    "Feature";

  const preferredKeys = [
    "PO_NAME",
    "PO_ALIAS",
    "CBFMA_NO",
    "CENRO",
    "PENRO",
    "MUNI_CITY",
    "BARANGAY",
    "AREA_HA",
    "TENURE",
    "PA",
    "ACRONYM",
    "TYPE",
    "REMARKS",
  ];

  const rows: Array<[string, any]> = [];
  for (const k of preferredKeys) {
    if (p[k] !== undefined && p[k] !== null && String(p[k]).trim() !== "") {
      rows.push([k, p[k]]);
    }
  }

  const extras = Object.entries(p)
    .filter(([k]) => !preferredKeys.includes(k))
    .filter(([_, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .slice(0, Math.max(0, 12 - rows.length));

  const lines = [...rows, ...(extras as any)]
    .slice(0, 12)
    .map(([k, v]) => `<b>${k}</b>: ${String(v)}`)
    .join("<br/>");

  layer.bindPopup(`<div style="min-width:240px"><b>${title}</b><br/>${lines}</div>`);
}

export default function ResultMap(props: Props) {
  const AnyMapContainer = MapContainer as any;
  const AnyTileLayer = TileLayer as any;
  const AnyGeoJSON = GeoJSON as any;
  const AnyLayersControl = LayersControl as any;
  const AnyPane = Pane as any;

  const showBasemap = props.showBasemap ?? true;
  const backgroundColor = props.backgroundColor ?? "#ffffff";

  const normalizedLayers: MapLayerInput[] = useMemo(() => {
    if (props.layers?.length) {
      return props.layers
        .filter((l) => l?.geojson?.type === "FeatureCollection")
        .map((l) => ({ ...l, color: l.color || DEFAULT_FALLBACK_COLOR }));
    }
    if (props.geojson?.type === "FeatureCollection") {
      return [
        {
          id: "single",
          name: "Layer",
          color: DEFAULT_FALLBACK_COLOR,
          geojson: props.geojson,
          orderNo: 1,
        },
      ];
    }
    return [];
  }, [props.layers, props.geojson]);

  const orderedLayers = useMemo(() => {
    return normalizedLayers.slice().sort((a, b) => (a.orderNo ?? 9999) - (b.orderNo ?? 9999));
  }, [normalizedLayers]);

  const hasAnyData = useMemo(() => {
    return orderedLayers.some((l) => Array.isArray(l.geojson?.features) && l.geojson.features.length > 0);
  }, [orderedLayers]);

  const mapKey = useMemo(() => {
    const ids = orderedLayers.map((l) => l.id).join("|");
    const counts = orderedLayers
      .map((l) => (Array.isArray(l.geojson?.features) ? l.geojson.features.length : 0))
      .join(",");
    const orders = orderedLayers.map((l) => `${l.id}:${l.orderNo ?? 0}`).join("|");
    return `map-${ids}-${counts}-${orders}`;
  }, [orderedLayers]);

  const Z_BASE = 450;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <AnyMapContainer
        key={mapKey}
        center={[17.7, 121.7]}
        zoom={8}
        zoomControl
        attributionControl={showBasemap} // ✅ hide attribution when basemap off
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          borderRadius: 16,
          border: "1px solid #e5e5e5",
          background: backgroundColor, // ✅ white background when basemap off
        }}
        whenReady={(ctx: any) => {
          ctx?.target?.invalidateSize?.();
          setTimeout(() => ctx?.target?.invalidateSize?.(), 200);
        }}
      >
        <InvalidateOnEvents />
        <InvalidateOnBasemapToggle showBasemap={showBasemap} />

        {/* ✅ Basemap tiles are OPTIONAL.
            Map + vectors stay ON, so projection/fitBounds still works */}
        {showBasemap ? (
          <AnyLayersControl position="topright">
            <AnyLayersControl.BaseLayer checked name="Street (OSM)">
              <AnyTileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
            </AnyLayersControl.BaseLayer>

            <AnyLayersControl.BaseLayer name="Light (Carto)">
              <AnyTileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution="&copy; OpenStreetMap contributors &copy; CARTO"
              />
            </AnyLayersControl.BaseLayer>

            <AnyLayersControl.BaseLayer name="Satellite (Esri)">
              <AnyTileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles &copy; Esri"
              />
            </AnyLayersControl.BaseLayer>
          </AnyLayersControl>
        ) : null}

        {/* ✅ fit bounds still works whether basemap is ON or OFF */}
        {props.layers?.length ? <FitToMany layers={orderedLayers} /> : <FitToGeoJson geojson={props.geojson ?? null} />}

        {orderedLayers.map((layer) => {
          const feats = layer.geojson?.features;
          const hasData = Array.isArray(feats) && feats.length > 0;
          if (!hasData) return null;

          const baseColor = layer.color || DEFAULT_FALLBACK_COLOR;
          const geoKey = `geo-${layer.id}-${feats.length}`;
          const paneName = `pane-${layer.id}`;
          const z = Z_BASE + (layer.orderNo ?? 0);

          return (
            <AnyPane key={`pane-${layer.id}`} name={paneName} style={{ zIndex: z }}>
              <AnyGeoJSON
                key={geoKey}
                data={layer.geojson}
                pane={paneName}
                style={(feature: any) => styleForColor(getFeatureColor(feature, baseColor))}
                pointToLayer={(feature: any, latlng: any) =>
                  L.circleMarker(latlng, pointStyle(getFeatureColor(feature, baseColor)))
                }
                onEachFeature={(feature: any, leafletLayer: any) => {
                  bindPopupDENR(feature, leafletLayer);

                  leafletLayer.on?.("mouseover", () => {
                    const c = getFeatureColor(feature, baseColor);
                    try {
                      leafletLayer.setStyle?.({ ...styleForColor(c), weight: 4, fillOpacity: 0.38 });
                    } catch {}
                  });

                  leafletLayer.on?.("mouseout", () => {
                    const c = getFeatureColor(feature, baseColor);
                    try {
                      leafletLayer.setStyle?.(styleForColor(c));
                    } catch {}
                  });
                }}
              />
            </AnyPane>
          );
        })}
      </AnyMapContainer>

      {/* optional hint when no data */}
      {!hasAnyData ? (
        <div
          style={{
            position: "absolute",
            left: 14,
            bottom: 14,
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
          <div style={{ color: "#555", marginTop: 2 }}>Turn on a layer from the list.</div>
        </div>
      ) : null}
    </div>
  );
}
