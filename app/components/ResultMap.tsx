// C:\Users\Yummie03\Desktop\onemap\app\components\ResultMap.tsx
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
import React, { useEffect, useMemo } from "react";
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

type Props = ResultMapProps & {
  showBasemap?: boolean;
  backgroundColor?: string;
};

const DEFAULT_FALLBACK_COLOR = "#0b1220";

/** ✅ your injected layer id in viewmap/page.tsx */
const MY_LOC_LAYER_ID = "__my_location__";
/** ✅ dedicated pane for My Location (always on top) */
const MY_LOC_PANE = "pane-my-location";

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

/** ✅ get "My Location" coords if present in a layer */
function extractMyLocationLatLngFromLayer(layer: MapLayerInput): { lat: number; lng: number } | null {
  if (!layer?.geojson?.features || !Array.isArray(layer.geojson.features)) return null;

  for (const f of layer.geojson.features) {
    const markerType = f?.properties?.__marker;
    const label = f?.properties?.label;
    const geom = f?.geometry;

    if (!geom || geom.type !== "Point") continue;
    const coords = geom.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;

    // Accept either your explicit __marker=dot or label=My Location
    if (markerType === "dot" || label === "My Location") {
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }
  return null;
}

/** ✅ fly to My Location when it updates */
function FlyToMyLocation({ layers }: { layers: MapLayerInput[] }) {
  const map = useMap();

  const loc = useMemo(() => {
    // Prefer the injected My Location layer id
    const myLayer = layers.find((l) => l.id === MY_LOC_LAYER_ID) ?? null;
    if (myLayer) {
      const p = extractMyLocationLatLngFromLayer(myLayer);
      if (p) return p;
    }

    // Fallback: search any layer for __marker=dot
    for (const l of layers) {
      const p = extractMyLocationLatLngFromLayer(l);
      if (p) return p;
    }
    return null;
  }, [layers]);

  const locSig = loc ? `${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}` : "none";

  useEffect(() => {
    if (!loc) return;

    // ✅ Make sure location is visible even when super zoomed:
    // keep at least 16, but DO NOT force higher than maxZoom.
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
        // ✅ IMPORTANT: do NOT include My Location in fit bounds
        if (l.id === MY_LOC_LAYER_ID) continue;

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

function styleForColor(color: string, isPolygon: boolean, isSelected: boolean) {
  return {
    color,
    weight: isSelected ? 4 : 2.5,
    opacity: 0.95,
    fillColor: color,
    fillOpacity: isPolygon ? (isSelected ? 0.36 : 0.28) : 0,
  } as L.PathOptions;
}

// ✅ default point style (with outline)
function pointStyle(color: string, isSelected: boolean) {
  return {
    radius: isSelected ? 6 : 5,
    color,
    weight: isSelected ? 3 : 2,
    opacity: 0.95,
    fillColor: color,
    fillOpacity: 0.85,
  } as L.CircleMarkerOptions;
}

// ✅ plain dot (no outline) for "My Location"
function pointDotStyle(color: string, isSelected: boolean) {
  return {
    radius: isSelected ? 7 : 6, // ✅ make it slightly bigger so it stays visible
    stroke: false,
    weight: 0,
    opacity: 1,
    fillColor: color,
    fillOpacity: 1,
  } as L.CircleMarkerOptions;
}

function getFeatureColor(feature: any, layerColor: string) {
  const c = feature?.properties?.__color;
  if (typeof c === "string" && c.trim()) return c.trim();
  return layerColor;
}

function getFeatureFid(feature: any) {
  return feature?.id ?? feature?.properties?.__fid ?? feature?.properties?.fid ?? null;
}

function isPolygonGeom(feature: any) {
  const t = feature?.geometry?.type;
  return t === "Polygon" || t === "MultiPolygon";
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
    return orderedLayers.some(
      (l) => Array.isArray(l.geojson?.features) && l.geojson.features.length > 0
    );
  }, [orderedLayers]);

  const mapKey = useMemo(() => {
    const ids = orderedLayers.map((l) => l.id).join("|");
    const counts = orderedLayers
      .map((l) => (Array.isArray(l.geojson?.features) ? l.geojson.features.length : 0))
      .join(",");
    const orders = orderedLayers.map((l) => `${l.id}:${l.orderNo ?? 0}`).join("|");
    const sel = props.selectedFid ? String(props.selectedFid) : "none";
    return `map-${ids}-${counts}-${orders}-${sel}`;
  }, [orderedLayers, props.selectedFid]);

  const Z_BASE = 450;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
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
        <InvalidateOnEvents />
        <InvalidateOnBasemapToggle showBasemap={showBasemap} />

        {/* ✅ Pan/zoom to My Location when it updates */}
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

        {/* ✅ fit bounds still works whether basemap is ON or OFF */}
        {props.layers?.length ? (
          <FitToMany layers={orderedLayers} />
        ) : (
          <FitToGeoJson geojson={props.geojson ?? null} />
        )}

        {orderedLayers.map((layer) => {
          const feats = layer.geojson?.features;
          const hasData = Array.isArray(feats) && feats.length > 0;
          if (!hasData) return null;

          const isMyLocLayer = layer.id === MY_LOC_LAYER_ID;

          const baseColor = layer.color || DEFAULT_FALLBACK_COLOR;
          const geoKey = `geo-${layer.id}-${feats.length}`;

          // ✅ My Location gets its own pane and extreme zIndex so it never hides
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
                  const fid = getFeatureFid(feature);
                  const selected =
                    props.selectedFid != null &&
                    fid != null &&
                    String(fid) === String(props.selectedFid);
                  const poly = isPolygonGeom(feature);
                  return styleForColor(c, poly, selected);
                }}
                pointToLayer={(feature: any, latlng: any) => {
                  const c = getFeatureColor(feature, baseColor);
                  const fid = getFeatureFid(feature);
                  const selected =
                    props.selectedFid != null &&
                    fid != null &&
                    String(fid) === String(props.selectedFid);

                  const markerType = feature?.properties?.__marker;
                  if (markerType === "dot") return L.circleMarker(latlng, pointDotStyle(c, selected));
                  return L.circleMarker(latlng, pointStyle(c, selected));
                }}
                onEachFeature={(feature: any, leafletLayer: any) => {
                  bindPopupDENR(feature, leafletLayer);

                  const markerType = feature?.properties?.__marker;
                  const isDot = markerType === "dot";

                  // ✅ force dot (and the whole my-location layer) to stay on top
                  if (isMyLocLayer || isDot) {
                    try {
                      leafletLayer.bringToFront?.();
                    } catch {}
                  }

                  leafletLayer.on?.("click", () => {
                    const fid = getFeatureFid(feature);
                    if (fid != null && props.onFeatureFidClick) props.onFeatureFidClick(String(fid));

                    // ✅ re-bring to front on click (some browsers reorder SVG)
                    if (isMyLocLayer || isDot) {
                      try {
                        leafletLayer.bringToFront?.();
                      } catch {}
                    }
                  });

                  leafletLayer.on?.("mouseover", () => {
                    const c = getFeatureColor(feature, baseColor);
                    const fid = getFeatureFid(feature);
                    const selected =
                      props.selectedFid != null &&
                      fid != null &&
                      String(fid) === String(props.selectedFid);

                    try {
                      if (isPolygonGeom(feature)) {
                        leafletLayer.setStyle?.({
                          ...styleForColor(c, true, selected),
                          weight: selected ? 5 : 4,
                          fillOpacity: selected ? 0.42 : 0.38,
                        });
                      } else if (markerType === "dot") {
                        leafletLayer.setStyle?.(pointDotStyle(c, true));
                      } else {
                        leafletLayer.setStyle?.(pointStyle(c, true));
                      }
                    } catch {}

                    if (isMyLocLayer || isDot) {
                      try {
                        leafletLayer.bringToFront?.();
                      } catch {}
                    }
                  });

                  leafletLayer.on?.("mouseout", () => {
                    const c = getFeatureColor(feature, baseColor);
                    const fid = getFeatureFid(feature);
                    const selected =
                      props.selectedFid != null &&
                      fid != null &&
                      String(fid) === String(props.selectedFid);

                    try {
                      if (isPolygonGeom(feature)) leafletLayer.setStyle?.(styleForColor(c, true, selected));
                      else if (markerType === "dot") leafletLayer.setStyle?.(pointDotStyle(c, selected));
                      else leafletLayer.setStyle?.(pointStyle(c, selected));
                    } catch {}

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