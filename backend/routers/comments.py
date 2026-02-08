import json
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.config import settings
from backend.models.schemas import (
    ColorInput,
    CommentCreateResponse,
    CommentData,
    CommentsListResponse,
    SquigglePoint,
)
from backend.services.audio_generator import generate_audio
from backend.services.image_analysis import analyze_image
from backend.services.prompt_compiler import compile_prompt
from backend.services.prompt_object_generator import generate_audio_object
from backend.services.squiggle_extraction import extract_features
from backend.state.store import state

router = APIRouter()


@router.post("/api/comments", response_model=CommentCreateResponse)
async def create_comment(
    image: UploadFile = File(...),
    color_hex: str = Form(...),
    squiggle_points: str = Form(...),
):
    if state.current_post is None:
        raise HTTPException(status_code=404, detail="Create a post first")

    # Read and validate image
    image_bytes = await image.read()
    max_bytes = settings.max_image_size_mb * 1024 * 1024
    if len(image_bytes) > max_bytes:
        raise HTTPException(status_code=413, detail="Image too large")

    # Parse squiggle points
    try:
        raw_points = json.loads(squiggle_points)
        points = [SquigglePoint(**p) for p in raw_points]
    except (json.JSONDecodeError, Exception) as e:
        raise HTTPException(status_code=422, detail=f"Invalid squiggle_points: {e}")

    if len(points) < 2:
        raise HTTPException(status_code=422, detail="Too few squiggle points (need at least 2)")

    # Process color
    try:
        color = ColorInput.from_hex(color_hex)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid color_hex")

    # Pipeline
    try:
        image_analysis = await analyze_image(image_bytes, image.content_type or "image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Image analysis failed: {e}")

    squiggle_features = extract_features(points)

    parent_object = state.current_post.structured_object

    try:
        structured_object = await generate_audio_object(
            image_analysis, color, squiggle_features, parent=parent_object
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Unexpected format: {e}")

    prompt_text = compile_prompt(structured_object)
    comment_id = uuid.uuid4().hex[:12]

    try:
        audio_filename = await generate_audio(comment_id, prompt_text, structured_object)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Audio generation failed: {e}")

    comment = CommentData(
        id=comment_id,
        structured_object=structured_object,
        audio_url=f"/api/audio/{audio_filename}",
        image_analysis=image_analysis,
        squiggle_features=squiggle_features,
        color=color,
    )
    state.comments.append(comment)
    return CommentCreateResponse(comment=comment)


@router.get("/api/comments", response_model=CommentsListResponse)
async def list_comments():
    return CommentsListResponse(comments=state.comments)
