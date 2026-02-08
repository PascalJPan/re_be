import math

from fastapi import APIRouter, HTTPException, Query

from backend.database import get_db
from backend.models.schemas import PostSummary, ProfileResponse, UserPublic

router = APIRouter(tags=["profiles"])


@router.get("/api/users/{username}", response_model=ProfileResponse)
async def get_profile(username: str, page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100)):
    db = get_db()

    user_rows = await db.execute_fetchall(
        "SELECT id, username FROM users WHERE username = ? COLLATE NOCASE",
        (username,),
    )
    if not user_rows:
        raise HTTPException(status_code=404, detail="User not found")

    user_id, actual_username = user_rows[0]
    offset = (page - 1) * per_page

    count_row = await db.execute_fetchall(
        "SELECT COUNT(*) FROM posts WHERE user_id = ?", (user_id,)
    )
    total = count_row[0][0]
    pages = max(1, math.ceil(total / per_page))

    rows = await db.execute_fetchall(
        """SELECT p.id, p.audio_filename, p.color_hex, p.created_at,
           (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
           p.status
           FROM posts p WHERE p.user_id = ?
           ORDER BY p.created_at DESC LIMIT ? OFFSET ?""",
        (user_id, per_page, offset),
    )

    posts = [
        PostSummary(
            id=r[0],
            username=actual_username,
            image_url=f"api/posts/{r[0]}/image",
            audio_url=f"api/audio/{r[1]}" if r[1] else "",
            color_hex=r[2],
            created_at=r[3],
            comment_count=r[4],
            status=r[5],
        )
        for r in rows
    ]

    return ProfileResponse(
        user=UserPublic(id=user_id, username=actual_username),
        posts=posts,
        total=total,
        page=page,
        pages=pages,
    )
