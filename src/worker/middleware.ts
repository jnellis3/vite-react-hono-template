import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verifyJwt } from "./auth";

export async function requireAuth(c: Context<{ Bindings: Env; Variables: { userId?: number } }>, next: Next) {
  const token = getCookie(c, "auth");
  if (!token) return c.json({ error: "unauthorized" }, 401);
  const payload = await verifyJwt<{ sub: number }>(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "unauthorized" }, 401);
  // Optional: ensure token matches current_token
  const row = await c.env.DB.prepare("select current_token from users where id = ?").bind(payload.sub).first<{ current_token: string | null }>();
  if (!row || (row.current_token && row.current_token !== token)) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", payload.sub);
  await next();
}

