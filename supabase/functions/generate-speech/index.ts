// Turns text into speech using a ready voice profile. Output expires in 30 minutes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { voice_profile_id, text, language = "en" } = await req.json();
  if (typeof text !== "string" || text.trim().length === 0 || text.length > 1000) {
    return json({ error: "Text must be 1–1000 characters." }, 400);
  }

  const { data: profile } = await admin
    .from("voice_profiles").select("*")
    .eq("id", voice_profile_id).eq("user_id", user.id).single();
  if (!profile || profile.status !== "ready" || new Date(profile.expires_at) < new Date()) {
    return json({ error: "Voice profile is not available." }, 400);
  }

  try {
    const emb = await admin.storage.from("voice-samples").download(profile.embedding_ref);
    if (emb.error) throw emb.error;
    const latents = JSON.parse(await emb.data.text());

    const res = await fetch(`${Deno.env.get("XTTS_ENDPOINT_URL")}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": Deno.env.get("XTTS_API_KEY") ?? "" },
      body: JSON.stringify({ text, language, latents }),
    });
    if (!res.ok) throw new Error(`XTTS /tts failed: ${res.status}`);
    const audio = new Uint8Array(await res.arrayBuffer());

    const id = crypto.randomUUID();
    const path = `${user.id}/${id}.wav`;
    const up = await admin.storage.from("generated-audio")
      .upload(path, audio, { contentType: "audio/wav" });
    if (up.error) throw up.error;

    const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const ins = await admin.from("generated_audio").insert({
      id, user_id: user.id, voice_profile_id: profile.id,
      storage_path: path, text_input: text, status: "ready", expires_at,
    });
    if (ins.error) throw ins.error;
    return json({ id, expires_at });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
