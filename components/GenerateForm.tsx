"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Profile = { id: string; label: string };
const LANGS = [["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["it", "Italian"], ["pt", "Portuguese"], ["hi", "Hindi"], ["ar", "Arabic"], ["ja", "Japanese"], ["zh-cn", "Chinese"]];

export default function GenerateForm({ profiles }: { profiles: Profile[] }) {
  const router = useRouter();
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (profiles.length === 0) {
    return <p className="muted">Create a voice in step 1 first. It will appear here once it’s ready.</p>;
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_profile_id: profileId, text, language }),
      });
      const body = await res.json();
      if (!res.ok || body.error) throw new Error(body.error ?? "Generation failed.");
      setText("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label htmlFor="voice">Voice</label>
      <select id="voice" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
        {profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <label htmlFor="lang">Language</label>
      <select id="lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
        {LANGS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </select>
      <label htmlFor="text">Text to speak</label>
      <textarea id="text" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <button type="button" disabled={busy || text.trim().length === 0} onClick={submit}>
          {busy ? "Generating…" : "Generate speech"}
        </button>
        <span className="muted mono">{text.length}/1000</span>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
