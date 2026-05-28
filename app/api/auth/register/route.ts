import { NextResponse } from "next/server";
import { poolDb2 } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = String(body?.username ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!username || !email || !password) {
      return NextResponse.json(
        { ok: false, error: "All fields are required." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { ok: false, error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const client = await poolDb2.connect();
    try {
      // Check if username or email already exists
      const { rows: existing } = await client.query(
        `SELECT id FROM public.users_login
         WHERE username = $1 OR email = $2
         LIMIT 1`,
        [username, email]
      );

      if (existing.length > 0) {
        return NextResponse.json(
          { ok: false, error: "Username or email already taken." },
          { status: 409 }
        );
      }

      // Insert new user with pgcrypto crypt()
      const { rows } = await client.query(
        `INSERT INTO public.users_login (username, email, password_hash, usertype)
         VALUES ($1, $2, crypt($3, gen_salt('bf')), 'user')
         RETURNING id, username, email, usertype`,
        [username, email, password]
      );

      return NextResponse.json({ ok: true, user: rows[0] });
    } finally {
      client.release();
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Registration failed." },
      { status: 500 }
    );
  }
}