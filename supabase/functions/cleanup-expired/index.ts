// Hard-deletes expired files AND rows. Called by pg_cron with the service role key.
//   {"type":"audio"} -> generated audio older than 30 min
//   {"type":"voice"} -> voice samples + embeddings older than 24 h
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (req.headers.get("Authorization") !== `Bearer ${serviceKey}`) {
    return new Response("Forbidden", { status: 403 });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const { type } = await req.json();
  const now = new Date().toISOString();
  let deleted = 0;

  async function purgeAudio(rows: { id: string; storage_path: string }[]) {
    if (!rows.length) return;
    const rm = await admin.storage.from("generated-audio").remove(rows.map((r) => r.storage_path));
    if (rm.error) throw rm.error; // keep rows so the next run retries
    await admin.from("generated_audio").delete().in("id", rows.map((r) => r.id));
    deleted += rows.length;
  }

  try {
    if (type === "audio") {
      const { data } = await admin.from("generated_audio")
        .select("id, storage_path").lt("expires_at", now).limit(500);
      await purgeAudio(data ?? []);
    } else if (type === "voice") {
      const { data: profiles } = await admin.from("voice_profiles")
        .select("id, storage_path, embedding_ref").lt("expires_at", now).limit(200);
      for (const p of profiles ?? []) {
        // Remove any audio generated from this voice first, regardless of its own timer.
        const { data: audio } = await admin.from("generated_audio")
          .select("id, storage_path").eq("voice_profile_id", p.id);
        await purgeAudio(audio ?? []);

        const paths = [p.storage_path, p.embedding_ref].filter(Boolean) as string[];
        const rm = await admin.storage.from("voice-samples").remove(paths);
        if (rm.error) throw rm.error;
        await admin.from("voice_profiles").delete().eq("id", p.id);
        deleted++;
      }
    } else {
      return new Response("Bad type", { status: 400 });
    }
    return new Response(JSON.stringify({ deleted }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), deleted }), { status: 500 });
  }
});
