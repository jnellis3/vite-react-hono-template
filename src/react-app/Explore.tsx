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

export default function Explore() {
  const [items, setItems] = useState<Post[]>([]);

  const load = async () => {
    const r = await fetch("/api/posts/explore");
    if (!r.ok) return;
    const data = (await r.json()) as { items: Post[] };
    setItems(data.items);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <ul className="feed">
        {items.map((p) => (
          <li key={p.id} className="post">
            <div className="post-head">
              <span className="author">{p.author_name || "Railfan"}</span>
              {p.handle ? <span className="handle">@{p.handle}</span> : null}
              <span className="date">{new Date(p.created_at).toLocaleString()}</span>
            </div>
            <div className="post-body">{p.content}</div>
            <div className="post-actions">
              <span>❤️ {p.like_count}</span>
              <span>💬 {p.comment_count}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

