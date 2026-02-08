from typing import List, Optional

from backend.models.schemas import PostData, CommentData


class AppState:
    def __init__(self):
        self.current_post: Optional[PostData] = None
        self.comments: List[CommentData] = []

    def reset(self):
        self.current_post = None
        self.comments = []


state = AppState()
