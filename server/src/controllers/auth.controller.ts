import type { Request, Response } from "express";
import { pool } from "../config/db.js";
import { verifyPassword } from "../utils/password.js";
import { AUTH_COOKIE_MAX_AGE_MS, AUTH_COOKIE_NAME, signAuthToken, verifyAuthToken } from "../utils/jwt.js";
import { env } from "../config/env.js";

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  avatar_url: string | null;
}

function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  });
}

async function loadPublicUser(userId: string) {
  const { rows } = await pool.query<Omit<UserRow, "password_hash">>(
    `SELECT id, email, name, avatar_url FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const { rows } = await pool.query<UserRow>(`SELECT * FROM users WHERE email = $1`, [email]);
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signAuthToken({ userId: user.id, email: user.email });
  setAuthCookie(res, token);
  res.json({ id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url });
}

export async function me(req: Request, res: Response) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const payload = verifyAuthToken(token);
    const user = await loadPublicUser(payload.userId);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    res.json({ id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url });
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME);
  res.status(204).end();
}
