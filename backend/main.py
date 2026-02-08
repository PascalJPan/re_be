import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Query

logging.basicConfig(level=logging.INFO, format="%(levelname)s:  %(name)s - %(message)s")
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config import settings
from backend.database import init_db, close_db
from backend.routers import comments, posts, profiles

AUDIO_DIR = Path(__file__).resolve().parent / "audio_files"
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    AUDIO_DIR.mkdir(exist_ok=True)
    await init_db()
    yield
    await close_db()


app = FastAPI(title="re_be", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/auth/verify")
async def verify_passcode(code: str = Query(...)):
    return {"admin": code == settings.admin_passcode}

app.include_router(posts.router)
app.include_router(comments.router)
app.include_router(profiles.router)

app.mount("/api/audio", StaticFiles(directory=str(AUDIO_DIR)), name="audio")
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
