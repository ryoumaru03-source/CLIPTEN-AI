import modal
import os
import time
from fastapi import Request

# ==========================================
# 0. 環境設定・イメージ定義
# ==========================================

CACHE_DIR = "/vol/cache"
volume = modal.Volume.from_name("clipten-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim()
    .apt_install(
        "ffmpeg",
        "libgl1-mesa-glx",
        "libglib2.0-0",
        "wget",
        "tar",
        "xz-utils",
        "imagemagick",
        "fonts-noto-cjk",
    )
    .run_commands(
        # FFmpegインストール
        "wget -q https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz",
        "tar -xf ffmpeg-master-latest-linux64-gpl.tar.xz",
        "find . -name 'ffmpeg' -type f -exec cp {} /usr/local/bin/ \;",
        "find . -name 'ffprobe' -type f -exec cp {} /usr/local/bin/ \;",
        "chmod +x /usr/local/bin/ffmpeg",
        "chmod +x /usr/local/bin/ffprobe",
        "rm -rf ffmpeg-master-latest-linux64-gpl*",
    )
    .pip_install(
        "boto3",
        "moviepy<2.0.0",
        "opencv-python-headless",
        "mediapipe==0.10.14",
        "google-genai",
        "google-generativeai",
        "numpy<2.0.0",
        "yt-dlp",
        "supabase",
        "requests",
        "faster-whisper",
        "torch",
        "Pillow",
        "pydantic",
        "fastapi",
        "nvidia-cudnn-cu12==9.*",
        "nvidia-cublas-cu12",
    )
    .env(
        {
            "LD_LIBRARY_PATH": "/usr/local/lib/python3.10/site-packages/nvidia/cudnn/lib:/usr/local/lib/python3.10/site-packages/nvidia/cublas/lib"
        }
    )
    # ImageMagickポリシー緩和
    .run_commands("sed -i 's/none/read,write/g' /etc/ImageMagick-6/policy.xml")
    .add_local_dir("src", remote_path="/root/src")
)

app = modal.App("clipten-director-v1")
secrets = [modal.Secret.from_name("clipten-secrets")]

# ==========================================
# 0.5 プラン設定 (Plan Specs)
# ==========================================
PLAN_CONFIG = {
    "free": {
        "name": "Free Plan",
        "monthly_limit": 5,
        "resolution": "720:1280",
        "ai_model": "gemini-2.0-flash",
        "whisper_model": "medium",
        "priority": 0,
    },
    "pro": {
        "name": "Pro Plan",
        "monthly_limit": None,
        "resolution": "1080:1920",
        "ai_model": "gemini-2.0-flash",
        "whisper_model": "large-v3-turbo",
        "priority": 1,
    },
    "business": {
        "name": "Business Plan",
        "monthly_limit": None,
        "resolution": "1080:1920",
        "ai_model": "gemini-2.0-flash",
        "whisper_model": "large-v3-turbo",
        "priority": 2,
    },
}


# ==========================================
# 1. R2 / S3 ユーティリティ
# ==========================================
def get_r2_client():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def download_from_r2(storage_key, save_path):
    print(f"📥 R2 Downloading: {storage_key}")
    r2 = get_r2_client()
    r2.download_file(os.environ["R2_BUCKET_NAME"], storage_key, save_path)


def upload_to_r2(file_path, storage_key, content_type="video/mp4"):
    print(f"📤 R2 Uploading: {storage_key}")
    r2 = get_r2_client()
    r2.upload_file(
        file_path,
        os.environ["R2_BUCKET_NAME"],
        storage_key,
        ExtraArgs={"ContentType": content_type},
    )
    domain = os.environ.get("NEXT_PUBLIC_R2_PUBLIC_DOMAIN") or os.environ.get(
        "R2_PUBLIC_DOMAIN"
    )
    return f"https://{domain}/{storage_key}" if domain else storage_key


def download_video_smart(url, save_path):
    import yt_dlp

    ydl_opts = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "outtmpl": save_path,
        "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])


def compress_video(input_path, output_path):
    import subprocess

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-vf",
        "scale=480:-2,fps=10",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "30",
        "-c:a",
        "aac",
        "-b:a",
        "32k",
        "-ac",
        "1",
        output_path,
    ]
    subprocess.run(
        cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )


