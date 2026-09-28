import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { voice_profile_id, text, language } = await req.json();
  const { data, error } = await supabase.functions.invoke("generate-speech", {
    body: { voice_profile_id, text, language },
  });
  if (error) return NextResponse.json({ error: "Speech generation failed. Is your XTTS server running?" }, { status: 502 });
  return NextResponse.json(data);
}
