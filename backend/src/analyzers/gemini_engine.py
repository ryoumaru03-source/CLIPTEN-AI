from google import genai
from google.genai import types
import os
import json
import time
import traceback

from google.generativeai.types import HarmCategory, HarmBlockThreshold

# ==========================================
# ジャンル別設定 (Prompt & Constraints)
# ==========================================
GENRE_CONFIG = {
    "horror": {
        "description": "ホラーゲーム実況",
        "min_sec": 30,
        "max_sec": 60,
        "criteria": """
        【評価基準: 恐怖とリアクション】
        1. **Jumpscare**: お化けが出現した瞬間や、大きな音が鳴った瞬間。
        2. **Reaction**: 配信者の「絶叫」や「椅子から転げ落ちる」などの激しいリアクション。
        3. **Build-up**: 何かが起こりそうな静寂（フリ）から、驚き（オチ）までの流れ。
        """,
        "hook_instruction": "最初の3秒で『何かが起こりそう』な不穏な空気、または突然の絶叫を持ってくること。",
    },
    "fps": {
        "description": "FPS/TPSゲーム (Apex, Valorant等)",
        "min_sec": 15,
        "max_sec": 45,
        "criteria": """
        【評価基準: プレイスキルと爽快感】
        1. **Multi-kill**: 短時間での連続キル。
        2. **Clutch**: 1vs多の状況からの逆転勝利。
        3. **Aim**: 視点が激しく動き、正確に敵を捉えている瞬間。
        ※移動だけのシーンや、メニュー画面はスコアを低くすること。
        """,
        "hook_instruction": "最初の1秒で発砲音や敵との遭遇シーンを持ってきて、視聴者の指を止めること。",
    },
    "chat": {
        "description": "雑談・トーク",
        "min_sec": 30,
        "max_sec": 60,
        "criteria": """
        【評価基準: トークの構成と笑い】
        1. **Punchline**: 明確な「オチ」があり、笑いが起きている箇所。
        2. **Empathy**: 視聴者が「わかる」と共感できるエピソード。
        3. **Power Word**: パワーワード（強い言葉）が飛び出した瞬間。
        """,
        "hook_instruction": "トークの「結論」や「衝撃的な一言」を冒頭に持ってくる、または「これから面白い話をします」という導入部分をフックにすること。",
    },
    "singing": {
        "description": "歌枠・カラオケ",
        "min_sec": 45,
        "max_sec": 60,
        "criteria": """
        【評価基準: 歌唱力と感情】
        1. **Climax**: 曲の一番の盛り上がり（サビ）。
        2. **Technique**: ビブラート、高音、ロングトーンなどの技術的見せ場。
        3. **Gap**: 普段の声と歌声のギャップ。
        ※曲の途中でぶつ切りにせず、フレーズの終わりまで綺麗に切り取ること。
        """,
        "hook_instruction": "ブレス（息継ぎ）から歌い出しの瞬間、またはサビの入りを冒頭にすること。",
    },
    "gacha": {
        "description": "ガチャ配信",
        "min_sec": 20,
        "max_sec": 50,
        "criteria": """
        【評価基準: 結果の落差】
        1. **God Pull**: 確率の低いレアキャラを引いた瞬間の歓喜。
        2. **Bad Luck**: 大金を費やしても出ない時の「発狂」や「虚無顔」。
        """,
        "hook_instruction": "ガチャの演出が始まる瞬間、または結果が出た瞬間のリアクションを冒頭にすること。",
    },
    "general": {
        "description": "一般的な動画",
        "min_sec": 20,
        "max_sec": 60,
        "criteria": """
        【評価基準: 視聴維持率】
        動画全体を通して、最も感情が動き、視聴者が離脱しないと思われる瞬間。
        笑い、驚き、怒り、感動など、感情の振れ幅が大きい箇所。
        """,
        "hook_instruction": "映像的に動きがある、または大きな声が出ている箇所を冒頭にすること。",
    },
}


