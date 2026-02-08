import colorsys
import math
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


# --- Input Models ---

class SquigglePoint(BaseModel):
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    t: int  # milliseconds since gesture start


class ColorInput(BaseModel):
    hex: str
    hue_category: str
    saturation: float = Field(ge=0.0, le=1.0)
    lightness: float = Field(ge=0.0, le=1.0)

    @classmethod
    def from_hex(cls, hex_str: str) -> "ColorInput":
        hex_str = hex_str.lstrip("#")
        r, g, b = int(hex_str[0:2], 16) / 255, int(hex_str[2:4], 16) / 255, int(hex_str[4:6], 16) / 255
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        hue_deg = h * 360

        if s < 0.1:
            category = "neutral_gray"
        elif hue_deg < 15 or hue_deg >= 345:
            category = "warm_red"
        elif hue_deg < 45:
            category = "warm_orange"
        elif hue_deg < 70:
            category = "warm_yellow"
        elif hue_deg < 160:
            category = "cool_green"
        elif hue_deg < 200:
            category = "cool_cyan"
        elif hue_deg < 260:
            category = "cool_blue"
        elif hue_deg < 290:
            category = "cool_purple"
        else:
            category = "warm_magenta"

        return cls(
            hex=f"#{hex_str}",
            hue_category=category,
            saturation=round(s, 3),
            lightness=round(l, 3),
        )


# --- Analysis Models ---

class ImageAnalysis(BaseModel):
    scene_description: str
    detected_objects: List[str]
    vibe: str
    emotion: str
    dominant_colors: List[str]
    environment: Optional[str] = None
    time_of_day: Optional[str] = None
    location_hint: Optional[str] = None
    ambient_sound_associations: List[str]
    sonic_metaphor: Optional[str] = None


class SquiggleFeatures(BaseModel):
    total_length: float
    bounding_box_area: float
    average_speed: float
    speed_variance: float
    point_count: int


class ImageEnhancementPrompt(BaseModel):
    emotional_intent: str
    visual_directive: str
    morphing_prompt: str
    style_reference: str


# --- Core Output ---

class MoodObject(BaseModel):
    primary: str
    secondary: str


class AudioStructuredObject(BaseModel):
    audio_type: Literal["music", "ambient", "hybrid"]
    mood: MoodObject
    energy: float = Field(ge=0.0, le=1.0)
    tempo: Literal["slow", "medium", "fast"]
    density: Literal["sparse", "medium", "dense"]
    texture: List[str]
    sound_references: List[str]
    duration_seconds: int = Field(ge=15, le=20)
    bpm: Optional[int] = Field(default=None, ge=30, le=300)
    musical_key: Optional[str] = Field(default=None)
    relation_to_parent: Literal["original", "mirror", "variation", "contrast"]
    confidence: float = Field(ge=0.0, le=1.0)
    instruments: Optional[List[str]] = None
    genre_hint: Optional[str] = None
    harmonic_mood: Optional[str] = None
    dynamic_shape: Optional[str] = None
    sonic_palette: Optional[str] = None


# --- Auth Models ---

class UserCreate(BaseModel):
    username: str
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class UserPublic(BaseModel):
    id: int
    username: str


class AuthResponse(BaseModel):
    user: UserPublic
    token: str


# --- API Response Models ---

class PostSummary(BaseModel):
    id: str
    username: str
    image_url: str
    audio_url: str
    color_hex: str
    comment_count: int
    created_at: str
    status: str = "ready"
    bpm: Optional[int] = None


class FeedResponse(BaseModel):
    posts: List[PostSummary]
    total: int
    page: int
    pages: int


class PostDetail(BaseModel):
    id: str
    username: str
    image_url: str
    audio_url: str
    color_hex: str
    structured_object: Optional[AudioStructuredObject] = None
    image_analysis: Optional[ImageAnalysis] = None
    squiggle_features: Optional[SquiggleFeatures] = None
    compiled_prompt: str = ""
    enhancement_prompt: Optional[ImageEnhancementPrompt] = None
    morph_status: Optional[str] = None
    comments: List["CommentDetail"] = []
    created_at: str
    status: str = "ready"


class CommentDetail(BaseModel):
    id: str
    username: str
    audio_url: str
    color_hex: str
    structured_object: Optional[AudioStructuredObject] = None
    image_analysis: Optional[ImageAnalysis] = None
    squiggle_features: Optional[SquiggleFeatures] = None
    compiled_prompt: str = ""
    created_at: str
    status: str = "ready"


class ProfileResponse(BaseModel):
    user: UserPublic
    posts: List[PostSummary]
    total: int
    page: int
    pages: int


class PostCreateAsyncResponse(BaseModel):
    id: str
    status: str
    color_hex: str
    created_at: str


class PostStatusResponse(BaseModel):
    id: str
    status: str
    error_message: str = ""


class CommentCreateAsyncResponse(BaseModel):
    id: str
    post_id: str
    status: str
    color_hex: str
    created_at: str


class CommentStatusResponse(BaseModel):
    id: str
    status: str
    error_message: str = ""
