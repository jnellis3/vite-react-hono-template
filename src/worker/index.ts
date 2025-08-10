import { Hono } from "hono";
const app = new Hono<{ Bindings: Env }>();

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

export default app;
