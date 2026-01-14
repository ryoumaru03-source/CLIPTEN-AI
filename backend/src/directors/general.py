# src/directors/general.py
from src.directors.base import BaseDirector
from src.schemas.plan import EditPlan, SubtitleItem


class GeneralDirector(BaseDirector):
    """
    【汎用・ゲーム用監督】
    無理に縦型にクロップせず、横画面全体を維持して配置する（Fitモード）。
    上下の余白にはタイトルや字幕が入る。
    """

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
        print(
            f"🎬 GeneralDirector: Constructing FIT plan (Letterbox) for {start_sec}-{end_sec}s"
        )

        # 1. 字幕の抽出
        # 指定された区間(start_sec ~ end_sec)に含まれる字幕だけを抜き出す
        subtitles = []
        for seg in transcription_segments:
            seg_center = (seg["start"] + seg["end"]) / 2
            if start_sec <= seg_center <= end_sec:
                subtitles.append(
                    SubtitleItem(start=seg["start"], end=seg["end"], text=seg["text"])
                )

        # 2. Plan作成
        # layout="fit" を指定することで、FFmpeg側が「全画面縮小＋黒帯付与」モードで動く
        return EditPlan(
            video_id=video_id,
            director_name="GeneralDirector",
            start_sec=start_sec,
            end_sec=end_sec,
            ai_title=title,
            ai_reason=reason,
            crop_keyframes=[],  # Fitモードなので座標指定は不要（空リスト）
            subtitles=subtitles,
            layout="fit",
            layout_pattern=layout_pattern,  # ★ここが重要！これでレターボックス形式になります
        )
