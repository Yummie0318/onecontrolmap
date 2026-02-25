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
import React, { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/** ✅ Fix Leaflet default marker icons in Next.js */
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import type { ResultMapProps, MapLayerInput } from "./ResultMapClient";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: (markerIcon2x as any).src ?? markerIcon2x,
  iconUrl: (markerIcon as any).src ?? markerIcon,
  shadowUrl: (markerShadow as any).src ?? markerShadow,
});

type Props = ResultMapProps & {
  showBasemap?: boolean;
  backgroundColor?: string;
};

/** ✅ injected My Location layer id */
const MY_LOC_LAYER_ID = "__my_location__";
/** ✅ always-on-top pane for My Location */
const MY_LOC_PANE = "pane-my-location";

const DEFAULT_FALLBACK_COLOR = "#0b1220";

function safeInvalidate(map: any) {
  try {
    const c = map?.getContainer?.();
    if (!c) return;
    map.invalidateSize();
  } catch {}
}

/**
 * ✅ NEW: invalidateSize whenever the MAP CONTAINER changes size
 * This fixes resizing issues when:
 * - sidebar width changes
 * - dock/table height changes
 * - mobile bottom sheet opens/closes
 */
function InvalidateOnContainerResize({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const map = useMap();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let raf: number | null = null;

    const trigger = () => {
      // RAF throttle so it stays smooth while dragging
      if (raf != null) return;
      raf = window.requestAnimationFrame(() => {
        raf = null;
        safeInvalidate(map);
      });
    };

    // Initial invalidate (mount)
    trigger();

    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => trigger());
      ro.observe(el);
    } catch {
      // Fallback for very old browsers: listen to window resize
      window.addEventListener("resize", trigger);
    }

    // Also listen to orientation change (mobile)
    window.addEventListener("orientationchange", trigger);

    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      window.removeEventListener("orientationchange", trigger);
      if (ro) {
        try {
          ro.disconnect();
        } catch {}
      } else {
        window.removeEventListener("resize", trigger);
      }
    };
  }, [map, containerRef]);

  return null;
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

/** ✅ Forward mouse move / click from Leaflet map to your page.tsx */
function ForwardMapEvents({
  onMapMouseMove,
  onMapClick,
}: {
  onMapMouseMove?: (lat: number, lng: number) => void;
  onMapClick?: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    mousemove: (e) => {
      if (!onMapMouseMove) return;
      const lat = e?.latlng?.lat;
      const lng = e?.latlng?.lng;
      if (Number.isFinite(lat) && Number.isFinite(lng)) onMapMouseMove(lat, lng);
    },
    click: (e) => {
      if (!onMapClick) return;
      const lat = e?.latlng?.lat;
      const lng = e?.latlng?.lng;
      if (Number.isFinite(lat) && Number.isFinite(lng)) onMapClick(lat, lng);
    },
  });
  return null;
}

/** ✅ filter out invalid geometries so bounds won't throw */
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

function isPolygonGeom(feature: any) {
  const t = feature?.geometry?.type;
  return t === "Polygon" || t === "MultiPolygon";
}

