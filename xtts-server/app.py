"""
Minimal XTTS v2 server. Run on Colab / Kaggle / Modal (GPU) and expose it via a tunnel.

    pip install coqui-tts fastapi uvicorn python-multipart soundfile
    export XTTS_API_KEY=some-long-random-string
    uvicorn app:app --host 0.0.0.0 --port 8000

Stateless by design: only a temp file is written (and removed right away), so the
only persistent copies of a voice are the ones in your Supabase bucket.
Contract:
    POST /clone  (multipart 'file')              -> {"gpt_cond_latent": [...], "speaker_embedding": [...]}
    POST /tts    ({"text","language","latents"}) -> audio/wav bytes
"""
import io, os, tempfile
import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from TTS.api import TTS

API_KEY = os.environ.get("XTTS_API_KEY", "")
device = "cuda" if torch.cuda.is_available() else "cpu"
model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device).synthesizer.tts_model

app = FastAPI()

def check(key: str | None):
    if not API_KEY or key != API_KEY:
        raise HTTPException(status_code=401, detail="bad api key")

@app.post("/clone")
async def clone(file: UploadFile = File(...), x_api_key: str | None = Header(None)):
    check(x_api_key)
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        tmp.write(await file.read()); tmp.flush()
        gpt_cond_latent, speaker_embedding = model.get_conditioning_latents(audio_path=[tmp.name])
    return {
        "gpt_cond_latent": gpt_cond_latent.cpu().tolist(),
        "speaker_embedding": speaker_embedding.cpu().tolist(),
    }

class TTSRequest(BaseModel):
    text: str
    language: str = "en"
    latents: dict

@app.post("/tts")
def tts(req: TTSRequest, x_api_key: str | None = Header(None)):
    check(x_api_key)
    gpt = torch.tensor(req.latents["gpt_cond_latent"]).to(device)
    spk = torch.tensor(req.latents["speaker_embedding"]).to(device)
    out = model.inference(req.text, req.language, gpt, spk)
    buf = io.BytesIO()
    sf.write(buf, np.asarray(out["wav"]), 24000, format="WAV")
    return Response(content=buf.getvalue(), media_type="audio/wav")
