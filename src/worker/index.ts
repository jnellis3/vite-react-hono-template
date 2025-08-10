import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { hashPassword, signJwt, verifyJwt, verifyPassword } from "./auth";
import { requireAuth } from "./middleware";

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
// Social routes

// Create a post
app.post("/api/posts", requireAuth, async (c) => {
  const userId = c.get("userId")!;
  const { content } = await c.req.json<{ content?: string }>().catch(() => ({} as any));
  if (!content || content.trim().length === 0) return c.json({ error: "content required" }, 400);
  if (content.length > 500) return c.json({ error: "content too long (max 500)" }, 400);
  try {
    const post = await c.env.DB.prepare(
      "insert into posts (author_id, content) values (?, ?) returning id, author_id, content, created_at"
    ).bind(userId, content.trim()).first<{ id: number; author_id: number; content: string; created_at: string }>();
    // Background AI reply if mentioned
    if (post && /(^|\s)@ai(\b|[^\w])/i.test(content)) {
      c.executionCtx.waitUntil(handleAiReply(c.env, post.id, content));
    }
    return c.json({ post });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// Timeline: posts by me + who I follow
app.get("/api/posts/timeline", requireAuth, async (c) => {
  const userId = c.get("userId")!;
  const url = new URL(c.req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(20, parseInt(url.searchParams.get("limit") || "20", 10) || 20);
  const params: any[] = [userId, userId];
  let whereCursor = "";
  if (cursor) {
    whereCursor = " and p.id < ?";
    params.push(Number(cursor));
  }
  try {
    const stmt = c.env.DB.prepare(
      `select p.id, p.content, p.created_at,
              u.id as author_id, coalesce(u.display_name, u.name) as author_name, u.handle,
              (select count(*) from likes l where l.post_id = p.id) as like_count,
              (select count(*) from comments cm where cm.post_id = p.id) as comment_count,
              exists(select 1 from likes l2 where l2.post_id = p.id and l2.user_id = ?) as liked
       from posts p
       join users u on u.id = p.author_id
       where (p.author_id = ? or p.author_id in (select followee_id from follows where follower_id = ?))
       ${whereCursor}
       order by p.id desc
       limit ?`
    ).bind(userId, userId, userId, ...(cursor ? [Number(cursor)] : []), limit);
    const { results } = await stmt.all();
    const nextCursor = results.length === limit ? results[results.length - 1].id : null;
    return c.json({ items: results, nextCursor });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// Like a post
app.post("/api/posts/:id/like", requireAuth, async (c) => {
  const userId = c.get("userId")!;
  const id = Number(c.req.param("id"));
  try {
    await c.env.DB.prepare("insert or ignore into likes (user_id, post_id) values (?, ?)").bind(userId, id).run();
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// Unlike a post
app.delete("/api/posts/:id/like", requireAuth, async (c) => {
  const userId = c.get("userId")!;
  const id = Number(c.req.param("id"));
  try {
    await c.env.DB.prepare("delete from likes where user_id = ? and post_id = ?").bind(userId, id).run();
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// Comment on a post
app.post("/api/posts/:id/comments", requireAuth, async (c) => {
  const userId = c.get("userId")!;
  const postId = Number(c.req.param("id"));
  const { content } = await c.req.json<{ content?: string }>().catch(() => ({} as any));
  if (!content || content.trim().length === 0) return c.json({ error: "content required" }, 400);
  if (content.length > 400) return c.json({ error: "comment too long (max 400)" }, 400);
  try {
    const comment = await c.env.DB.prepare(
      "insert into comments (post_id, author_id, content) values (?, ?, ?) returning id, post_id, author_id, content, created_at"
    ).bind(postId, userId, content.trim()).first();
    return c.json({ comment });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// List comments
app.get("/api/posts/:id/comments", async (c) => {
  const postId = Number(c.req.param("id"));
  try {
    const { results } = await c.env.DB.prepare(
      `select cm.id, cm.content, cm.created_at, u.id as author_id, coalesce(u.display_name, u.name) as author_name, u.handle
       from comments cm join users u on u.id = cm.author_id
       where cm.post_id = ? order by cm.id desc limit 50`
    ).bind(postId).all();
    return c.json({ items: results });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// Follow / Unfollow
app.post("/api/users/:id/follow", requireAuth, async (c) => {
  const followerId = c.get("userId")!;
  const followeeId = Number(c.req.param("id"));
  if (followerId === followeeId) return c.json({ error: "cannot follow yourself" }, 400);
  try {
    await c.env.DB.prepare("insert or ignore into follows (follower_id, followee_id) values (?, ?)").bind(followerId, followeeId).run();
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});
app.delete("/api/users/:id/follow", requireAuth, async (c) => {
  const followerId = c.get("userId")!;
  const followeeId = Number(c.req.param("id"));
  try {
    await c.env.DB.prepare("delete from follows where follower_id = ? and followee_id = ?").bind(followerId, followeeId).run();
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// Profiles
app.get("/api/users/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const user = await c.env.DB.prepare(
    "select id, email, handle, display_name, bio, avatar_url, banner_url, created_at from users where id = ?"
  ).bind(id).first();
  if (!user) return c.json({ error: "not found" }, 404);
  return c.json({ user });
});

app.patch("/api/me/profile", requireAuth, async (c) => {
  const userId = c.get("userId")!;
  const body = await c.req.json().catch(() => ({}));
  const { handle, display_name, bio, avatar_url, banner_url } = body as Record<string, string | undefined>;
  try {
    // Basic safe update
    await c.env.DB.prepare(
      `update users set
         handle = coalesce(?, handle),
         display_name = coalesce(?, display_name),
         bio = coalesce(?, bio),
         avatar_url = coalesce(?, avatar_url),
         banner_url = coalesce(?, banner_url),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       where id = ?`
    ).bind(handle ?? null, display_name ?? null, bio ?? null, avatar_url ?? null, banner_url ?? null, userId).run();
    const user = await c.env.DB.prepare(
      "select id, email, handle, display_name, bio, avatar_url, banner_url, created_at from users where id = ?"
    ).bind(userId).first();
    return c.json({ user });
  } catch (e) {
    const msg = String(e);
    if (msg.includes("UNIQUE") && msg.includes("handle")) return c.json({ error: "handle already taken" }, 409);
    return c.json({ error: msg }, 500);
  }
});

// Public Explore: latest posts across all users
app.get("/api/posts/explore", async (c) => {
  // Try to resolve optional userId from cookie for 'liked' flag
  let viewerId: number | null = null;
  const token = getCookie(c, "auth");
  if (token) {
    const payload = await verifyJwt<{ sub: number }>(token, c.env.JWT_SECRET);
    if (payload) viewerId = payload.sub;
  }
  try {
    const stmt = c.env.DB.prepare(
      `select p.id, p.content, p.created_at,
              u.id as author_id, coalesce(u.display_name, u.name) as author_name, u.handle,
              (select count(*) from likes l where l.post_id = p.id) as like_count,
              (select count(*) from comments cm where cm.post_id = p.id) as comment_count,
              ${viewerId ? `exists(select 1 from likes l2 where l2.post_id = p.id and l2.user_id = ${viewerId})` : `0`} as liked
       from posts p join users u on u.id = p.author_id
       order by p.id desc
       limit 50`
    );
    const { results } = await stmt.all();
    return c.json({ items: results });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// Public: posts by a specific user
app.get("/api/users/:id/posts", async (c) => {
  const authorId = Number(c.req.param("id"));
  // Optional viewer to compute liked
  let viewerId: number | null = null;
  const token = getCookie(c, "auth");
  if (token) {
    const payload = await verifyJwt<{ sub: number }>(token, c.env.JWT_SECRET);
    if (payload) viewerId = payload.sub;
  }
  try {
    const stmt = c.env.DB.prepare(
      `select p.id, p.content, p.created_at,
              u.id as author_id, coalesce(u.display_name, u.name) as author_name, u.handle,
              (select count(*) from likes l where l.post_id = p.id) as like_count,
              (select count(*) from comments cm where cm.post_id = p.id) as comment_count,
              ${viewerId ? `exists(select 1 from likes l2 where l2.post_id = p.id and l2.user_id = ${viewerId})` : `0`} as liked
       from posts p join users u on u.id = p.author_id
       where p.author_id = ?
       order by p.id desc
       limit 50`
    ).bind(authorId);
    const { results } = await stmt.all();
    return c.json({ items: results });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// Trending tags from recent posts (#tag)
app.get("/api/trending", async (c) => {
  const limit = Math.min(10, parseInt(new URL(c.req.url).searchParams.get("limit") || "5", 10) || 5);
  try {
    const { results } = await c.env.DB.prepare(
      `select content from posts order by id desc limit 200`
    ).all<{ content: string }>();
    const counts = new Map<string, number>();
    const re = /(^|\s)#([\p{L}\p{N}_]{2,30})/gu;
    for (const row of results) {
      if (!row.content) continue;
      const seenInPost = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = re.exec(row.content)) !== null) {
        const tag = m[2].toLowerCase();
        if (seenInPost.has(tag)) continue;
        seenInPost.add(tag);
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    const items = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));
    return c.json({ items });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// Utilities: AI reply handler
async function handleAiReply(env: Env, postId: number, raw: string) {
  try {
    if (!env.OPENAI_API_KEY) return; // no-op if unset
    const content = raw.replace(/(^|\s)@ai(\b|[^\w])/gi, " ").trim().slice(0, 1000);
    const aiUserId = await ensureAiUser(env);
    const reply = await generateAiReply(env, content);
    if (!reply) return;
    await env.DB.prepare(
      "insert into comments (post_id, author_id, content) values (?, ?, ?)"
    ).bind(postId, aiUserId, reply.slice(0, 800)).run();
  } catch (e) {
    // Best-effort; swallow errors
    console.error("AI reply failed", e);
  }
}

async function ensureAiUser(env: Env): Promise<number> {
  const existing = await env.DB.prepare(
    "select id from users where handle = 'ai' or email = 'ai@railtalk.system'"
  ).first<{ id: number }>();
  if (existing?.id) return existing.id;
  const pw = await hashPassword(crypto.randomUUID() + Date.now());
  const row = await env.DB.prepare(
    "insert into users (email, password_hash, name, handle, display_name, bio) values (?, ?, ?, ?, ?, ?) returning id"
  )
    .bind(
      "ai@railtalk.system",
      pw,
      "Rail AI",
      "ai",
      "Rail AI",
      "Automated assistant conductor that replies to @ai."
    )
    .first<{ id: number }>();
  return row!.id;
}

async function generateAiReply(env: Env, userContent: string): Promise<string | null> {
  try {
    const sys =
      "You are Rail AI, a friendly, concise assistant with a railfan vibe. " +
      "Reply helpfully to the user's post. Be safe, avoid private data, and keep it under 120 words.";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        max_tokens: 220,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userContent || "Say hello to the railfans!" },
        ],
      }),
    });
    if (!res.ok) {
      console.error("OpenAI error", await res.text());
      return null;
    }
    const data = (await res.json()) as any;
    const out: string | undefined = data.choices?.[0]?.message?.content;
    return out?.trim() || null;
  } catch (e) {
    console.error("OpenAI fetch failed", e);
    return null;
  }
}

// Who to follow suggestions
app.get("/api/who-to-follow", async (c) => {
  // Optional viewer to filter out self and already-followed
  let viewerId: number | null = null;
  const token = getCookie(c, "auth");
  if (token) {
    const payload = await verifyJwt<{ sub: number }>(token, c.env.JWT_SECRET);
    if (payload) viewerId = payload.sub;
  }
  try {
    if (viewerId) {
      const stmt = c.env.DB.prepare(
        `select u.id, coalesce(u.display_name, u.name, u.email) as name, u.handle,
                coalesce((select count(*) from follows f2 where f2.followee_id = u.id), 0) as followers
         from users u
         where u.id != ?
           and u.id not in (select followee_id from follows where follower_id = ?)
           and (u.handle is null or u.handle != 'ai')
         order by followers desc, u.id desc
         limit 5`
      ).bind(viewerId, viewerId);
      const { results } = await stmt.all();
      return c.json({ items: results });
    } else {
      const stmt = c.env.DB.prepare(
        `select u.id, coalesce(u.display_name, u.name, u.email) as name, u.handle,
                coalesce((select count(*) from follows f2 where f2.followee_id = u.id), 0) as followers
         from users u
         where (u.handle is null or u.handle != 'ai')
         order by followers desc, u.id desc
         limit 5`
      );
      const { results } = await stmt.all();
      return c.json({ items: results });
    }
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});
