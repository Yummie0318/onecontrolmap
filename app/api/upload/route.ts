import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "No file uploaded (field name must be 'file')" },
        { status: 400 }
      );
    }

    // Basic validation: only allow .zip
    const originalName = file.name || "upload.zip";
    if (!originalName.toLowerCase().endsWith(".zip")) {
      return NextResponse.json(
        { ok: false, error: "Please upload a .zip file" },
        { status: 400 }
      );
    }

    // Save to /uploads
    const uploadsDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const targetPath = path.join(uploadsDir, originalName);

    // Convert File -> Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await fs.writeFile(targetPath, buffer);

    return NextResponse.json({
      ok: true,
      savedAs: originalName,
      sizeBytes: buffer.length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
