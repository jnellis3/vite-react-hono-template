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
          <button className={active === "profile" ? "active" : ""} onClick={() => setActive("profile")}>Profile</button>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <Auth />
        </div>
        {active === "home" && <Timeline />}
        {active === "explore" && <Explore />}
        {active === "profile" && <Profile userId={me?.id} />}
      </main>
    </div>
  );
}

export default App;
