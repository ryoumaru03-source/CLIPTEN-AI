import os
import subprocess
import json
import math
import datetime
from typing import Union, Dict, Any

# Pydanticモデルがインポートできれば使う、なければ辞書として扱う
try:
    from src.schemas.plan import EditPlan
except ImportError:
    EditPlan = None

# ==========================================
# ⚙️ 設定エリア
# ==========================================
FFMPEG_BINARY = (
    "/usr/local/bin/ffmpeg" if os.path.exists("/usr/local/bin/ffmpeg") else "ffmpeg"
)
FFPROBE_BINARY = (
    "/usr/local/bin/ffprobe" if os.path.exists("/usr/local/bin/ffprobe") else "ffprobe"
)
# フォントパス（日本語対応）
FONT_PATH = "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc"

# 数式爆発を防ぐための間引き間隔（秒）
KEYFRAME_INTERVAL_THRESHOLD = 1.5

# ==========================================
# 🛠 ユーティリティ関数
# ==========================================


def get_video_dimensions(input_path: str) -> tuple[int, int]:
    """ffprobeを使って動画の幅と高さを取得する"""
    cmd = [
        FFPROBE_BINARY,
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "json",
        input_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        width = data["streams"][0]["width"]
        height = data["streams"][0]["height"]
        return width, height
    except Exception as e:
        print(f"⚠️ Failed to probe video dimensions: {e}")
        return 1920, 1080


def _seconds_to_srt_time(seconds: float) -> str:
    """秒数をSRT形式 (HH:MM:SS,mmm) に変換"""
    td = datetime.timedelta(seconds=seconds)
    total_seconds = int(td.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    millis = int(td.microseconds / 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"


def _generate_srt_file(subtitles: list, output_path: str, offset_sec: float):
    """指示書の字幕リストからSRTファイルを作成する"""
    with open(output_path, "w", encoding="utf-8") as f:
        for i, sub in enumerate(subtitles):
            # オブジェクトか辞書か判定
            start = sub.start if hasattr(sub, "start") else sub["start"]
            end = sub.end if hasattr(sub, "end") else sub["end"]
            text = sub.text if hasattr(sub, "text") else sub["text"]

            rel_start = start - offset_sec
            rel_end = end - offset_sec

            if rel_end <= 0:
                continue
            if rel_start < 0:
                rel_start = 0

            f.write(f"{i+1}\n")
            f.write(
                f"{_seconds_to_srt_time(rel_start)} --> {_seconds_to_srt_time(rel_end)}\n"
            )
            f.write(f"{text}\n\n")


def _build_crop_expression(
    keyframes: list, start_offset: float, scale_factor: float, target_w: int
) -> str:
    """
    キーフレームのリストから、FFmpegのcropフィルタ用の数式(x座標)を生成する。
    """
    if not keyframes:
        return "(iw-ow)/2"

    # 時間順にソート
    raw_sorted_frames = sorted(
        keyframes, key=lambda k: k.time if hasattr(k, "time") else k["time"]
    )

    # === 間引き処理 (Resampling) ===
    resampled_frames = [raw_sorted_frames[0]]
    last_time = (
        raw_sorted_frames[0].time
        if hasattr(raw_sorted_frames[0], "time")
        else raw_sorted_frames[0]["time"]
    )

    for kf in raw_sorted_frames[1:]:
        current_time = kf.time if hasattr(kf, "time") else kf["time"]
        if (current_time - last_time) >= KEYFRAME_INTERVAL_THRESHOLD:
            resampled_frames.append(kf)
            last_time = current_time

    last_raw = raw_sorted_frames[-1]
    if resampled_frames[-1] != last_raw:
        resampled_frames.append(last_raw)

    print(
        f"📉 Optimized Keyframes: {len(raw_sorted_frames)} -> {len(resampled_frames)} points (Scale: {scale_factor:.2f})"
    )

    # === 数式組み立て ===
    expression_parts = []
    offset = target_w / 2

    def calculate_scaled_x(raw_x):
        original_center = raw_x + offset
        scaled_center = original_center * scale_factor
        new_x = scaled_center - offset
        return new_x

    for i in range(len(resampled_frames) - 1):
        kf1 = resampled_frames[i]
        kf2 = resampled_frames[i + 1]

        t1 = (kf1.time if hasattr(kf1, "time") else kf1["time"]) - start_offset
        x1_raw = kf1.x if hasattr(kf1, "x") else kf1["x"]
        x1 = calculate_scaled_x(x1_raw)

        t2 = (kf2.time if hasattr(kf2, "time") else kf2["time"]) - start_offset
        x2_raw = kf2.x if hasattr(kf2, "x") else kf2["x"]
        x2 = calculate_scaled_x(x2_raw)

        if t2 < 0:
            continue

        if abs(x1 - x2) < 0.1:
            lerp = str(int(x1))
        elif t2 == t1:
            lerp = str(int(x1))
        else:
            lerp = f"{x1:.1f}+({x2-x1:.1f})*(t-{t1:.2f})/{t2-t1:.2f}"

        part = f"if(between(t,{t1:.2f},{t2:.2f}),{lerp},"
        expression_parts.append(part)

    # 最後のフレームの補正
    last_val_raw = (
        resampled_frames[-1].x
        if hasattr(resampled_frames[-1], "x")
        else resampled_frames[-1]["x"]
    )
    last_val = calculate_scaled_x(last_val_raw)
    closing = str(int(last_val))

    expression = "".join(expression_parts) + closing + (")" * len(expression_parts))

    return expression


def _get_ui_layout_filter(
    pattern: str, target_w: int, target_h: int
) -> Union[str, None]:
    """
    指定されたパターンに基づいてUI回避用のフィルタ文字列を生成する
    Pattern A: 上部配置
    Pattern B: Y=400配置
    Normal: Noneを返し、既存ロジックに任せる
    """
    if pattern == "A":
        return f"scale={target_w}:-1,pad={target_w}:{target_h}:0:0:black"
    elif pattern == "B":
        return f"scale={target_w}:-1,pad={target_w}:{target_h}:0:400:black"
    return None


# ==========================================
# 🎬 メイン関数: create_final_short_video
# ==========================================


def create_final_short_video(
    input_path: str,
    output_path: str,
    plan: Union[Dict, Any],
    resolution: str = "1080:1920",
    layout_pattern: str = "normal",
) -> tuple[bool, str]:

    if hasattr(plan, "model_dump"):
        d_plan = plan.model_dump()
    else:
        d_plan = plan

    start_sec = d_plan["start_sec"]
    end_sec = d_plan["end_sec"]
    layout = d_plan.get("layout", "fill")  # ★レイアウト取得
    ai_title = d_plan.get("ai_title", "")  # タイトル取得

    # 解像度パース
    try:
        target_w, target_h = map(int, resolution.split(":"))
    except ValueError:
        target_w, target_h = 1080, 1920

    keyframes = d_plan.get("crop_keyframes", [])
    subtitles = d_plan.get("subtitles", [])
    duration = end_sec - start_sec

    # ★ ここで元動画サイズを取得して判定に使用 ★
    input_w, input_h = get_video_dimensions(input_path)
    is_vertical_source = input_h > input_w

    print(f"✂️ Editing: {layout.upper()} mode | {start_sec}s - {end_sec}s")
    print(
        f"📊 Dimensions: Input({input_w}x{input_h}) -> Target({target_w}x{target_h}) | Vertical: {is_vertical_source}"
    )

    thumb_path = output_path.replace(".mp4", ".jpg")
    srt_path = "/tmp/temp_subtitles.srt"

    try:
        if subtitles:
            _generate_srt_file(subtitles, srt_path, start_sec)
        else:
            with open(srt_path, "w") as f:
                f.write("")

        filters = []

        # 1. 時間カット (共通)
        filters.append(f"trim=start={start_sec}:end={end_sec},setpts=PTS-STARTPTS")

        # ★変更点2：レイアウト処理の分岐（ここから）
        # 指定されたlayout_patternがあればそれを優先し、なければ既存の自動判定ロジックを使う
        ui_filter = _get_ui_layout_filter(layout_pattern, target_w, target_h)

        if ui_filter:
            # パターンA/Bが指定された場合
            filters.append(ui_filter)
        else:
            # 既存のロジック (Normal)
            if is_vertical_source:
                # 【A. 元が縦動画の場合】
                filters.append(
                    f"scale={target_w}:{target_h}:force_original_aspect_ratio=increase"
                )
                filters.append(f"crop={target_w}:{target_h}")

                if ai_title and layout == "fit":
                    safe_title = ai_title.replace(":", "\:").replace("'", "")
                    style = f"fontfile={FONT_PATH}:fontsize=60:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=150"
                    filters.append(f"drawtext=text='{safe_title}':{style}")

            elif layout == "fit":
                # 【B. 横動画 -> Fitモード (全画面維持)】
                filters.append(f"scale={target_w}:-2")
                filters.append(f"pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:black")

                if ai_title:
                    safe_title = ai_title.replace(":", "\:").replace("'", "")
                    style = f"fontfile={FONT_PATH}:fontsize=60:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=150"
                    filters.append(f"drawtext=text='{safe_title}':{style}")

            else:
                # 【C. 横動画 -> Fillモード (ズーム切り抜き)】
                if keyframes:
                    scale_factor = target_h / input_h
                    crop_x_expr = _build_crop_expression(
                        keyframes, start_sec, scale_factor, target_w
                    )
                else:
                    crop_x_expr = "(iw-ow)/2"

                filters.append(f"scale=-2:{target_h}")
                filters.append(f"crop=w={target_w}:h={target_h}:x='{crop_x_expr}':y=0")
        # ★変更点2：ここまで

        # 3. 字幕焼き付け (共通)
        if subtitles and os.path.exists(srt_path) and os.path.getsize(srt_path) > 0:
            # 縦動画の場合は字幕を少し上げるなどの調整も可能
            # ここでは共通設定としています
            margin_v = 150 if layout == "fit" and not is_vertical_source else 100
            style = f"FontName=Noto Sans CJK JP,FontSize=16,PrimaryColour=&HFFFFFF,Outline=1,BackColour=&H80000000,BorderStyle=1,Alignment=2,MarginV={margin_v}"
            filters.append(f"subtitles={srt_path}:force_style='{style}'")

        filter_str = ",".join(filters)

        # コマンド実行 (CPUエンコード)
        cmd = [
            FFMPEG_BINARY,
            "-y",
            "-i",
            input_path,
            "-vf",
            filter_str,
            "-af",
            f"atrim=start={start_sec}:end={end_sec},asetpts=PTS-STARTPTS",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            output_path,
        ]

        print(f"🚀 Running FFmpeg ({layout}): ...")
        subprocess.run(
            cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
        )

        # サムネイル生成
        subprocess.run(
            [
                FFMPEG_BINARY,
                "-y",
                "-i",
                output_path,
                "-ss",
                f"{duration/2}",
                "-vframes",
                "1",
                "-q:v",
                "2",
                thumb_path,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        return True, thumb_path

    except Exception as e:
        print(f"❌ Create Error: {e}")
        import traceback

        traceback.print_exc()
        return False, None
    finally:
        if os.path.exists(srt_path):
            os.remove(srt_path)