# ==========================================
# 2. 監視・司令塔 (Manager)
# ==========================================
@app.function(
    image=image,
    secrets=secrets,
)
@modal.fastapi_endpoint(method="POST")
async def webhook_entrypoint(request: Request):
    """
    SupabaseからのWebhookを受け取り、適切なワーカーを起動する。
    """
    data = await request.json()

    op_type = data.get("type")
    record = data.get("record", {})

    print(
        f"📨 Webhook Received: {op_type} - ID: {record.get('id')} - Status: {record.get('status')}"
    )

    # A. 解析トリガー
    if record.get("status") == "pending_analysis":
        print(f"🚀 Triggering Analysis for {record['id']}")
        from supabase import create_client

        supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

        # ステータスを更新して解析開始
        supabase.table("videos").update({"status": "queued_analysis"}).eq(
            "id", record["id"]
        ).execute()

        analyze_worker.spawn(record)

    # B. 作成トリガー
    elif op_type == "UPDATE" and record.get("status") in [
        "queued_creation",
        "pending_creation",
    ]:
        print(f"🚀 Triggering Creation for {record['id']}")
        create_worker.spawn(record)

    return {"message": "Event processed"}


# ==========================================
# 3. 解析ワーカー (AI Analysis & Director)
# ==========================================
@app.function(
    image=image,
    gpu="T4",
    timeout=600,
    memory=8192,
    volumes={"/vol": volume},
    secrets=secrets,
)
def run_whisper_on_gpu(video_path):
    from faster_whisper import WhisperModel
    import torch

    print("🗣 [GPU] Whisper: Loading model...")
    try:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        model = WhisperModel("large-v3-turbo", device=device, compute_type=compute_type)

        print(f"🗣 [GPU] Whisper: Transcribing... (Device: {device})")
        segments, _ = model.transcribe(video_path, language="ja")

        # =====================================================
        # 🛡️ 幻覚フィルター (ここでNGワードを削除)
        # =====================================================
        NG_WORDS = [
            "ご視聴",
            "チャンネル登録",
            "高評価",
            "登録お願い",
            "視聴ありがとう",
            "Thanks for watching",
            "Subscribe",
        ]

        formatted_segments = []
        for s in segments:
            text = s.text.strip()

            # NGワードが含まれていたらスキップ
            if any(ng in text for ng in NG_WORDS):
                print(f"🗑️ Removing hallucination: {text}")
                continue

            # 短すぎる文字もスキップ
            if len(text) <= 1:
                continue

            formatted_segments.append({"start": s.start, "end": s.end, "text": text})

        print(f"✅ Whisper Complete: {len(formatted_segments)} segments (Filtered)")
        return formatted_segments

    except Exception as e:
        print(f"❌ Whisper Error: {e}")
        raise e


@app.function(
    image=image,
    timeout=1800,
    secrets=secrets,
    volumes={"/vol": volume},
    memory=2048,
)
def analyze_worker(task):
    from src.analyzers import gemini_engine
    from src.directors.talking import TalkingDirector
    from src.directors.general import GeneralDirector
    from supabase import create_client

    supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
    record_id = task["id"]
    genre = task.get("genre", "talking")

    spec = PLAN_CONFIG["free"]

    print(f"🧐 [解析開始] ID: {record_id} (Genre: {genre})")
    supabase.table("videos").update({"status": "analyzing"}).eq(
        "id", record_id
    ).execute()

    cached_path = os.path.join(CACHE_DIR, f"raw_{record_id}.mp4")
    compressed_path = f"/tmp/ai_proxy_{record_id}.mp4"

    try:
        # --- 1. 動画準備 ---
        storage_key = task.get("storage_key")
        video_url = task.get("original_url")

        if not os.path.exists(cached_path):
            if storage_key:
                download_from_r2(storage_key, cached_path)
            elif video_url:
                download_video_smart(video_url, cached_path)
            volume.commit()

        compress_video(cached_path, compressed_path)

        # --- 2. 並列処理 ---
        print("⚡️ Spawning Whisper(GPU) & Running Gemini(CPU)...")
        whisper_job = run_whisper_on_gpu.spawn(cached_path)

        print(f"🤖 Gemini: Analyzing video...")
        candidates = gemini_engine.analyze_chunk_with_gemini(
            {
                "chunk_path": compressed_path,
                "offset_seconds": 0,
                "genre": genre,
                "model_name": spec["ai_model"],
            }
        )

        print("🗣 Waiting for Whisper result...")
        transcription_data = whisper_job.get()

        # =====================================================
        # 🛡️ NULL安全装置: Geminiが候補なしならデフォルトを作成
        # =====================================================
        if not candidates:
            print("⚠️ Gemini returned no candidates. Using Fallback Plan.")

            # 動画時間を取得 (ffprobe)
            import subprocess

            try:
                res = subprocess.run(
                    [
                        "ffprobe",
                        "-v",
                        "error",
                        "-show_entries",
                        "format=duration",
                        "-of",
                        "default=noprint_wrappers=1:nokey=1",
                        cached_path,
                    ],
                    capture_output=True,
                    text=True,
                )
                duration = float(res.stdout.strip())
            except:
                duration = 60.0  # 取得失敗時は60秒と仮定

            # 真ん中30秒を切り抜く
            mid = duration / 2
            start = max(0, mid - 15)
            end = min(duration, mid + 15)

            candidates = [
                {
                    "start": start,
                    "end": end,
                    "title": "ハイライト（自動生成失敗のため手動調整推奨）",
                    "reason": "AI解析がスキップされました。スライダーで調整してください。",
                    "score": 50,
                    "layout": "fit",
                }
            ]

        best_clip = candidates[0]
        print(f"🥇 Best Clip: {best_clip}")

        # --- 3. Director (Plan作成) ---
        print("🎬 Director: Constructing Plan...")

        director = None
        if genre in ["chat", "singing", "gacha", "talking"]:
            director = TalkingDirector()
        else:
            director = GeneralDirector()

        edit_plan = director.construct_plan(
            video_path=cached_path,
            start_sec=best_clip.get("start"),
            end_sec=best_clip.get("end"),
            video_id=str(record_id),
            transcription_segments=transcription_data,
            title=best_clip.get("title"),
            reason=best_clip.get("reason"),
            layout_pattern=best_clip.get("layout", "normal"),
        )

        # --- 4. 保存 ---
        update_data = {
            "status": "waiting_approval",
            "ai_title": best_clip.get("title"),
            "ai_reason": best_clip.get("reason"),
            "ai_start_sec": best_clip.get("start"),
            "ai_end_sec": best_clip.get("end"),
            "ai_score": best_clip.get("score"),
            "edit_plan": edit_plan.model_dump(),
        }

        supabase.table("videos").update(update_data).eq("id", record_id).execute()
        print(f"✅ [解析完了] Waiting for approval.")

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback

        traceback.print_exc()
        supabase.table("videos").update(
            {"status": "error", "error_message": str(e)}
        ).eq("id", record_id).execute()
    finally:
        if os.path.exists(compressed_path):
            os.remove(compressed_path)


