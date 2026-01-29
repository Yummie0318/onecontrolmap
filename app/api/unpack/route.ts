import { NextResponse } from "next/server";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import AdmZip from "adm-zip";

export const runtime = "nodejs";

function getBaseName(filename: string) {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(0, i) : filename;
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFilesRecursive(full)));
    else out.push(full);
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const savedAs = body?.savedAs;

    if (!savedAs || typeof savedAs !== "string") {
      return NextResponse.json({ ok: false, error: "Missing savedAs" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "uploads");
    const zipPath = path.join(uploadsDir, savedAs);

    await fs.access(zipPath);

    const unpackRoot = path.join(uploadsDir, "unpacked");
    await fs.mkdir(unpackRoot, { recursive: true });

    const base = getBaseName(savedAs);
    const destDir = path.join(unpackRoot, base);

    await fs.rm(destDir, { recursive: true, force: true });
    await fs.mkdir(destDir, { recursive: true });

    // Extract ZIP
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(destDir, true);

    // List extracted files
    const files = await listFilesRecursive(destDir);
    const lower = files.map((f) => f.toLowerCase());

    const shpIndex = lower.findIndex((f) => f.endsWith(".shp"));
    if (shpIndex === -1) {
      return NextResponse.json({ ok: false, error: "No .shp file found in ZIP" }, { status: 400 });
    }

    const shpPath = files[shpIndex];
    const shpBase = shpPath.slice(0, -4);

    const required = [".shp", ".shx", ".dbf", ".prj"];
    const missing: string[] = [];

    for (const ext of required) {
      const p = shpBase + ext;
      if (!fsSync.existsSync(p)) missing.push(ext);
    }

    if (missing.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing required shapefile parts",
          missing,
          foundFiles: files.map((f) => path.relative(destDir, f)),
        },
        { status: 400 }
      );
    }

    // Read PRJ text (for later CRS checking)
    const prjText = await fs.readFile(shpBase + ".prj", "utf8");

    return NextResponse.json({
      ok: true,
      destDir,
      shpPath,
      baseName: path.basename(shpBase),
      prjPreview: prjText.slice(0, 300),
      foundFiles: files.map((f) => path.relative(destDir, f)),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
