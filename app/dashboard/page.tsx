import { createClient } from "@/lib/supabase/server";
import CountdownTimer from "@/components/CountdownTimer";
import VoiceUpload from "@/components/VoiceUpload";
import GenerateForm from "@/components/GenerateForm";
import SignOutButton from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();

  const { data: profiles } = await supabase.from("voice_profiles")
    .select("id,label,status,expires_at").gt("expires_at", now).order("created_at", { ascending: false });
  const { data: audios } = await supabase.from("generated_audio")
    .select("id,text_input,storage_path,expires_at").eq("status", "ready")
    .gt("expires_at", now).order("created_at", { ascending: false });

  // Short-lived signed URLs so the player works without exposing the bucket.
  const players = await Promise.all((audios ?? []).map(async (a) => {
    const ttl = Math.max(30, Math.floor((new Date(a.expires_at).getTime() - Date.now()) / 1000));
    const { data } = await supabase.storage.from("generated-audio").createSignedUrl(a.storage_path, ttl);
    return { ...a, url: data?.signedUrl };
  }));

  const ready = (profiles ?? []).filter((p) => p.status === "ready");

  return (
    <main>
      <div className="topbar">
        <div>
          <h1>Ephemeral Voice</h1>
          <p className="muted" style={{ margin: 0 }}>{user?.email}</p>
        </div>
        <SignOutButton />
      </div>

      <section className="step">
        <span className="num">1</span>
        <div>
          <h2>Upload your voice</h2>
          <p className="muted">The sample and its voice profile are deleted 24 hours after upload.</p>
          <VoiceUpload />
          {(profiles ?? []).length > 0 && (
            <div style={{ marginTop: 20 }}>
              {profiles!.map((p) => (
                <div className="item" key={p.id}>
                  <strong>{p.label}</strong>{" "}
                  <span className={p.status === "failed" ? "status-failed" : "muted"}>
                    {p.status === "ready" ? "Ready" : p.status === "failed" ? "Failed — upload again" : "Processing…"}
                  </span>
                  <div><CountdownTimer expiresAt={p.expires_at} prefix="Deleted in" /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="step">
        <span className="num">2</span>
        <div>
          <h2>Generate speech</h2>
          <p className="muted">Type or paste text. Up to 1,000 characters per clip.</p>
          <GenerateForm profiles={ready.map((p) => ({ id: p.id, label: p.label }))} />
        </div>
      </section>

      <section className="step">
        <span className="num">3</span>
        <div>
          <h2>Download</h2>
          <p className="muted">Each file is deleted 30 minutes after it’s generated.</p>
          {players.length === 0 && <p className="muted">Nothing here yet. Generated clips appear with a countdown.</p>}
          {players.map((a) => (
            <div className="item" key={a.id}>
              <div>{a.text_input.length > 90 ? a.text_input.slice(0, 90) + "…" : a.text_input}</div>
              {a.url && <audio controls src={a.url} />}
              <div className="row">
                <a className="btn" href={`/api/tts/${a.id}/download`}>Download WAV</a>
                <CountdownTimer expiresAt={a.expires_at} prefix="File expires in" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
