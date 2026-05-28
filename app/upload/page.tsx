"use client";

import { useRef, useState } from "react";
import AuthGuard from "@/app/components/AuthGuard";

export default function UploadPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function uploadSelectedFile(selected: File) {
    setLoading(true);
    setStatus("Uploading...");

    try {
      const form = new FormData();
      form.append("file", selected);
      if (name.trim()) form.append("name", name.trim());

      const res = await fetch("/api/layers/upload", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!data.ok) {
        setStatus(`❌ ${data.error}`);
        return;
      }

      setStatus(`✅ Uploaded: ${data.name} (${data.featureCount} features)`);
      setFile(null);

      // reset the file input so user can re-select the same file again if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      setStatus(`❌ Upload failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }

  async function onUploadClick() {
    // If no file chosen yet, open the picker
    if (!file) {
      fileInputRef.current?.click();
      return;
    }
    // If file already chosen, upload it
    await uploadSelectedFile(file);
  }

  return (
     <AuthGuard>  
    <div style={{ padding: 24, maxWidth: 640 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        Upload GeoJSON Layer
      </h1>

      <div style={{ display: "grid", gap: 10 }}>
        <input
          placeholder="Layer name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
        />

        {/* Hidden file input (we open it via button click) */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".geojson,application/geo+json,application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);

            // Auto-upload immediately after picking a file (optional)
            if (f) uploadSelectedFile(f);
          }}
        />

        <button
          type="button"
          onClick={onUploadClick}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #ddd",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Uploading..." : file ? "Upload Selected File" : "Choose File & Upload"}
        </button>

        <div style={{ fontSize: 14, opacity: 0.8 }}>
          {file ? `Selected: ${file.name}` : "No file selected"}
        </div>

        {status && <div style={{ whiteSpace: "pre-wrap" }}>{status}</div>}
      </div>
    </div>
        </AuthGuard>  
  );
}
