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
      {me ? (
        <div className="composer">
          <textarea placeholder="Share your latest rail sighting..." value={content} onChange={(e) => setContent(e.target.value)} />
          <div className="row"><span className="muted">{content.length}/500</span><button disabled={posting || content.trim().length === 0 || content.length > 500} onClick={submitPost}>{posting ? "Departing..." : "Post"}</button></div>
        </div>
      ) : (
        <div style={{ padding: 12, background: "#fff3cd", borderBottom: "1px solid #ddd" }}>
          Please sign in to post to the main line.
        </div>
      )}

      <ul className="feed">
        {items.map((p) => (
          <li key={p.id} className="post">
            <div className="post-head">
              <button className="link author" onClick={() => onOpenProfile(p.author_id)}>{p.author_name || "Railfan"}</button>
              {p.handle ? <span className="handle">@{p.handle}</span> : null}
              <span className="date">{new Date(p.created_at).toLocaleString()}</span>
            </div>
            <div className="post-body">{p.content}</div>
            <div className="post-actions">
              <button onClick={() => toggleLike(p)}>{p.liked ? "❤️" : "🤍"} {p.like_count}</button>
              <button onClick={() => { setCommentFor(p.id); setCommentText(""); toggleCommentsOpen(p.id); }}>💬 {p.comment_count}</button>
              <span aria-hidden>🚆</span>
            </div>
            {commentFor === p.id && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment"
                  style={{ flex: 1 }}
                />
                <span className="muted" style={{ alignSelf: "center", fontSize: 12 }}>{commentText.length}/400</span>
                <button disabled={commentText.trim().length === 0 || commentText.length > 400} onClick={() => submitComment(p.id)}>Reply</button>
              </div>
            )}
            {comments[p.id]?.open && (
              <ul className="feed comments">
                {comments[p.id]?.items?.map((cm) => (
                  <li key={cm.id} className="post">
                    <div className="post-head">
                      <button className="link author" onClick={() => onOpenProfile(cm.author_id)}>{cm.author_name || "Railfan"}</button>
                      {cm.handle ? <span className="handle">@{cm.handle}</span> : null}
                      <span className="date">{new Date(cm.created_at).toLocaleString()}</span>
                    </div>
                    <div className="post-body">{cm.content}</div>
                  </li>
                ))}
                {comments[p.id]?.items?.length === 0 && !comments[p.id]?.loading && (
                  <li className="post" style={{ color: "var(--muted)" }}>No comments yet</li>
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
