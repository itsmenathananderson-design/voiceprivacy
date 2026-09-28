import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const label = String(form.get("label") ?? "My voice").slice(0, 60);
  if (form.get("consent") !== "true") {
    return NextResponse.json({ error: "Confirm that this is your own voice." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0 || file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Upload a WAV clip under 8 MB." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const path = `${user.id}/${id}/sample.wav`;

  const up = await supabase.storage.from("voice-samples")
    .upload(path, file, { contentType: "audio/wav" });
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

  // expires_at defaults to now() + 24h in the database.
  const ins = await supabase.from("voice_profiles")
    .insert({ id, user_id: user.id, storage_path: path, label });
  if (ins.error) {
    await supabase.storage.from("voice-samples").remove([path]);
    return NextResponse.json({ error: ins.error.message }, { status: 500 });
  }

  const { error } = await supabase.functions.invoke("process-voice", { body: { profile_id: id } });
  if (error) return NextResponse.json({ error: "Voice processing failed. Is your XTTS server running?" }, { status: 502 });
  return NextResponse.json({ id });
}