# ==========================================
# 4. 作成ワーカー (Video Editor V4)
# ==========================================
@app.function(
    image=image,
    timeout=1800,
    secrets=secrets,
    volumes={"/vol": volume},
    memory=4096,
)
def create_worker(task):
    from src.editors import ffmpeg_v4
    from src.schemas.plan import EditPlan
    from supabase import create_client

    supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
    record_id = task["id"]

    print(f"🔨 [作成開始] ID: {record_id}")
    supabase.table("videos").update({"status": "creating"}).eq(
        "id", record_id
    ).execute()

    cached_path = os.path.join(CACHE_DIR, f"raw_{record_id}.mp4")
    out_path = f"/tmp/edited_{record_id}.mp4"

    try:
        if not os.path.exists(cached_path):
            storage_key = task.get("storage_key")
            video_url = task.get("original_url")

            if storage_key:
                download_from_r2(storage_key, cached_path)
            elif video_url:
                download_video_smart(video_url, cached_path)

        plan_json = task.get("edit_plan")
        if not plan_json:
            raise Exception("Edit Plan not found.")

        plan = EditPlan(**plan_json)

        user_start = task.get("ai_start_sec")
        user_end = task.get("ai_end_sec")

        if user_start is not None:
            print(f"🔄 User Override Start: {plan.start_sec} -> {user_start}")
            plan.start_sec = float(user_start)

        if user_end is not None:
            print(f"🔄 User Override End: {plan.end_sec} -> {user_end}")
            plan.end_sec = float(user_end)

        resolution = "1080:1920"

        success, thumb_local_path = ffmpeg_v4.create_final_short_video(
            input_path=cached_path,
            output_path=out_path,
            plan=plan,
            resolution=resolution,
            layout_pattern=plan.layout_pattern,
        )

        if not success:
            raise Exception("FFmpeg processing failed.")

        final_url = upload_to_r2(
            out_path, f"results/edited_{record_id}.mp4", "video/mp4"
        )

        thumb_url = None
        if thumb_local_path and os.path.exists(thumb_local_path):
            thumb_url = upload_to_r2(
                thumb_local_path, f"results/thumb_{record_id}.jpg", "image/jpeg"
            )

        update_data = {
            "status": "completed",
            "result_url": final_url,
            "thumbnail_url": thumb_url,
        }
        supabase.table("videos").update(update_data).eq("id", record_id).execute()
        print(f"✅ [作成完了] URL: {final_url}")

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback

        traceback.print_exc()
        supabase.table("videos").update(
            {"status": "error", "error_message": str(e)}
        ).eq("id", record_id).execute()

    finally:
        if os.path.exists(out_path):
            os.remove(out_path)
