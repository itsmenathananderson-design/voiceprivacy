"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Decode any browser-readable audio, downmix to mono 22.05 kHz, and encode 16-bit WAV.
async function toWav(blob: Blob): Promise<{ wav: Blob; seconds: number }> {
  const ctx = new AudioContext({ sampleRate: 22050 });
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  await ctx.close();
  const data = buf.getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + data.length * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); out.setUint32(4, 36 + data.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, 22050, true); out.setUint32(28, 44100, true); out.setUint16(32, 2, true);
  out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, data.length * 2, true);
  data.forEach((v, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
  return { wav: new Blob([out], { type: "audio/wav" }), seconds: buf.duration };
}

export default function VoiceUpload() {
  const router = useRouter();
  const [clip, setClip] = useState<Blob | null>(null);
  const [label, setLabel] = useState("My voice");
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); setClip(new Blob(chunks)); };
      mr.start();
      recorder.current = mr;
      setRecording(true);
    } catch {
      setError("Microphone access was blocked. Upload a file instead.");
    }
  }
  function stopRecording() { recorder.current?.stop(); setRecording(false); }

  async function submit() {
    if (!clip) return;
    setBusy(true); setError(null);
    try {
      const { wav, seconds } = await toWav(clip);
      if (seconds < 6 || seconds > 60) throw new Error("Use a clip between 10 and 30 seconds (6–60 s accepted).");
      const form = new FormData();
      form.append("file", wav, "sample.wav");
      form.append("label", label);
      form.append("consent", String(consent));
      const res = await fetch("/api/voice/upload", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed.");
      setClip(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label htmlFor="voice-label">Name this voice</label>
      <input id="voice-label" type="text" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
      <div className="row">
        {recording
          ? <button type="button" onClick={stopRecording}>Stop recording</button>
          : <button type="button" className="secondary" onClick={startRecording}>Record 10–30 seconds</button>}
        <input type="file" accept="audio/*" aria-label="Upload an audio file"
          onChange={(e) => setClip(e.target.files?.[0] ?? null)} />
      </div>
      {clip && <p className="muted" style={{ marginTop: 10 }}>Clip ready. Clean speech, one voice, no background music works best.</p>}
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>This is my own voice, or I have the speaker’s permission to clone it.</span>
      </label>
      <div className="row">
        <button type="button" disabled={!clip || !consent || busy} onClick={submit}>
          {busy ? "Processing…" : "Create voice"}
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
