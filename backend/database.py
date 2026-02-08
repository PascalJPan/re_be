from __future__ import annotations

from typing import Optional

import aiosqlite
from pathlib import Path

from backend.config import settings

_db: Optional[aiosqlite.Connection] = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS posts (
    id                TEXT PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES users(id),
    image_data        BLOB NOT NULL,
    squiggle_points   TEXT NOT NULL,
    color_hex         TEXT NOT NULL,
    structured_object TEXT NOT NULL,
    image_analysis    TEXT NOT NULL,
    squiggle_features TEXT NOT NULL,
    compiled_prompt   TEXT NOT NULL DEFAULT '',
    audio_filename    TEXT NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS comments (
    id                TEXT PRIMARY KEY,
    post_id           TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id           INTEGER NOT NULL REFERENCES users(id),
    image_data        BLOB NOT NULL,
    squiggle_points   TEXT NOT NULL,
    color_hex         TEXT NOT NULL,
    structured_object TEXT NOT NULL,
    image_analysis    TEXT NOT NULL,
    squiggle_features TEXT NOT NULL,
    compiled_prompt   TEXT NOT NULL DEFAULT '',
    audio_filename    TEXT NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
"""


async def init_db():
    global _db
    db_path = Path(settings.database_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    _db = await aiosqlite.connect(str(db_path))
    _db.row_factory = aiosqlite.Row
    await _db.execute("PRAGMA journal_mode=WAL")
    await _db.execute("PRAGMA foreign_keys=ON")
    await _db.executescript(SCHEMA)
    await _db.execute(
        "INSERT OR IGNORE INTO users (id, username, password_hash) VALUES (1, 'pascal', 'demo')"
    )
    await _db.commit()


async def close_db():
    global _db
    if _db:
        await _db.close()
        _db = None


def get_db() -> aiosqlite.Connection:
    assert _db is not None, "Database not initialized"
    return _db
