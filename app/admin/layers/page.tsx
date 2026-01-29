"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ResultMap from "@/app/components/ResultMapClient";

type LayerRow = {
  id: string;
  name: string;
  source_filename: string | null;
  geom_type: string | null;
  srid: number | null;
  feature_count: number | null;
  fields?: any;
  created_at?: string | null;
};

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text };
  }
}

export default function AdminLayersPage() {
  const [layers, setLayers] = useState<LayerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [geojson, setGeojson] = useState<any | null>(null);

  const [loadingList, setLoadingList] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  // Upload modal state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Force remount map when switching layers
  const mapKey = useMemo(() => selectedId ?? "none", [selectedId]);

  const featureCount = useMemo(() => geojson?.features?.length ?? 0, [geojson]);

  async function refresh() {
    setLoadingList(true);
    setError("");
    try {
      const r = await fetch("/api/layers", { cache: "no-store" });
      const text = await r.text();
      const j: any = safeJsonParse(text);

      if (!j.ok) throw new Error(j.error || "Failed to load layers");
      setLayers(j.layers || []);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setLoadingList(false);
    }
  }

  async function previewLayer(layerId: string) {
    setBusyId(layerId);
    setSelectedId(layerId);
    setGeojson(null);
    setError("");

    try {
      const r = await fetch(`/api/layers/${layerId}/geojson`, { cache: "no-store" });
      const text = await r.text();
      const j: any = safeJsonParse(text);

      if (!j.ok) throw new Error(j.error || "Failed to load GeoJSON");
      setGeojson(j.geojson ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function downloadGeoJSON(layerId: string, name: string) {
    setBusyId(layerId);
    setError("");
    try {
      const r = await fetch(`/api/layers/${layerId}/geojson`, { cache: "no-store" });
      const text = await r.text();
      const j: any = safeJsonParse(text);

      if (!j.ok) throw new Error(j.error || "Failed to get GeoJSON");
      const fc = j.geojson;
      if (!fc) throw new Error("API returned no geojson.");

      const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${(name || "layer").replace(/[^\w\-]+/g, "_")}.geojson`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteLayer(layerId: string, name: string) {
    const ok = confirm(`Delete layer "${name}"?\n\nThis will also delete all its features.`);
    if (!ok) return;

    setBusyId(layerId);
    setError("");
    try {
      const r = await fetch(`/api/layers/${layerId}`, { method: "DELETE" });
      const text = await r.text();
      const j: any = safeJsonParse(text);

      if (!j.ok) throw new Error(j.error || "Delete failed");

      if (selectedId === layerId) {
        setSelectedId(null);
        setGeojson(null);
      }

      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setBusyId(null);
    }
  }

  // ---- Upload helpers ----
  function openUpload() {
    setUploadStatus("");
    setUploadName("");
    setShowUpload(true);
    // reset file input if exists
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function closeUpload() {
    if (uploading) return;
    setShowUpload(false);
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadStatus("Uploading...");
    setError("");

    try {
      const form = new FormData();
      form.append("file", file);
      if (uploadName.trim()) form.append("name", uploadName.trim());

      const res = await fetch("/api/layers/upload", {
        method: "POST",
        body: form,
      });

      const text = await res.text();
      const data: any = safeJsonParse(text);

      if (!data.ok) {
        setUploadStatus(`❌ ${data.error ?? "Upload failed"}`);
        return;
      }

      setUploadStatus(`✅ Uploaded: ${data.name} (${data.featureCount} features)`);

      // Refresh list
      await refresh();

      // Optional: auto-preview uploaded layer if API returns layerId
      if (data.layerId) {
        await previewLayer(data.layerId);
      }

      // keep modal open so you can upload more, or auto-close:
      // setShowUpload(false);
    } catch (e: any) {
      setUploadStatus(`❌ Upload failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === selectedId) ?? null,
    [layers, selectedId]
  );

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Admin • Layer Manager</h1>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={openUpload}
            disabled={loadingList}
            title="Upload layer"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              cursor: loadingList ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
          >
            + Upload
          </button>

          <button
            onClick={refresh}
            disabled={loadingList}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              cursor: loadingList ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {loadingList ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ marginTop: 10, color: "crimson", whiteSpace: "pre-wrap" }}>❌ {error}</div>
      ) : null}

      {/* Upload Modal */}
      {showUpload ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeUpload}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              background: "white",
              borderRadius: 16,
              border: "1px solid #e5e5e5",
              padding: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Upload GeoJSON Layer</div>

              <button
                type="button"
                onClick={closeUpload}
                disabled={uploading}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: "8px 10px",
                  cursor: uploading ? "not-allowed" : "pointer",
                  fontWeight: 800,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <input
                placeholder="Layer name (optional)"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
              />

              <input
                ref={fileInputRef}
                type="file"
                accept=".geojson,application/geo+json,application/json"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                }}
              />

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={closeUpload}
                  disabled={uploading}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    cursor: uploading ? "not-allowed" : "pointer",
                    fontWeight: 700,
                  }}
                >
                  Close
                </button>
              </div>

              {uploadStatus ? <div style={{ whiteSpace: "pre-wrap" }}>{uploadStatus}</div> : null}

              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Tip: Your map expects EPSG:4326 (WGS84 lon/lat). If your file is EPSG:32651 (UTM),
                export/reproject to 4326 first or transform on API output.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12, marginTop: 12 }}>
        {/* LEFT: TABLE */}
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 16, overflow: "hidden", background: "white" }}>
          <div style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 800 }}>
            Layers ({layers.length})
          </div>

          <div style={{ overflow: "auto", maxHeight: "75vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#fafafa", textAlign: "left" }}>
                  <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Name</th>
                  <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Geom</th>
                  <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Features</th>
                  <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {layers.map((l) => {
                  const busy = busyId === l.id;
                  const active = selectedId === l.id;

                  return (
                    <tr key={l.id} style={{ background: active ? "#fffef2" : "white" }}>
                      <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                        <div style={{ fontWeight: 700 }}>{l.name}</div>
                        <div style={{ opacity: 0.7, fontSize: 12 }}>
                          {l.source_filename ?? "-"} • SRID {l.srid ?? "-"}
                        </div>
                        <div style={{ opacity: 0.55, fontSize: 11 }}>id: {l.id}</div>
                      </td>

                      <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>{l.geom_type ?? "-"}</td>

                      <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>{l.feature_count ?? 0}</td>

                      <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() => previewLayer(l.id)}
                            disabled={busy}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 12,
                              border: "1px solid #ddd",
                              cursor: busy ? "not-allowed" : "pointer",
                              fontWeight: 700,
                            }}
                          >
                            {busy ? "Loading..." : "Preview"}
                          </button>

                          <button
                            onClick={() => downloadGeoJSON(l.id, l.name)}
                            disabled={busy}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 12,
                              border: "1px solid #ddd",
                              cursor: busy ? "not-allowed" : "pointer",
                              fontWeight: 700,
                            }}
                          >
                            Download
                          </button>

                          <button
                            onClick={() => deleteLayer(l.id, l.name)}
                            disabled={busy}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 12,
                              border: "1px solid #ffcccc",
                              cursor: busy ? "not-allowed" : "pointer",
                              fontWeight: 800,
                              color: "crimson",
                              background: "#fff7f7",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {layers.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 14, opacity: 0.7 }}>
                      No layers yet. Click <b>+ Upload</b> to add one.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: MAP PREVIEW */}
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 16, overflow: "hidden", background: "white" }}>
          <div style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 800 }}>
            Preview {selectedLayer ? `— ${selectedLayer.name}` : ""}
          </div>

          <div style={{ padding: "8px 12px", fontSize: 12, opacity: 0.7 }}>
            {geojson ? `features: ${featureCount}` : "geojson: null"}
          </div>

          <div style={{ height: "75vh" }}>
            <ResultMap key={mapKey} geojson={geojson} />
          </div>
        </div>
      </div>
    </div>
  );
}
