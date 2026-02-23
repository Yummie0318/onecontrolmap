import { NextResponse } from "next/server";
import { poolDb2 } from "@/lib/db"; // ✅ use new database

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");

    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: "Username and password are required." },
        { status: 400 }
      );
    }

    const client = await poolDb2.connect(); // ✅ NEW DB
    try {
      const { rows } = await client.query(
        `
        SELECT id, username, email, usertype
        FROM public.users_login
        WHERE username = $1
          AND password_hash = crypt($2, password_hash)
        LIMIT 1
        `,
        [username, password]
      );

      if (rows.length === 0) {
        return NextResponse.json(
          { ok: false, error: "Invalid username or password." },
          { status: 401 }
        );
      }

      const user = rows[0];

      return NextResponse.json({
        ok: true,
        user,
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Login failed" },
      { status: 500 }
    );
  }
}