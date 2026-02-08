import json
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from backend.auth import get_current_user
from backend.config import settings
from backend.database import get_db
from backend.models.schemas import (
    AudioStructuredObject,
    ColorInput,
    CommentCreateResponse,
    CommentDetail,
    ImageAnalysis,
    SquiggleFeatures,
    SquigglePoint,
)
from backend.services.audio_generator import generate_audio
from backend.services.image_analysis import analyze_image
from backend.services.prompt_compiler import compile_prompt
from backend.services.prompt_object_generator import generate_audio_object
from backend.services.pipeline_trace import write_trace
from backend.services.squiggle_extraction import extract_features

logger = logging.getLogger(__name__)

router = APIRouter(tags=["comments"])

AUDIO_DIR = Path(__file__).resolve().parent.parent / "audio_files"


@router.post("/api/posts/{post_id}/comments", response_model=CommentCreateResponse)
async def create_comment(
    post_id: str,
    image: UploadFile = File(...),
    color_hex: str = Form(...),
    squiggle_points: str = Form(...),
    user: dict = Depends(get_current_user),
):
    db = get_db()

    # Check post exists and get parent structured_object
    post_rows = await db.execute_fetchall(
        "SELECT structured_object, status FROM posts WHERE id = ?", (post_id,)
    )
    if not post_rows:
        raise HTTPException(status_code=404, detail="Post not found")

    if post_rows[0][1] != "ready":
        raise HTTPException(status_code=409, detail="Post is still generating")

    parent_object = AudioStructuredObject(**json.loads(post_rows[0][0]))

    image_bytes = await image.read()
    max_bytes = settings.max_image_size_mb * 1024 * 1024
    if len(image_bytes) > max_bytes:
        raise HTTPException(status_code=413, detail="Image too large")

    try:
        raw_points = json.loads(squiggle_points)
        points = [SquigglePoint(**p) for p in raw_points]
    except (json.JSONDecodeError, TypeError, KeyError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid squiggle_points: {e}")

    if len(points) < 2:
        raise HTTPException(status_code=422, detail="Too few squiggle points (need at least 2)")

    try:
        color = ColorInput.from_hex(color_hex)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid color_hex")

    try:
        image_analysis = await analyze_image(image_bytes, image.content_type or "image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Image analysis failed: {e}")

    squiggle_features = extract_features(points)

    try:
        structured_object = await generate_audio_object(
            image_analysis, color, squiggle_features, parent=parent_object
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Unexpected format: {e}")

    prompt_text = compile_prompt(structured_object, color, image_analysis, squiggle_features)
    comment_id = uuid.uuid4().hex[:12]

    try:
        audio_filename = await generate_audio(comment_id, prompt_text, structured_object)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Audio generation failed: {e}")

    await db.execute(
        """INSERT INTO comments (id, post_id, user_id, image_data, squiggle_points, color_hex,
           structured_object, image_analysis, squiggle_features, compiled_prompt, audio_filename)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            comment_id,
            post_id,
            user["id"],
            image_bytes,
            json.dumps(raw_points),
            color_hex,
            structured_object.model_dump_json(),
            image_analysis.model_dump_json(),
            squiggle_features.model_dump_json(),
            prompt_text,
            audio_filename,
        ),
    )
    await db.commit()

    try:
        trace_path = write_trace(
            trace_type="comment",
            item_id=comment_id,
            username=user["username"],
            color_hex=color_hex,
            color=color,
            image_analysis=image_analysis,
            squiggle_features=squiggle_features,
            structured_object=structured_object,
            compiled_prompt=prompt_text,
            audio_filename=audio_filename,
            parent_object=parent_object,
        )
        logger.info("Pipeline trace saved: %s", trace_path)
    except Exception as e:
        logger.warning("Failed to write pipeline trace: %s", e)

    row = await db.execute_fetchall(
        "SELECT created_at FROM comments WHERE id = ?", (comment_id,)
    )
    created_at = row[0][0] if row else None

    return CommentCreateResponse(
        comment=CommentDetail(
            id=comment_id,
            username=user["username"],
            audio_url=f"api/audio/{audio_filename}",
            color_hex=color_hex,
            structured_object=structured_object,
            image_analysis=image_analysis,
            squiggle_features=squiggle_features,
            compiled_prompt=prompt_text,
            created_at=created_at,
        )
    )


@router.get("/api/posts/{post_id}/comments")
async def list_comments(post_id: str):
    db = get_db()

    post_exists = await db.execute_fetchall(
        "SELECT 1 FROM posts WHERE id = ?", (post_id,)
    )
    if not post_exists:
        raise HTTPException(status_code=404, detail="Post not found")

    rows = await db.execute_fetchall(
        """SELECT c.id, u.username, c.audio_filename, c.color_hex,
           c.structured_object, c.image_analysis, c.squiggle_features,
           c.compiled_prompt, c.created_at
           FROM comments c JOIN users u ON c.user_id = u.id
           WHERE c.post_id = ?
           ORDER BY c.created_at ASC""",
        (post_id,),
    )

    def _parse_json(raw, model_cls, label):
        try:
            return model_cls(**json.loads(raw))
        except (json.JSONDecodeError, TypeError, KeyError) as e:
            raise HTTPException(status_code=500, detail=f"Corrupt {label} data: {e}")

    comments = [
        CommentDetail(
            id=r[0],
            username=r[1],
            audio_url=f"api/audio/{r[2]}",
            color_hex=r[3],
            structured_object=_parse_json(r[4], AudioStructuredObject, "comment structured_object"),
            image_analysis=_parse_json(r[5], ImageAnalysis, "comment image_analysis"),
            squiggle_features=_parse_json(r[6], SquiggleFeatures, "comment squiggle_features"),
            compiled_prompt=r[7],
            created_at=r[8],
        )
        for r in rows
    ]
    return {"comments": comments}


@router.delete("/api/posts/{post_id}/comments/{comment_id}")
async def delete_comment(
    post_id: str,
    comment_id: str,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    rows = await db.execute_fetchall(
        "SELECT user_id, audio_filename FROM comments WHERE id = ? AND post_id = ?",
        (comment_id, post_id),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Comment not found")

    if rows[0][0] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your comment")

    await db.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
    await db.commit()

    audio_file = AUDIO_DIR / rows[0][1]
    if audio_file.exists():
        audio_file.unlink()

    return {"status": "ok"}