def analyze_chunk_with_gemini(args):
    """
    Gemini (Google Gen AI SDK v1.0+) を使って動画を分析し、ショート動画候補を提案する。
    """
    chunk_path = args["chunk_path"]
    offset = args.get("offset_seconds", 0)
    genre_key = args.get("genre", "general")

    # ジャンル設定を取得
    genre_conf = GENRE_CONFIG.get(genre_key, GENRE_CONFIG["general"])

    # APIキーの取得
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")

    if not api_key:
        print("❌ Error: GOOGLE_API_KEY not found.")
        return []

    # クライアントの初期化 (genai.Clientを使用)
    client = genai.Client(api_key=api_key)

    video_file = None
    try:
        print(f"Uploading to Gemini... (Genre: {genre_key})")

        # ファイルアップロード (files.upload)
        with open(chunk_path, "rb") as f:
            video_file = client.files.upload(file=f, config={"mime_type": "video/mp4"})

        # 処理待ちループ
        while True:
            # ステータス取得 (files.get)
            file_info = client.files.get(name=video_file.name)
            # stateがEnumの場合と文字列の場合に対応
            state = (
                file_info.state.name
                if hasattr(file_info.state, "name")
                else str(file_info.state)
            )

            if state == "ACTIVE":
                break
            elif state == "FAILED":
                raise ValueError("Video processing failed on Gemini server.")

            time.sleep(2)

        # システムプロンプト
        system_instruction = f"""
        あなたはプロの「切り抜き動画職人」です。
        提供された動画（ジャンル: {genre_conf['description']}）から、バズる可能性が高いショート動画の候補を抽出してください。

        {genre_conf['criteria']}

        【必須要件】
        1. **長さ**: {genre_conf['min_sec']}秒 〜 {genre_conf['max_sec']}秒 の範囲に収めること。
        2. **フック**: {genre_conf['hook_instruction']}
        3. **レイアウト判定 (重要)**:
           TikTok/ShortsのUI（下部の説明文や右側のボタン）に被らない最適な配置を判定してください。
           - "A": 画面最下部に字幕や重要なゲームUIがあり、隠れてはいけない場合（映像を上に配置）。
           - "B": 画面中央よりやや下に被写体や重要情報がある場合。
           - "normal": 被写体が中央にいる、または特に考慮不要な場合。
        
        4. **横向き判断**: 
           - FPSで広い視野が重要な場合などは `"is_landscape": true` としてください。

        出力は以下のJSONリスト形式（トップ3）のみを返してください。
        [
            {{
                "title": "タイトル",
                "start": "MM:SS",
                "end": "MM:SS",
                "score": 95,
                "reason": "理由",
                "layout": "normal",  // ★追加: "A", "B", "normal" のいずれか
                "is_landscape": false
            }},
            ...
        ]
        """

        # モデル名 (デフォルト: gemini-2.0-flash推奨)
        model_name = args.get("model_name", "gemini-3-flash-preview")

        # 推論実行 (models.generate_content)
        response = client.models.generate_content(
            model=model_name,
            contents=[
                video_file,
                "この動画から最高の切り抜き箇所を3つ提案してください。",
            ],
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
            ),
        )

        # 結果のパース
        try:
            text_content = response.text
            # マークダウン除去
            if "```json" in text_content:
                text_content = text_content.replace("```json", "").replace("```", "")

            candidates = json.loads(text_content)
        except (json.JSONDecodeError, ValueError) as e:
            print(f"⚠️ JSON Parse Error: {e}. Raw: {response.text}")
            return []

        if not isinstance(candidates, list):
            candidates = [candidates]

        results = []
        for item in candidates:

            def parse_time(t_str):
                if isinstance(t_str, (int, float)):
                    return int(t_str)
                parts = list(map(int, str(t_str).split(":")))
                if len(parts) == 3:
                    return parts[0] * 3600 + parts[1] * 60 + parts[2]
                if len(parts) == 2:
                    return parts[0] * 60 + parts[1]
                return 0

            start_sec = parse_time(item.get("start", "0:00")) + offset
            end_sec = parse_time(item.get("end", "0:00")) + offset

            if end_sec <= start_sec:
                continue

            results.append(
                {
                    "title": item.get("title", "No Title"),
                    "start": start_sec,
                    "end": end_sec,
                    "score": item.get("score", 0),
                    "reason": item.get("reason", ""),
                    "layout": item.get("layout", "normal"),
                    "is_landscape": item.get("is_landscape", False),
                }
            )

        # スコア順ソート
        results.sort(key=lambda x: x.get("score", 0), reverse=True)
        return results

    except Exception as e:
        print(f"❌ Gemini Analysis Error: {e}")
        traceback.print_exc()
        return []

    finally:
        # ファイル削除 (files.delete)
        if video_file:
            try:
                print("🧹 Deleting file from Gemini...")
                client.files.delete(name=video_file.name)
            except Exception as e:
                print(f"⚠️ Failed to delete file: {e}")
