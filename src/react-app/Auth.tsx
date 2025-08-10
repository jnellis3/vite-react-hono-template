import { useEffect, useState } from "react";

type User = { id: number; email: string; name?: string | null; created_at?: string } | null;

export default function Auth() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [me, setMe] = useState<User>(null);
  const [msg, setMsg] = useState<string>("");

  const refreshMe = async () => {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      const data = (await res.json()) as { user: User };
      setMe(data.user);
    } else {
      setMe(null);
    }
  };

  useEffect(() => {
    refreshMe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name: name || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Register failed");
        setMsg("Registered! You can now login.");
        setMode("login");
      } else {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Login failed");
        setMsg("Logged in!");
        await refreshMe();
      }
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await refreshMe();
  };

  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <h2>{mode === "login" ? "Login" : "Create Account"}</h2>
      {me ? (
        <div>
          <p>
            Signed in as <b>{me.email}</b> {me.name ? `(${me.name})` : null}
          </p>
          <button onClick={logout}>Logout</button>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label>
              Email
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
              />
            </label>
            <label>
              Password
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
              />
            </label>
            {mode === "register" && (
              <label>
                Name (optional)
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
            )}
            <button type="submit">{mode === "login" ? "Login" : "Create Account"}</button>
          </div>
        </form>
      )}
      <p>{msg}</p>
      {!me && (
        <p>
          <button onClick={() => setMode(mode === "login" ? "register" : "login")}>
            Switch to {mode === "login" ? "Create Account" : "Login"}
          </button>
        </p>
      )}
    </div>
  );
}
