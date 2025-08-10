import { useEffect, useState } from "react";

type User = { id: number; email: string; handle?: string | null; display_name?: string | null; bio?: string | null; avatar_url?: string | null; banner_url?: string | null };
type Post = { id: number; content: string; created_at: string; like_count: number; comment_count: number };

export default function Profile({ userId }: { userId?: number }) {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      const r1 = await fetch(`/api/users/${userId}`);
      if (r1.ok) setUser((await r1.json()).user);
      const r2 = await fetch(`/api/users/${userId}/posts`);
      if (r2.ok) setPosts((await r2.json()).items);
    };
    load();
  }, [userId]);

  if (!userId) return <div style={{ padding: 16 }}>Sign in to view your profile.</div>;
  if (!user) return <div style={{ padding: 16 }}>Loading...</div>;

  return (
    <div>
      {user.banner_url ? (
        <div className="banner" style={{ backgroundImage: `url(${user.banner_url})` }} />
      ) : (
        <div className="banner" />
      )}
      <div className="profile">
        <div className="avatar" style={{ backgroundImage: user.avatar_url ? `url(${user.avatar_url})` : undefined }} />
        <div className="userinfo">
          <h3>{user.display_name || user.email}</h3>
          {user.handle ? <div className="handle">@{user.handle}</div> : null}
          {user.bio ? <p className="bio">{user.bio}</p> : null}
        </div>
      </div>

      <ul className="feed">
        {posts.map((p) => (
          <li key={p.id} className="post">
            <div className="post-head">
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

