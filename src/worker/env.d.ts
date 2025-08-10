// Local augmentation for Worker Env bindings.
// Wrangler will generate worker-configuration.d.ts; we extend it here.
interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  // Set via Wrangler secret or Cloudflare UI
  OPENAI_API_KEY?: string;
}
