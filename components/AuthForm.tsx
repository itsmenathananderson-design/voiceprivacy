"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    const supabase = createClient();
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else if (!data.session) setNotice("Check your email to confirm your account, then log in.");
      else router.replace("/dashboard");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.replace("/dashboard");
    }
    setBusy(false);
  }

  return (
    <main>
      <h1>{mode === "login" ? "Log in" : "Create your account"}</h1>
      <p className="muted">Voice samples are deleted after 24 hours. Generated audio after 30 minutes.</p>
      <form onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="row">
          <button disabled={busy}>{mode === "login" ? "Log in" : "Create account"}</button>
          <Link href={mode === "login" ? "/signup" : "/login"} className="muted">
            {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
          </Link>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="muted" role="status">{notice}</p>}
      </form>
    </main>
  );
}
