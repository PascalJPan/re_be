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


class SquiggleFeatures(BaseModel):
    total_length: float
    bounding_box_area: float
    average_speed: float
    speed_variance: float
    point_count: int


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
    duration_seconds: int = Field(ge=5, le=15)
    relation_to_parent: Literal["original", "mirror", "variation", "contrast"]
    confidence: float = Field(ge=0.0, le=1.0)


# --- API Response Models ---

class PostData(BaseModel):
    id: str
    structured_object: AudioStructuredObject
    audio_url: str
    image_analysis: ImageAnalysis
    squiggle_features: SquiggleFeatures
    color: ColorInput


class PostCreateResponse(BaseModel):
    post: PostData


class CommentData(BaseModel):
    id: str
    structured_object: AudioStructuredObject
    audio_url: str
    image_analysis: ImageAnalysis
    squiggle_features: SquiggleFeatures
    color: ColorInput


class CommentCreateResponse(BaseModel):
    comment: CommentData


class CommentsListResponse(BaseModel):
    comments: List[CommentData]


class ResetResponse(BaseModel):
    status: str = "ok"
