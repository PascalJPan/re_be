from __future__ import annotations

DEMO_USER = {"id": 1, "username": "pascal"}


async def get_current_user() -> dict:
    return DEMO_USER


async def get_optional_user() -> dict:
    return DEMO_USER
