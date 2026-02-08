import json
import logging
import math
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response

from backend.auth import get_current_user
from backend.config import settings
from backend.database import get_db
from backend.models.schemas import (
    AudioStructuredObject,
    ColorInput,
    CommentDetail,
    FeedResponse,
    ImageAnalysis,
    ImageEnhancementPrompt,
    PostCreateResponse,
    PostDetail,
    PostSummary,
    SquiggleFeatures,
    SquigglePoint,
)
from backend.services.audio_generator import generate_audio
from backend.services.image_analysis import analyze_image
from backend.services.image_morpher import generate_enhancement_prompt, morph_image
from backend.services.prompt_compiler import compile_prompt
from backend.services.prompt_object_generator import generate_audio_object
from backend.services.pipeline_trace import write_trace
from backend.services.squiggle_extraction import extract_features

logger = logging.getLogger(__name__)

router = APIRouter(tags=["posts"])

AUDIO_DIR = Path(__file__).resolve().parent.parent / "audio_files"


@router.post("/api/posts", response_model=PostCreateResponse)
async def create_post(
    image: UploadFile = File(...),
    color_hex: str = Form(...),
    squiggle_points: str = Form(...),
    user: dict = Depends(get_current_user),
):
    image_bytes = await image.read()
    max_bytes = settings.max_image_size_mb * 1024 * 1024
    if len(image_bytes) > max_bytes:
        raise HTTPException(status_code=413, detail="Image too large")

    try:
        raw_points = json.loads(squiggle_points)
        points = [SquigglePoint(**p) for p in raw_points]
    except (json.JSONDecodeError, Exception) as e:
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

    # --- Image morphing pipeline (posts only) ---
    enhancement = None
    final_image_bytes = image_bytes
    morph_status = None
    try:
        enhancement = await generate_enhancement_prompt(image_analysis, color, squiggle_features)
        logger.info("Enhancement prompt: %s", enhancement.model_dump_json())
    except Exception as e:
        logger.warning("Enhancement prompt generation failed, skipping morph: %s", e)
        morph_status = f"failed:enhancement_prompt:{e}"

    if enhancement is not None:
        try:
            final_image_bytes = await morph_image(image_bytes, color, enhancement)
            logger.info("Image morphing succeeded (%d bytes)", len(final_image_bytes))
            morph_status = "success"
        except Exception as e:
            logger.warning("Image morphing failed, using original image: %s", e)
            final_image_bytes = image_bytes
            morph_status = f"failed:morph:{e}"

    try:
        structured_object = await generate_audio_object(image_analysis, color, squiggle_features)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Unexpected format: {e}")

    prompt_text = compile_prompt(structured_object, color, image_analysis, squiggle_features)
    post_id = uuid.uuid4().hex[:12]

    try:
        audio_filename = await generate_audio(post_id, prompt_text, structured_object)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Audio generation failed: {e}")

    enhancement_json = enhancement.model_dump_json() if enhancement else ""

    db = get_db()
    await db.execute(
        """INSERT INTO posts (id, user_id, image_data, squiggle_points, color_hex,
           structured_object, image_analysis, squiggle_features, compiled_prompt,
           enhancement_prompt, audio_filename)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            post_id,
            user["id"],
            final_image_bytes,
            json.dumps(raw_points),
            color_hex,
            structured_object.model_dump_json(),
            image_analysis.model_dump_json(),
            squiggle_features.model_dump_json(),
            prompt_text,
            enhancement_json,
            audio_filename,
        ),
    )
    await db.commit()

    try:
        trace_path = write_trace(
            trace_type="post",
            item_id=post_id,
            username=user["username"],
            color_hex=color_hex,
            color=color,
            image_analysis=image_analysis,
            squiggle_features=squiggle_features,
            structured_object=structured_object,
            compiled_prompt=prompt_text,
            audio_filename=audio_filename,
            enhancement_prompt=enhancement,
            morph_status=morph_status,
        )
        logger.info("Pipeline trace saved: %s", trace_path)
    except Exception as e:
        logger.warning("Failed to write pipeline trace: %s", e)

    row = await db.execute_fetchall(
        "SELECT created_at FROM posts WHERE id = ?", (post_id,)
    )
    created_at = row[0][0] if row else None

    return PostCreateResponse(
        post=PostDetail(
            id=post_id,
            username=user["username"],
            image_url=f"/api/posts/{post_id}/image",
            audio_url=f"/api/audio/{audio_filename}",
            color_hex=color_hex,
            structured_object=structured_object,
            image_analysis=image_analysis,
            squiggle_features=squiggle_features,
            compiled_prompt=prompt_text,
            enhancement_prompt=enhancement,
            morph_status=morph_status,
            comments=[],
            created_at=created_at,
        )
    )


@router.get("/api/posts", response_model=FeedResponse)
async def feed(page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100)):
    db = get_db()
    offset = (page - 1) * per_page

    count_row = await db.execute_fetchall("SELECT COUNT(*) FROM posts")
    total = count_row[0][0]
    pages = max(1, math.ceil(total / per_page))

    rows = await db.execute_fetchall(
        """SELECT p.id, u.username, p.audio_filename, p.color_hex, p.created_at,
           (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
           FROM posts p JOIN users u ON p.user_id = u.id
           ORDER BY p.created_at DESC LIMIT ? OFFSET ?""",
        (per_page, offset),
    )

    posts = [
        PostSummary(
            id=r[0],
            username=r[1],
            image_url=f"/api/posts/{r[0]}/image",
            audio_url=f"/api/audio/{r[2]}",
            color_hex=r[3],
            created_at=r[4],
            comment_count=r[5],
        )
        for r in rows
    ]
    return FeedResponse(posts=posts, total=total, page=page, pages=pages)


@router.get("/api/posts/{post_id}", response_model=PostDetail)
async def get_post(post_id: str):
    db = get_db()
    rows = await db.execute_fetchall(
        """SELECT p.id, u.username, p.audio_filename, p.color_hex,
           p.structured_object, p.image_analysis, p.squiggle_features,
           p.compiled_prompt, p.enhancement_prompt, p.created_at
           FROM posts p JOIN users u ON p.user_id = u.id
           WHERE p.id = ?""",
        (post_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Post not found")

    r = rows[0]

    comment_rows = await db.execute_fetchall(
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
            id=cr[0],
            username=cr[1],
            audio_url=f"/api/audio/{cr[2]}",
            color_hex=cr[3],
            structured_object=_parse_json(cr[4], AudioStructuredObject, "comment structured_object"),
            image_analysis=_parse_json(cr[5], ImageAnalysis, "comment image_analysis"),
            squiggle_features=_parse_json(cr[6], SquiggleFeatures, "comment squiggle_features"),
            compiled_prompt=cr[7],
            created_at=cr[8],
        )
        for cr in comment_rows
    ]

    enhancement_raw = r[8]
    enhancement = None
    if enhancement_raw:
        try:
            enhancement = ImageEnhancementPrompt(**json.loads(enhancement_raw))
        except (json.JSONDecodeError, TypeError):
            pass

    return PostDetail(
        id=r[0],
        username=r[1],
        image_url=f"/api/posts/{r[0]}/image",
        audio_url=f"/api/audio/{r[2]}",
        color_hex=r[3],
        structured_object=_parse_json(r[4], AudioStructuredObject, "post structured_object"),
        image_analysis=_parse_json(r[5], ImageAnalysis, "post image_analysis"),
        squiggle_features=_parse_json(r[6], SquiggleFeatures, "post squiggle_features"),
        compiled_prompt=r[7],
        enhancement_prompt=enhancement,
        comments=comments,
        created_at=r[9],
    )


@router.get("/api/posts/{post_id}/image")
async def get_post_image(post_id: str):
    db = get_db()
    rows = await db.execute_fetchall(
        "SELECT image_data FROM posts WHERE id = ?", (post_id,)
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Post not found")

    data = rows[0][0]
    # Detect PNG vs JPEG from magic bytes
    if data[:4] == b"\x89PNG":
        media_type = "image/png"
    else:
        media_type = "image/jpeg"

    return Response(
        content=data,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.delete("/api/posts/{post_id}")
async def delete_post(post_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    rows = await db.execute_fetchall(
        "SELECT user_id, audio_filename FROM posts WHERE id = ?", (post_id,)
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Post not found")

    if rows[0][0] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your post")

    comment_rows = await db.execute_fetchall(
        "SELECT audio_filename FROM comments WHERE post_id = ?", (post_id,)
    )

    await db.execute("DELETE FROM comments WHERE post_id = ?", (post_id,))
    await db.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    await db.commit()

    post_audio = AUDIO_DIR / rows[0][1]
    if post_audio.exists():
        post_audio.unlink()
    for cr in comment_rows:
        f = AUDIO_DIR / cr[0]
        if f.exists():
            f.unlink()

    return {"status": "ok"}
