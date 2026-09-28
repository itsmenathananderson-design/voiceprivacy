import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Checks ownership + expiry, then redirects to a 60-second signed URL.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: row } = await supabase.from("generated_audio").select("*").eq("id", id).single(); // RLS: own rows only
  if (!row || new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: "This file has expired." }, { status: 410 });
  }
  const { data, error } = await supabase.storage.from("generated-audio")
    .createSignedUrl(row.storage_path, 60, { download: `voice-${id.slice(0, 8)}.wav` });
  if (error || !data) return NextResponse.json({ error: "File unavailable." }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
