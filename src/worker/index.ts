import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { hashPassword, signJwt, verifyJwt, verifyPassword } from "./auth";

type Variables = { userId?: number };
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

// Simple health endpoint to verify D1 is wired
app.get("/api/db/health", async (c) => {
  try {
    const row = await c.env.DB.prepare("select 1 as ok").first<{ ok: number }>();
    return c.json({ ok: row?.ok === 1 });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// Auth: register
app.post("/api/auth/register", async (c) => {
  const { email, password, name } = await c.req.json<{ email?: string; password?: string; name?: string }>().catch(() => ({} as any));
  if (!email || !password) return c.json({ error: "email and password required" }, 400);
  try {
    const exists = await c.env.DB.prepare("select id from users where email = ?").bind(email).first();
    if (exists) return c.json({ error: "email already registered" }, 409);
    const pw = await hashPassword(password);
    const result = await c.env.DB.prepare(
      "insert into users (email, password_hash, name) values (?, ?, ?) returning id, email, name, created_at"
    ).bind(email, pw, name ?? null).first<{ id: number; email: string; name: string | null; created_at: string }>();
    return c.json({ user: result });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// Auth: login
app.post("/api/auth/login", async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>().catch(() => ({} as any));
  if (!email || !password) return c.json({ error: "email and password required" }, 400);
  try {
    const user = await c.env.DB.prepare(
      "select id, email, password_hash, name from users where email = ?"
    ).bind(email).first<{ id: number; email: string; password_hash: string; name: string | null }>();
    if (!user) return c.json({ error: "invalid credentials" }, 401);
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return c.json({ error: "invalid credentials" }, 401);
    const token = await signJwt({ sub: user.id, email: user.email, name: user.name, type: "access" }, c.env.JWT_SECRET);
    // store token for optional revocation tracking
    await c.env.DB.prepare("update users set current_token = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = ?")
      .bind(token, user.id)
      .run();
    setCookie(c, "auth", token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return c.json({ token });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// Auth: current user
app.get("/api/auth/me", async (c) => {
  const token = getCookie(c, "auth");
  if (!token) return c.json({ user: null }, 401);
  const data = await verifyJwt<{ sub: number; email: string; name: string | null }>(token, c.env.JWT_SECRET);
  if (!data) return c.json({ user: null }, 401);
  const user = await c.env.DB
    .prepare("select id, email, name, created_at from users where id = ?")
    .bind(data.sub)
    .first();
  return c.json({ user });
});

// Auth: logout
app.post("/api/auth/logout", async (c) => {
  const token = getCookie(c, "auth");
  if (token) deleteCookie(c, "auth");
  return c.json({ ok: true });
});

export default app;
