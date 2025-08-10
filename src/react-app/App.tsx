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

  const refreshMe = async () => {
    const r = await fetch("/api/auth/me");
    if (r.ok) setMe((await r.json()).user);
    else setMe(null);
  };

  useEffect(() => {
    refreshMe();
  }, []);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">RailTalk 🚂</div>
        <nav className="nav">
          <button className={active === "home" ? "active" : ""} onClick={() => setActive("home")}>Home</button>
          <button className={active === "explore" ? "active" : ""} onClick={() => setActive("explore")}>Explore</button>
          <button className={active === "profile" ? "active" : ""} onClick={() => { setProfileId(me?.id ?? null); setActive("profile"); }}>Profile</button>
        </nav>
      </aside>
      <main className="center">
        <div className="topbar"><Auth /></div>
        <div className="content">
          {active === "home" && <Timeline onOpenProfile={(id) => { setProfileId(id); setActive("profile"); }} />}
          {active === "explore" && <Explore onOpenProfile={(id) => { setProfileId(id); setActive("profile"); }} />}
          {active === "profile" && <Profile userId={profileId ?? me?.id} />}
        </div>
      </main>
      <aside className="rightbar">
        <div className="card" style={{ position: "sticky", top: 16 }}>
          <h3 style={{ marginTop: 0 }}>Rail lines</h3>
          <p className="muted">Follow your favorite locomotives and lines. Coming soon!</p>
        </div>
      </aside>
    </div>
  );
}

export default App;
