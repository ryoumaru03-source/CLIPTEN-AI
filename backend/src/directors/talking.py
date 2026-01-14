import cv2
import mediapipe as mp
import numpy as np
from src.directors.base import BaseDirector
from src.schemas.plan import EditPlan, CropKeyframe, SubtitleItem


class TalkingDirector(BaseDirector):
    """
    【トーク・歌枠用監督】
    MediaPipeを使って人物（顔）を検出し、
    縦型画面(9:16)の中心に顔が来るように自動でカメラワークをつける。
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
        layout_pattern: str = "normal",  # ★ここがエラーの原因でした（追加）
    ) -> EditPlan:
        print(f"🎬 TalkingDirector: Analyzing face motion for {start_sec}-{end_sec}s")

        # 1. 顔検出の準備
        mp_face_detection = mp.solutions.face_detection
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
        height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)

        start_frame = int(start_sec * fps)
        end_frame = int(end_sec * fps)

        keyframes = []
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

        current_frame = start_frame

        # 処理負荷軽減のため、数フレームに1回だけ解析
        process_interval = int(fps / 2)  # 0.5秒に1回

        with mp_face_detection.FaceDetection(
            model_selection=1, min_detection_confidence=0.5
        ) as face_detection:
            while cap.isOpened() and current_frame < end_frame:
                success, image = cap.read()
                if not success:
                    break

                # 指定間隔のときだけ顔検出
                if (current_frame - start_frame) % process_interval == 0:
                    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                    results = face_detection.process(image_rgb)

                    if results.detections:
                        # 一番大きく映っている顔を選ぶ
                        face = results.detections[0]
                        bbox = face.location_data.relative_bounding_box

                        # 顔の中心X座標 (0.0 ~ 1.0)
                        center_x_ratio = bbox.xmin + (bbox.width / 2)
                        center_x_pixel = int(center_x_ratio * width)

                        # 9:16の枠 (1080x1920) を切り抜くための左端X座標を計算
                        # ターゲット幅が 1080 なので、その半分 540 を中心から引く
                        # ただし、元動画のスケールに合わせて計算が必要
                        # ここではシンプルに「切り抜くべき中心点のX座標」を記録する
                        # FFmpeg側で (center_x - target_w/2) のように使う

                        # ※ffmpeg_v4.py は「切り抜き枠の左上のX座標」を期待している
                        # ターゲットアスペクト比 (9:16) に基づくクロップ幅
                        target_aspect = 9 / 16
                        crop_width = (
                            height * target_aspect
                        )  # 縦いっぱいに合わせる場合の幅

                        # クロップ開始X座標 (中心 - 幅の半分)
                        crop_x = center_x_pixel - (crop_width / 2)

                        # 画面外にはみ出さないように補正
                        if crop_x < 0:
                            crop_x = 0
                        if crop_x + crop_width > width:
                            crop_x = width - crop_width

                        time_sec = current_frame / fps

                        keyframes.append(
                            CropKeyframe(
                                time=time_sec,
                                x=int(crop_x),
                                y=0,
                                width=int(crop_width),
                                height=int(height),
                            )
                        )

                current_frame += 1

        cap.release()
        print(f"📸 Detected {len(keyframes)} face keyframes.")

        # 2. 字幕抽出 (緩和ロジック適用済み)
        subtitles = []
        for seg in transcription_segments:
            # オーバーラップ判定 (少しでも被っていれば採用)
            if seg["start"] < end_sec and seg["end"] > start_sec:
                subtitles.append(
                    SubtitleItem(start=seg["start"], end=seg["end"], text=seg["text"])
                )

        # 3. Plan作成
        return EditPlan(
            video_id=video_id,
            director_name="TalkingDirector",
            start_sec=start_sec,
            end_sec=end_sec,
            ai_title=title,
            ai_reason=reason,
            crop_keyframes=keyframes,
            subtitles=subtitles,
            layout="fill",  # 顔検出の場合は基本的にFill(切り抜き)
            layout_pattern=layout_pattern,  # 受け取った値をそのまま渡す
        )
