import asyncio
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
    PostCreateAsyncResponse,
    PostDetail,
    PostStatusResponse,
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


async def run_generation_pipeline(post_id: str, image_bytes: bytes, content_type: str,
                                   raw_points: list, color_hex: str, username: str):
    """Background task: runs the full AI pipeline and updates the post row on completion."""
    try:
        points = [SquigglePoint(**p) for p in raw_points]
        color = ColorInput.from_hex(color_hex)

        image_analysis = await analyze_image(image_bytes, content_type)
        squiggle_features = extract_features(points)

        # Run image morphing branch and audio branch in parallel
        async def _morph_branch():
            """Enhancement prompt → image morph (independent of audio branch)."""
            enhancement = None
            final = image_bytes
            status = None
            try:
                enhancement = await generate_enhancement_prompt(image_analysis, color, squiggle_features)
                logger.info("Enhancement prompt: %s", enhancement.model_dump_json())
            except Exception as e:
                logger.warning("Enhancement prompt generation failed, skipping morph: %s", e)
                status = f"failed:enhancement_prompt:{e}"

            if enhancement is not None:
                try:
                    final = await morph_image(image_bytes, color, enhancement)
                    logger.info("Image morphing succeeded (%d bytes)", len(final))
                    status = "success"
                except Exception as e:
                    logger.warning("Image morphing failed, using original image: %s", e)
                    final = image_bytes
                    status = f"failed:morph:{e}"

            return enhancement, final, status

        async def _audio_branch():
            """Audio object → compile prompt → generate audio (independent of morph)."""
            obj = await generate_audio_object(image_analysis, color, squiggle_features)
            prompt = compile_prompt(obj, color, image_analysis, squiggle_features)
            filename = await generate_audio(post_id, prompt, obj)
            return obj, prompt, filename

        (enhancement, final_image_bytes, morph_status), (structured_object, prompt_text, audio_filename) = (
            await asyncio.gather(_morph_branch(), _audio_branch())
        )
        enhancement_json = enhancement.model_dump_json() if enhancement else ""

        db = get_db()
        await db.execute(
            """UPDATE posts SET
               image_data = ?, original_image_data = ?,
               structured_object = ?, image_analysis = ?, squiggle_features = ?,
               compiled_prompt = ?, enhancement_prompt = ?, audio_filename = ?,
               status = 'ready'
               WHERE id = ?""",
            (
                final_image_bytes,
                image_bytes,
                structured_object.model_dump_json(),
                image_analysis.model_dump_json(),
                squiggle_features.model_dump_json(),
                prompt_text,
                enhancement_json,
                audio_filename,
                post_id,
            ),
        )
        await db.commit()

        try:
            trace_path = write_trace(
                trace_type="post",
                item_id=post_id,
                username=username,
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

        logger.info("Post %s generation complete", post_id)

    except Exception as e:
        logger.error("Post %s generation failed: %s", post_id, e)
        try:
            db = get_db()
            await db.execute(
                "UPDATE posts SET status = 'failed', error_message = ? WHERE id = ?",
                (str(e), post_id),
            )
            await db.commit()
        except Exception:
            logger.error("Failed to mark post %s as failed", post_id)


async def run_recreate_pipeline(post_id: str, original_image: bytes, content_type: str,
                                 raw_points: list, color_hex: str, username: str):
    """Background task: re-runs the full AI pipeline for an existing post."""
    try:
        points = [SquigglePoint(**p) for p in raw_points]
        color = ColorInput.from_hex(color_hex)

        image_analysis = await analyze_image(original_image, content_type)
        squiggle_features = extract_features(points)

        # Run image morphing branch and audio branch in parallel
        async def _morph_branch():
            enhancement = None
            final = original_image
            status = None
            try:
                enhancement = await generate_enhancement_prompt(image_analysis, color, squiggle_features)
                logger.info("Recreate enhancement prompt: %s", enhancement.model_dump_json())
            except Exception as e:
                logger.warning("Recreate enhancement prompt failed, skipping morph: %s", e)
                status = f"failed:enhancement_prompt:{e}"

            if enhancement is not None:
                try:
                    final = await morph_image(original_image, color, enhancement)
                    logger.info("Recreate image morphing succeeded (%d bytes)", len(final))
                    status = "success"
                except Exception as e:
                    logger.warning("Recreate image morphing failed, using original: %s", e)
                    final = original_image
                    status = f"failed:morph:{e}"

            return enhancement, final, status

        async def _audio_branch():
            obj = await generate_audio_object(image_analysis, color, squiggle_features)
            prompt = compile_prompt(obj, color, image_analysis, squiggle_features)
            filename = await generate_audio(post_id, prompt, obj)
            return obj, prompt, filename

        (enhancement, final_image_bytes, morph_status), (structured_object, prompt_text, audio_filename) = (
            await asyncio.gather(_morph_branch(), _audio_branch())
        )
        enhancement_json = enhancement.model_dump_json() if enhancement else ""

        db = get_db()
        await db.execute(
            """UPDATE posts SET
               image_data = ?,
               structured_object = ?, image_analysis = ?, squiggle_features = ?,
               compiled_prompt = ?, enhancement_prompt = ?, audio_filename = ?,
               status = 'ready'
               WHERE id = ?""",
            (
                final_image_bytes,
                structured_object.model_dump_json(),
                image_analysis.model_dump_json(),
                squiggle_features.model_dump_json(),
                prompt_text,
                enhancement_json,
                audio_filename,
                post_id,
            ),
        )
        await db.commit()

        try:
            trace_path = write_trace(
                trace_type="recreate",
                item_id=post_id,
                username=username,
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
            logger.info("Recreate pipeline trace saved: %s", trace_path)
        except Exception as e:
            logger.warning("Failed to write recreate pipeline trace: %s", e)

        logger.info("Post %s recreate complete", post_id)

    except Exception as e:
        logger.error("Post %s recreate failed: %s", post_id, e)
        try:
            db = get_db()
            await db.execute(
                "UPDATE posts SET status = 'failed', error_message = ? WHERE id = ?",
                (str(e), post_id),
            )
            await db.commit()
        except Exception:
            logger.error("Failed to mark post %s as failed", post_id)


@router.post("/api/posts", response_model=PostCreateAsyncResponse)
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
    except (json.JSONDecodeError, TypeError, KeyError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid squiggle_points: {e}")

    if len(points) < 2:
        raise HTTPException(status_code=422, detail="Too few squiggle points (need at least 2)")

    try:
        ColorInput.from_hex(color_hex)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid color_hex")

    post_id = uuid.uuid4().hex[:12]
    content_type = image.content_type or "image/jpeg"

    # Insert placeholder row with status='generating'
    db = get_db()
    await db.execute(
        """INSERT INTO posts (id, user_id, image_data, original_image_data,
           squiggle_points, color_hex,
           structured_object, image_analysis, squiggle_features, compiled_prompt,
           enhancement_prompt, audio_filename, status)
           VALUES (?, ?, ?, ?, ?, ?, '{}', '{}', '{}', '', '', '', 'generating')""",
        (
            post_id,
            user["id"],
            image_bytes,
            image_bytes,
            json.dumps(raw_points),
            color_hex,
        ),
    )
    await db.commit()

    row = await db.execute_fetchall(
        "SELECT created_at FROM posts WHERE id = ?", (post_id,)
    )
    created_at = row[0][0] if row else ""

    # Launch background pipeline
    asyncio.create_task(
        run_generation_pipeline(post_id, image_bytes, content_type, raw_points, color_hex, user["username"])
    )

    return PostCreateAsyncResponse(
        id=post_id,
        status="generating",
        color_hex=color_hex,
        created_at=created_at,
    )


@router.get("/api/posts/{post_id}/status", response_model=PostStatusResponse)
async def get_post_status(post_id: str):
    db = get_db()
    rows = await db.execute_fetchall(
        "SELECT id, status, error_message FROM posts WHERE id = ?", (post_id,)
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Post not found")
    r = rows[0]
    return PostStatusResponse(id=r[0], status=r[1], error_message=r[2] or "")


@router.get("/api/posts", response_model=FeedResponse)
async def feed(page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100)):
    db = get_db()
    offset = (page - 1) * per_page

    count_row = await db.execute_fetchall("SELECT COUNT(*) FROM posts")
    total = count_row[0][0]
    pages = max(1, math.ceil(total / per_page))

    rows = await db.execute_fetchall(
        """SELECT p.id, u.username, p.audio_filename, p.color_hex, p.created_at,
           (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
           p.status
           FROM posts p JOIN users u ON p.user_id = u.id
           ORDER BY p.created_at DESC LIMIT ? OFFSET ?""",
        (per_page, offset),
    )

    posts = [
        PostSummary(
            id=r[0],
            username=r[1],
            image_url=f"api/posts/{r[0]}/image",
            audio_url=f"api/audio/{r[2]}" if r[2] else "",
            color_hex=r[3],
            created_at=r[4],
            comment_count=r[5],
            status=r[6],
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
           p.compiled_prompt, p.enhancement_prompt, p.created_at, p.status
           FROM posts p JOIN users u ON p.user_id = u.id
           WHERE p.id = ?""",
        (post_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Post not found")

    r = rows[0]
    status = r[10]

    # For generating/failed posts, return minimal detail
    if status != "ready":
        return PostDetail(
            id=r[0],
            username=r[1],
            image_url=f"api/posts/{r[0]}/image",
            audio_url="",
            color_hex=r[3],
            structured_object=None,
            image_analysis=None,
            squiggle_features=None,
            compiled_prompt="",
            enhancement_prompt=None,
            comments=[],
            created_at=r[9],
            status=status,
        )

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
            audio_url=f"api/audio/{cr[2]}",
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
        image_url=f"api/posts/{r[0]}/image",
        audio_url=f"api/audio/{r[2]}",
        color_hex=r[3],
        structured_object=_parse_json(r[4], AudioStructuredObject, "post structured_object"),
        image_analysis=_parse_json(r[5], ImageAnalysis, "post image_analysis"),
        squiggle_features=_parse_json(r[6], SquiggleFeatures, "post squiggle_features"),
        compiled_prompt=r[7],
        enhancement_prompt=enhancement,
        comments=comments,
        created_at=r[9],
        status="ready",
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
    if not data:
        raise HTTPException(status_code=404, detail="Image not yet available")

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

    audio_filename = rows[0][1]
    if audio_filename:
        post_audio = AUDIO_DIR / audio_filename
        if post_audio.exists():
            post_audio.unlink()
    for cr in comment_rows:
        f = AUDIO_DIR / cr[0]
        if f.exists():
            f.unlink()

    return {"status": "ok"}


@router.post("/api/posts/{post_id}/recreate", response_model=PostCreateAsyncResponse)
async def recreate_post(post_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    rows = await db.execute_fetchall(
        """SELECT user_id, original_image_data, image_data, squiggle_points,
           color_hex, audio_filename
           FROM posts WHERE id = ?""",
        (post_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Post not found")

    row = rows[0]
    if row[0] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your post")

    # Use original image if available, fallback to morphed for old posts
    original_image = row[1] if row[1] else row[2]
    raw_points = json.loads(row[3])
    color_hex_val = row[4]
    old_audio_filename = row[5]

    # Detect content type from magic bytes
    if original_image[:4] == b"\x89PNG":
        content_type = "image/png"
    else:
        content_type = "image/jpeg"

    # Delete old audio file immediately
    if old_audio_filename:
        old_audio_path = AUDIO_DIR / old_audio_filename
        if old_audio_path.exists():
            old_audio_path.unlink()

    # Delete comments and their audio files (musically linked to old audio)
    comment_rows = await db.execute_fetchall(
        "SELECT audio_filename FROM comments WHERE post_id = ?", (post_id,)
    )
    await db.execute("DELETE FROM comments WHERE post_id = ?", (post_id,))
    for cr in comment_rows:
        f = AUDIO_DIR / cr[0]
        if f.exists():
            f.unlink()

    # Set status to generating immediately
    await db.execute(
        "UPDATE posts SET status = 'generating', audio_filename = '', error_message = NULL WHERE id = ?",
        (post_id,),
    )
    await db.commit()

    row2 = await db.execute_fetchall(
        "SELECT created_at FROM posts WHERE id = ?", (post_id,)
    )
    created_at = row2[0][0] if row2 else ""

    # Launch background pipeline
    asyncio.create_task(
        run_recreate_pipeline(post_id, original_image, content_type, raw_points, color_hex_val, user["username"])
    )

    return PostCreateAsyncResponse(
        id=post_id,
        status="generating",
        color_hex=color_hex_val,
        created_at=created_at,
    )
