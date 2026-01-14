from pydantic import BaseModel
from typing import List, Optional

# --- 依存クラスの定義 ---


class CropKeyframe(BaseModel):
    """時間ごとの切り抜き位置"""

    time: float
    x: int
    y: int
    width: int
    height: int


class SubtitleItem(BaseModel):
    """字幕データ"""

    start: float
    end: float
    text: str


# --- メインの編集指示書 ---


class EditPlan(BaseModel):
    """
    AI監督が作成する編集指示書 (JSONとしてDBに保存される)
    """

    video_id: str
    director_name: str
    target_width: int = 1080
    target_height: int = 1920

    # 動画の切り出し範囲
    start_sec: float
    end_sec: float

    # 詳細な演出データ
    crop_keyframes: List[CropKeyframe] = []
    subtitles: List[SubtitleItem] = []

    # メタデータ
    ai_title: Optional[str] = None
    ai_reason: Optional[str] = None

    # レイアウト指定 ("fill" or "fit")
    layout: str = "fill"

    # UI回避パターンの指定 ("normal", "A", "B")
    layout_pattern: str = "normal"
