import glob
from pathlib import Path

from fastapi import APIRouter

from backend.models.schemas import ResetResponse
from backend.state.store import state

router = APIRouter()
AUDIO_DIR = Path(__file__).resolve().parent.parent / "audio_files"


@router.post("/api/reset", response_model=ResetResponse)
async def reset():
    state.reset()
    for f in AUDIO_DIR.glob("*.mp3"):
        f.unlink(missing_ok=True)
    return ResetResponse()
