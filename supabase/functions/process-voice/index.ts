// Extracts the voice embedding (XTTS conditioning latents) from an uploaded sample.
// Invoked by the Next.js API route with the signed-in user's JWT.
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

  const { profile_id } = await req.json();
  const { data: profile } = await admin
    .from("voice_profiles").select("*")
    .eq("id", profile_id).eq("user_id", user.id).single();
  if (!profile) return json({ error: "Profile not found" }, 404);

  try {
    const sample = await admin.storage.from("voice-samples").download(profile.storage_path);
    if (sample.error) throw sample.error;

    const form = new FormData();
    form.append("file", sample.data, "sample.wav");
    const res = await fetch(`${Deno.env.get("XTTS_ENDPOINT_URL")}/clone`, {
      method: "POST",
      headers: { "x-api-key": Deno.env.get("XTTS_API_KEY") ?? "" },
      body: form,
    });
    if (!res.ok) throw new Error(`XTTS /clone failed: ${res.status}`);
    const latents = await res.json();

    // Embedding lives next to the sample so both are deleted together.
    const embeddingPath = profile.storage_path.replace(/sample\.wav$/, "embedding.json");
    const up = await admin.storage.from("voice-samples").upload(
      embeddingPath,
      new Blob([JSON.stringify(latents)], { type: "application/json" }),
      { upsert: true },
    );
    if (up.error) throw up.error;

    await admin.from("voice_profiles")
      .update({ status: "ready", embedding_ref: embeddingPath }).eq("id", profile.id);
    return json({ ok: true });
  } catch (e) {
    await admin.from("voice_profiles").update({ status: "failed" }).eq("id", profile.id);
    return json({ error: String(e) }, 500);
  }
});
