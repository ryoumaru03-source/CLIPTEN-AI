from abc import ABC, abstractmethod
from src.schemas.plan import EditPlan


class BaseDirector(ABC):
    """
    すべての監督（Director）の基底クラス
    """

    @abstractmethod
    def construct_plan(
        self,
        video_path: str,
        start_sec: float,
        end_sec: float,
        video_id: str,
        transcription_segments: list = [],
        title: str = "",
        reason: str = "",
        layout_pattern: str = "normal",
    ) -> EditPlan:
        pass
