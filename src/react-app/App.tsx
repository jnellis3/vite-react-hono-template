// src/App.tsx

import { useEffect, useState } from "react";
import "./App.css";
import Auth from "./Auth";
import Timeline from "./Timeline";
import Explore from "./Explore";
import Profile from "./Profile";

function App() {
  const [active, setActive] = useState<"home" | "explore" | "profile">("home");
  const [me, setMe] = useState<{ id: number } | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [trending, setTrending] = useState<{ tag: string; count: number }[]>([]);
  const [suggestions, setSuggestions] = useState<{ id: number; name: string | null; handle: string | null; followers: number }[]>([]);

  const refreshMe = async () => {
    const r = await fetch("/api/auth/me");
    if (r.ok) setMe((await r.json()).user);
    else setMe(null);
  };

  useEffect(() => {
    refreshMe();
  }, []);

  // Lightweight hash router: #/home, #/explore, #/profile/:id or :me
  useEffect(() => {
    const applyHash = () => {
      const h = (location.hash || "#/home").replace(/^#/, "");
      const parts = h.split("/").filter(Boolean);
      const route = parts[0] || "home";
      if (route === "profile") {
        const idPart = parts[1];
        if (idPart === "me") {
          setProfileId(me?.id ?? null);
        } else if (idPart && /^\d+$/.test(idPart)) {
          setProfileId(Number(idPart));
        } else {
          setProfileId(me?.id ?? null);
        }
        setActive("profile");
      } else if (route === "explore") {
        setActive("explore");
      } else {
        setActive("home");
      }
    };
    window.addEventListener("hashchange", applyHash);
    applyHash();
    return () => window.removeEventListener("hashchange", applyHash);
  }, [me?.id]);

  // Rightbar data
  const loadRightbar = async () => {
    try {
      const [t, s] = await Promise.all([
        fetch("/api/trending").then((r) => (r.ok ? r.json() : { items: [] })),
        fetch("/api/who-to-follow").then((r) => (r.ok ? r.json() : { items: [] })),
      ]);
      setTrending(t.items || []);
      setSuggestions(s.items || []);
    } catch {}
  };
  useEffect(() => {
    loadRightbar();
  }, []);

  const go = (hash: string) => {
    if (location.hash !== hash) location.hash = hash;
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">RailTalk 🚂</div>
        <nav className="nav">
          <button className={active === "home" ? "active" : ""} onClick={() => go("#/home")}>Home</button>
          <button className={active === "explore" ? "active" : ""} onClick={() => go("#/explore")}>Explore</button>
          <button className={active === "profile" ? "active" : ""} onClick={() => go("#/profile/me")}>Profile</button>
        </nav>
      </aside>
      <main className="center">
        <div className="topbar"><Auth /></div>
        <div className="content">
          {active === "home" && <Timeline onOpenProfile={(id) => { setProfileId(id); go(`#/profile/${id}`); }} />}
          {active === "explore" && <Explore onOpenProfile={(id) => { setProfileId(id); go(`#/profile/${id}`); }} />}
          {active === "profile" && <Profile userId={profileId ?? me?.id} />}
        </div>
      </main>
      <aside className="rightbar">
        <div className="card" style={{ position: "sticky", top: 16 }}>
          <h3 style={{ marginTop: 0 }}>Trending</h3>
          {trending.length === 0 ? (
            <p className="muted">No trending tags yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {trending.map((t) => (
                <li key={t.tag} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #eee" }}>
                  <span>#{t.tag}</span>
                  <span className="muted">{t.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Who to follow</h3>
          {suggestions.length === 0 ? (
            <p className="muted">All aboard! More railfans soon.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {suggestions.map((u) => (
                <li key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 0", borderBottom: "1px solid #eee" }}>
                  <button className="link" onClick={() => { setProfileId(u.id); go(`#/profile/${u.id}`); }} style={{ textAlign: "left", flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{u.name ?? "Railfan"}{u.handle ? <span className="handle" style={{ marginLeft: 6 }}>@{u.handle}</span> : null}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{u.followers} followers</div>
                  </button>
                  <button onClick={async () => { await fetch(`/api/users/${u.id}/follow`, { method: "POST" }); loadRightbar(); }}>Follow</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

export default App;
