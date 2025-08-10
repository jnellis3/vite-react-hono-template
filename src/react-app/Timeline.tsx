import { useEffect, useState } from "react";

type Me = { id: number; email: string; name?: string | null; handle?: string | null } | null;
type Post = {
  id: number;
  content: string;
  created_at: string;
  author_id: number;
  author_name?: string | null;
  handle?: string | null;
  like_count: number;
  comment_count: number;
  liked: number | boolean;
};

type Comment = { id: number; content: string; created_at: string; author_id: number; author_name?: string | null; handle?: string | null };

export default function Timeline({ onOpenProfile }: { onOpenProfile: (id: number) => void }) {
  const [me, setMe] = useState<Me>(null);
  const [items, setItems] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [content, setContent] = useState("");
  const [commentFor, setCommentFor] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<Record<number, { open: boolean; loading: boolean; items: Comment[] }>>({});

  const refreshMe = async () => {
    const r = await fetch("/api/auth/me");
    if (r.ok) setMe((await r.json()).user);
    else setMe(null);
  };

  const loadTimeline = async (cursor?: number | null) => {
    const url = new URL("/api/posts/timeline", location.origin);
    if (cursor) url.searchParams.set("cursor", String(cursor));
    const r = await fetch(url);
    if (!r.ok) return;
    const data = (await r.json()) as { items: Post[]; nextCursor: number | null };
    setItems((prev) => (cursor ? [...prev, ...data.items] : data.items));
    setNextCursor(data.nextCursor);
  };

  useEffect(() => {
    refreshMe().then(() => loadTimeline());
  }, []);

  const submitPost = async () => {
    if (!content.trim()) return;
    setPosting(true);
    try {
      const r = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (r.ok) {
        setContent("");
        await loadTimeline();
      }
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = async (post: Post) => {
    const url = `/api/posts/${post.id}/like`;
    if (post.liked) await fetch(url, { method: "DELETE" });
    else await fetch(url, { method: "POST" });
    await loadTimeline();
  };

  const submitComment = async (postId: number) => {
    if (!commentText.trim()) return;
    const r = await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: commentText }),
    });
    if (r.ok) {
      setCommentText("");
      setCommentFor(null);
      await loadTimeline();
      if (comments[postId]?.open) await loadComments(postId);
    }
  };

  const loadComments = async (postId: number) => {
    setComments((m) => ({ ...m, [postId]: { ...(m[postId] || { open: true, loading: true, items: [] }), loading: true } }));
    const r = await fetch(`/api/posts/${postId}/comments`);
    if (r.ok) {
      const data = (await r.json()) as { items: Comment[] };
      setComments((m) => ({ ...m, [postId]: { open: true, loading: false, items: data.items } }));
    } else {
      setComments((m) => ({ ...m, [postId]: { ...(m[postId] || { open: false, loading: false, items: [] }), loading: false } }));
    }
  };

  const toggleCommentsOpen = async (postId: number) => {
    const state = comments[postId];
    if (!state || !state.open) {
      await loadComments(postId);
    } else {
      setComments((m) => ({ ...m, [postId]: { ...state, open: false } }));
    }
  };

  return (
    <div>
      <header style={{ padding: 12, background: "#0a2540", color: "#fff" }}>
        <h2 style={{ margin: 0 }}>RailTalk 🚂</h2>
        <small>A social line for train enthusiasts</small>
      </header>
      {me ? (
        <div style={{ padding: 12, borderBottom: "1px solid #ddd", background: "#f7fafc" }}>
          <textarea
            placeholder="Share your latest rail sighting..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{content.length}/500</span>
            <button disabled={posting || content.trim().length === 0 || content.length > 500} onClick={submitPost}>
              {posting ? "Departing..." : "Post"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: 12, background: "#fff3cd", borderBottom: "1px solid #ddd" }}>
          Please sign in to post to the main line.
        </div>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((p) => (
          <li key={p.id} style={{ padding: 12, borderBottom: "1px solid #eee" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="link author" onClick={() => onOpenProfile(p.author_id)}>{p.author_name || "Railfan"}</button>
              {p.handle ? <span style={{ color: "#555" }}>@{p.handle}</span> : null}
              <span style={{ color: "#999", marginLeft: "auto" }}>{new Date(p.created_at).toLocaleString()}</span>
            </div>
            <div style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>{p.content}</div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => toggleLike(p)}>{p.liked ? "❤️" : "🤍"} {p.like_count}</button>
              <button onClick={() => { setCommentFor(p.id); setCommentText(""); toggleCommentsOpen(p.id); }}>💬 {p.comment_count}</button>
              <span>🚆</span>
            </div>
            {commentFor === p.id && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment"
                  style={{ flex: 1 }}
                />
                <span style={{ alignSelf: "center", fontSize: 12, color: "var(--muted)" }}>{commentText.length}/400</span>
                <button disabled={commentText.trim().length === 0 || commentText.length > 400} onClick={() => submitComment(p.id)}>Reply</button>
              </div>
            )}
            {comments[p.id]?.open && (
              <ul className="feed" style={{ background: "#fafafa", borderRadius: 8, marginTop: 8 }}>
                {comments[p.id]?.items?.map((cm) => (
                  <li key={cm.id} className="post" style={{ border: 0, padding: "8px 12px" }}>
                    <div className="post-head">
                      <button className="link author" onClick={() => onOpenProfile(cm.author_id)}>{cm.author_name || "Railfan"}</button>
                      {cm.handle ? <span className="handle">@{cm.handle}</span> : null}
                      <span className="date">{new Date(cm.created_at).toLocaleString()}</span>
                    </div>
                    <div className="post-body">{cm.content}</div>
                  </li>
                ))}
                {comments[p.id]?.items?.length === 0 && !comments[p.id]?.loading && (
                  <li className="post" style={{ border: 0, padding: "8px 12px", color: "var(--muted)" }}>No comments yet</li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {nextCursor && (
        <div style={{ padding: 12, textAlign: "center" }}>
          <button onClick={() => loadTimeline(nextCursor)}>Load more</button>
        </div>
      )}
    </div>
  );
}