function styleForColor(color: string, isPolygon: boolean) {
  return {
    color,
    weight: 2.5,
    opacity: 0.95,
    fillColor: color,
    fillOpacity: isPolygon ? 0.28 : 0,
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

function pointDotStyle(color: string) {
  return {
    radius: 8,
    color: "#ffffff",        // ✅ white outline (always visible)
    weight: 2.5,
    opacity: 1,
    fillColor: color,        // ✅ red fill (or any __color)
    fillOpacity: 1,
  } as L.CircleMarkerOptions;
}

function accuracyCircleStyle(color: string) {
  return {
    color,
    weight: 2,
    opacity: 0.35,
    fillColor: color,
    fillOpacity: 0.1,
  } as L.PathOptions;
}

function getFeatureColor(feature: any, layerColor: string) {
  const c = feature?.properties?.__color;
  if (typeof c === "string" && c.trim()) return c.trim();
  return layerColor;
}

function getFeatureFid(feature: any) {
  return feature?.id ?? feature?.properties?.__fid ?? feature?.properties?.fid ?? null;
}

function bindPopupDENR(feature: any, layer: any) {
  const p = feature?.properties ?? {};

  const title =
    p.label ||
    p.PO_NAME ||
    p.PO_ALIAS ||
    p.PA ||
    p.PA_1 ||
    p.CBFMA_NO ||
    p.MUNI_CITY ||
    p.BARANGAY ||
    "Feature";

  const preferredKeys = [
    "label",
    "accuracy_m",
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
    if (p[k] !== undefined && p[k] !== null && String(p[k]).trim() !== "") rows.push([k, p[k]]);
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

function extractMyLocationLatLngFromLayer(layer: MapLayerInput): { lat: number; lng: number } | null {
  if (!layer?.geojson?.features || !Array.isArray(layer.geojson.features)) return null;

  for (const f of layer.geojson.features) {
    const markerType = f?.properties?.__marker;
    const label = f?.properties?.label;
    const geom = f?.geometry;

    if (!geom || geom.type !== "Point") continue;
    const coords = geom.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;

    if (markerType === "dot" || label === "My Location") {
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }
  return null;
}

function FlyToMyLocation({ layers }: { layers: MapLayerInput[] }) {
  const map = useMap();

  const loc = useMemo(() => {
    const myLayer = layers.find((l) => l.id === MY_LOC_LAYER_ID) ?? null;
    if (myLayer) {
      const p = extractMyLocationLatLngFromLayer(myLayer);
      if (p) return p;
    }
    for (const l of layers) {
      const p = extractMyLocationLatLngFromLayer(l);
      if (p) return p;
    }
    return null;
  }, [layers]);

  const locSig = loc ? `${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}` : "none";

  useEffect(() => {
    if (!loc) return;

    const current = map.getZoom?.() ?? 0;
    const targetZoom = Math.max(current, 16);

    try {
      map.flyTo([loc.lat, loc.lng], targetZoom, { animate: true, duration: 0.85 });
    } catch {
      try {
        map.setView([loc.lat, loc.lng], targetZoom);
      } catch {}
    }

    const t1 = setTimeout(() => safeInvalidate(map), 0);
    const t2 = setTimeout(() => safeInvalidate(map), 200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [locSig, map]);

  return null;
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
        if (l.id === MY_LOC_LAYER_ID) continue; // ✅ exclude My Location
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

export default function ResultMap(props: Props) {
  const AnyMapContainer = MapContainer as any;
  const AnyTileLayer = TileLayer as any;
  const AnyGeoJSON = GeoJSON as any;
  const AnyLayersControl = LayersControl as any;
  const AnyPane = Pane as any;

  const showBasemap = props.showBasemap ?? true;
  const backgroundColor = props.backgroundColor ?? "#ffffff";

  const containerRef = useRef<HTMLDivElement | null>(null);

  const normalizedLayers: MapLayerInput[] = useMemo(() => {
    if (props.layers?.length) {
      return props.layers
        .filter((l) => l?.geojson?.type === "FeatureCollection")
        .map((l) => ({ ...l, color: l.color || DEFAULT_FALLBACK_COLOR }));
    }
    if (props.geojson?.type === "FeatureCollection") {
      return [{ id: "single", name: "Layer", color: DEFAULT_FALLBACK_COLOR, geojson: props.geojson, orderNo: 1 }];
    }
    return [];
  }, [props.layers, props.geojson]);

  const orderedLayers = useMemo(
    () => normalizedLayers.slice().sort((a, b) => (a.orderNo ?? 9999) - (b.orderNo ?? 9999)),
    [normalizedLayers]
  );

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
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
      <AnyMapContainer
        key={mapKey}
        center={[17.7, 121.7]}
        zoom={8}
        zoomControl
        attributionControl={showBasemap}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          borderRadius: 16,
          border: "1px solid #e5e5e5",
          background: backgroundColor,
        }}
        whenReady={(ctx: any) => {
          ctx?.target?.invalidateSize?.();
          setTimeout(() => ctx?.target?.invalidateSize?.(), 200);
        }}
      >
        {/* ✅ NEW: real fix for panel/dock resize */}
        <InvalidateOnContainerResize containerRef={containerRef} />

        <InvalidateOnEvents />
        <InvalidateOnBasemapToggle showBasemap={showBasemap} />

        {/* ✅ forward map move/click */}
        <ForwardMapEvents onMapMouseMove={props.onMapMouseMove} onMapClick={props.onMapClick} />

        {/* ✅ fly to "My Location" */}
        <FlyToMyLocation layers={orderedLayers} />

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

        {props.layers?.length ? <FitToMany layers={orderedLayers} /> : <FitToGeoJson geojson={props.geojson ?? null} />}

        {orderedLayers.map((layer) => {
          const feats = layer.geojson?.features;
          if (!Array.isArray(feats) || feats.length === 0) return null;

          const isMyLocLayer = layer.id === MY_LOC_LAYER_ID;
          const baseColor = layer.color || DEFAULT_FALLBACK_COLOR;
          const geoKey = `geo-${layer.id}-${feats.length}`;

          const paneName = isMyLocLayer ? MY_LOC_PANE : `pane-${layer.id}`;
          const z = isMyLocLayer ? 999999 : Z_BASE + (layer.orderNo ?? 0);

          return (
            <AnyPane key={`pane-${layer.id}`} name={paneName} style={{ zIndex: z }}>
              <AnyGeoJSON
                key={geoKey}
                data={layer.geojson}
                pane={paneName}
                style={(feature: any) => {
                  const c = getFeatureColor(feature, baseColor);
                  const markerType = feature?.properties?.__marker;
                  if (markerType === "accuracy") return undefined;
                  return styleForColor(c, isPolygonGeom(feature));
                }}
                pointToLayer={(feature: any, latlng: any) => {
                  const c = getFeatureColor(feature, baseColor);
                  const markerType = feature?.properties?.__marker;
                
                  // ✅ accuracy ring support (optional)
                  if (markerType === "accuracy") {
                    const acc = Number(feature?.properties?.accuracy_m ?? feature?.properties?.accuracy ?? 0);
                    const radius = Number.isFinite(acc) && acc > 0 ? acc : 30;
                    return L.circle(latlng, { ...accuracyCircleStyle(c), radius });
                  }
                
                  // ✅ ALWAYS render My Location layer points as DOT (even if markerType missing)
                  if (layer.id === MY_LOC_LAYER_ID || markerType === "dot") {
                    return L.circleMarker(latlng, pointDotStyle(c));
                  }
                
                  return L.circleMarker(latlng, pointStyle(c));
                }}
                onEachFeature={(feature: any, leafletLayer: any) => {
                  bindPopupDENR(feature, leafletLayer);

                  const markerType = feature?.properties?.__marker;
                  const isDot = markerType === "dot";
                  const isAccuracy = markerType === "accuracy";

                  // keep ring behind dot
                  if (isAccuracy) {
                    try {
                      leafletLayer.bringToBack?.();
                    } catch {}
                  }
                  if (isMyLocLayer || isDot) {
                    try {
                      leafletLayer.bringToFront?.();
                    } catch {}
                  }

                  leafletLayer.on?.("click", () => {
                    const fid = getFeatureFid(feature);
                    if (fid != null && props.onFeatureFidClick) props.onFeatureFidClick(String(fid));

                    if (isMyLocLayer || isDot) {
                      try {
                        leafletLayer.bringToFront?.();
                      } catch {}
                    }
                  });
                }}
              />
            </AnyPane>
          );
        })}
      </AnyMapContainer>

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