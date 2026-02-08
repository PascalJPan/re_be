from __future__ import annotations

import re

from fastapi import Request

from backend.database import get_db

_USERNAME_RE = re.compile(r'^[a-z0-9_]{1,24}$')


async def _resolve_user(username: str) -> dict:
    """Look up user by username; create if not found. Returns {id, username}."""
    db = get_db()
    rows = await db.execute_fetchall(
        "SELECT id, username FROM users WHERE username = ? COLLATE NOCASE",
        (username,),
    )
    if rows:
        return {"id": rows[0][0], "username": rows[0][1]}

    await db.execute(
        "INSERT OR IGNORE INTO users (username, password_hash) VALUES (?, 'demo')",
        (username,),
    )
    await db.commit()
    rows = await db.execute_fetchall(
        "SELECT id, username FROM users WHERE username = ? COLLATE NOCASE",
        (username,),
    )
    return {"id": rows[0][0], "username": rows[0][1]}


async def get_current_user(request: Request) -> dict:
    header = (request.headers.get("X-Username") or "").strip().lower()
    if header and _USERNAME_RE.match(header):
        return await _resolve_user(header)
    return await _resolve_user("pascal")


async def get_optional_user(request: Request) -> dict:
    return await get_current_user(request)
