import { useEffect, useState } from "react";

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

export default function Explore({ onOpenProfile }: { onOpenProfile: (id: number) => void }) {
  const [items, setItems] = useState<Post[]>([]);
  const [commentFor, setCommentFor] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<Record<number, { open: boolean; loading: boolean; items: Comment[] }>>({});

  const load = async () => {
    const r = await fetch("/api/posts/explore");
    if (!r.ok) return;
    const data = (await r.json()) as { items: Post[] };
    setItems(data.items);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleLike = async (post: Post) => {
    const url = `/api/posts/${post.id}/like`;
    const method = post.liked ? "DELETE" : "POST";
    const r = await fetch(url, { method });
    if (r.ok) await load();
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
      await load();
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

  return (
    <div>
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
              <button onClick={() => { setCommentFor(p.id); setCommentText(""); loadComments(p.id); }}>💬 {p.comment_count}</button>
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
    </div>
  );
}
