'use client';

// ★重要: 'use' を追加でインポートします
import { useState, useEffect, useRef, use } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';

// ==========================================
// 🎨 アイコン定義
// ==========================================
const Icons = {
    Upload: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
    ),
    Video: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
    ),
    Brain: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" /><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" /></svg>
    ),
    Scissors: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="20" x2="8.12" y1="4" y2="15.88" /><line x1="14.47" x2="20" y1="14.48" y2="20" /><line x1="8.12" x2="12" y1="8.12" y2="12" /></svg>
    ),
    Check: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
    ),
    Refresh: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" /></svg>
    ),
    Download: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
    ),
};

const GENRES = [
    { id: 'general', name: '🎥 一般・Vlog', desc: '視聴維持率を重視したカット' },
    { id: 'fps', name: '🔫 FPS/TPSゲーム', desc: '戦闘の流れ・キルシーン抽出' },
    { id: 'horror', name: '👻 ホラーゲーム', desc: '絶叫・恐怖シーンを検知' },
    { id: 'chat', name: '💬 雑談・トーク', desc: '話のフリとオチを逃さない' },
    { id: 'singing', name: '🎤 歌枠・ライブ', desc: 'サビや盛り上がりを抽出' },
    { id: 'gacha', name: '💎 ガチャ配信', desc: '神引き・リアクション抽出' },
];

// ==========================================
// メインコンポーネント
// ==========================================
// ★重要: params の型を Promise に変更し、use() で取り出します
export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
    // ★ここが変わりました：use()を使って params の中身を取り出します
    const { id } = use(params);

    const router = useRouter();
    // id が 'new' なら新規アップロードモード
    const isNew = id === 'new';
    const videoId = isNew ? null : id;

    // --- アップロード用 State ---
    const [file, setFile] = useState<File | null>(null);
    const [genre, setGenre] = useState('general');
    const [uploading, setUploading] = useState(false);

    // --- 編集用 State ---
    const [videoStatus, setVideoStatus] = useState<string>('');
    const [videoData, setVideoData] = useState<any>(null);
    const [editRange, setEditRange] = useState<number[]>([0, 10]);
    const [duration, setDuration] = useState<number>(0);
    const [currentSubtitleText, setCurrentSubtitleText] = useState<string>('');

    // Refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // 1. データの監視 (編集モードのみ)
    useEffect(() => {
        if (!videoId) return;

        const fetchVideo = async () => {
            // エラー回避: データがない場合に備える
            try {
                const { data, error } = await supabase.from('videos').select('*').eq('id', videoId).single();
                if (error || !data) {
                    console.error('Video fetch error:', error);
                    // 404でも一旦アラートは出さず、ダッシュボードに戻すか判断
                    // alert('動画が見つかりません'); 
                    // router.push('/dashboard');
                    return;
                }
                updateVideoState(data);
            } catch (e) {
                console.error(e);
            }
        };
        fetchVideo();

        const channel = supabase
            .channel(`video-${videoId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'videos', filter: `id=eq.${videoId}` },
                (payload) => updateVideoState(payload.new)
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [videoId, router]);

    const updateVideoState = (data: any) => {
        setVideoData(data);
        setVideoStatus(data.status);

        // 初回ロード時、AIの提案があれば範囲をセット
        if (data.status === 'waiting_approval' && data.ai_start_sec && data.ai_end_sec) {
            setEditRange((prev) => {
                if (prev[0] === 0 && prev[1] === 10) {
                    return [data.ai_start_sec, data.ai_end_sec];
                }
                return prev;
            });
        }
    }

    // 2. アップロード処理
    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);
        try {
            // (1) 署名付きURLを取得
            const res = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: file.name, contentType: file.type }),
            });
            if (!res.ok) throw new Error('Upload API Error');
            const { signedUrl, storageKey, publicUrl } = await res.json();

            // (2) R2へ直接アップロード
            await fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });

            // (3) DBに登録
            const { data, error } = await supabase.from('videos').insert({
                storage_key: storageKey,
                original_url: publicUrl,
                status: 'pending_analysis',
                genre: genre,
            }).select().single();

            if (error) throw error;

            // (4) 編集画面へリダイレクト
            setUploading(false);
            router.push(`/editor/${data.id}`);

        } catch (e) {
            console.error(e);
            alert('アップロードに失敗しました。');
            setUploading(false);
        }
    };

    // 3. 承認処理
    const handleApprove = async () => {
        if (!videoId) return;
        await supabase.from('videos').update({
            ai_start_sec: editRange[0],
            ai_end_sec: editRange[1],
        }).eq('id', videoId);
        await supabase.from('videos').update({ status: 'queued_creation' }).eq('id', videoId);
    };

    // 4. Canvasレンダリング
    useEffect(() => {
        if (!videoId) return;
        let animationFrameId: number;

        const render = () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;

            if (video && canvas && video.readyState >= 2) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = 'black';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    // Center Crop Logic
                    const videoAspect = video.videoWidth / video.videoHeight;
                    const targetAspect = canvas.width / canvas.height;
                    let drawWidth, drawHeight, offsetX, offsetY;

                    if (videoAspect > targetAspect) {
                        drawHeight = canvas.height;
                        drawWidth = canvas.height * videoAspect;
                        offsetY = 0;
                        offsetX = (canvas.width - drawWidth) / 2;
                    } else {
                        drawWidth = canvas.width;
                        drawHeight = canvas.width / videoAspect;
                        offsetX = 0;
                        offsetY = (canvas.height - drawHeight) / 2;
                    }

                    try {
                        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
                    } catch (e) { }

                    if (currentSubtitleText) {
                        ctx.font = 'bold 50px "Noto Sans JP", sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.lineJoin = 'round';
                        ctx.lineWidth = 6;
                        const x = canvas.width / 2;
                        const y = canvas.height - 180;
                        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                        ctx.strokeText(currentSubtitleText, x, y);
                        ctx.fillStyle = 'white';
                        ctx.fillText(currentSubtitleText, x, y);
                    }
                }
            }
            animationFrameId = requestAnimationFrame(render);
        };
        render();
        return () => cancelAnimationFrame(animationFrameId);
    }, [videoId, currentSubtitleText]);

    // 5. 動画イベント
    const onLoadedMetadata = () => {
        if (videoRef.current) setDuration(videoRef.current.duration);
        // 初期ジャンプ
        if (videoData?.ai_start_sec && videoRef.current) {
            videoRef.current.currentTime = videoData.ai_start_sec;
        }
    };

    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        const currentTime = videoRef.current.currentTime;

        // ループ
        if (currentTime >= editRange[1]) {
            videoRef.current.currentTime = editRange[0];
            videoRef.current.play();
        }
        // 字幕
        if (videoData?.edit_plan?.subtitles) {
            const activeSub = videoData.edit_plan.subtitles.find(
                (s: any) => currentTime >= s.start && currentTime < s.end
            );
            const nextText = activeSub ? activeSub.text : '';
            if (currentSubtitleText !== nextText) {
                setCurrentSubtitleText(nextText);
            }
        }
    };

    const onSliderChange = (val: number | number[]) => {
        if (Array.isArray(val) && videoRef.current) {
            setEditRange(val as number[]);
            const isStartChange = Math.abs(val[0] - editRange[0]) > 0.1;
            const isEndChange = Math.abs(val[1] - editRange[1]) > 0.1;
            videoRef.current.pause();
            if (isStartChange) videoRef.current.currentTime = val[0];
            else if (isEndChange) videoRef.current.currentTime = val[1];
        }
    };

    // =================================================================
    // 🅰️ Upload Mode ( /editor/new )
    // =================================================================
    if (isNew) {
        return (
            <div className="p-6 md:p-10 lg:p-12 max-w-6xl mx-auto">
                <div className="mb-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-300 mb-2">
                            CLIPTEN AI STUDIO
                        </p>
                        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-50 tracking-tight">
                            新しいプロジェクトを作成
                        </h1>
                        <p className="mt-2 text-sm md:text-base text-slate-300 max-w-xl">
                            長尺の配信アーカイブをアップロードすると、AI が見どころを解析し、
                            ショート動画向けのクリップ案を自動で生成します。
                        </p>
                    </div>
                    <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-slate-900/60 border border-slate-700/80 backdrop-blur">
                        <Icons.Brain />
                        <span className="text-xs font-semibold text-slate-200">
                            Gemini + FFmpeg で全自動切り抜き
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-8 items-start">
                    {/* 左：設定エリア */}
                    <div className="space-y-6">
                        <div className="rounded-3xl border border-slate-700/80 bg-slate-900/70 backdrop-blur shadow-[0_18px_60px_rgba(15,23,42,0.85)] p-6 md:p-8 space-y-8">
                            {/* ステップガイド */}
                            <ol className="flex flex-col md:flex-row gap-4 md:gap-6 text-xs">
                                {[
                                    { label: 'ジャンルを選択', active: true },
                                    { label: '動画をアップロード', active: !!file },
                                    { label: 'AI解析を開始', active: false },
                                ].map((step, i) => (
                                    <li key={i} className="flex items-center gap-3">
                                        <div
                                            className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold
                                            ${step.active
                                                    ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100'
                                                    : 'border-slate-700 bg-slate-900 text-slate-400'
                                                }`}
                                        >
                                            {i + 1}
                                        </div>
                                        <span className="text-slate-300">{step.label}</span>
                                    </li>
                                ))}
                            </ol>

                            {/* ジャンル選択 */}
                            <div className="space-y-3">
                                <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                                    <span className="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-indigo-400 to-purple-400" />
                                    動画のジャンル
                                    <span className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">
                                        AIの解析精度に影響します
                                    </span>
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {GENRES.map((g) => {
                                        const selected = genre === g.id;
                                        return (
                                            <button
                                                key={g.id}
                                                type="button"
                                                onClick={() => setGenre(g.id)}
                                                className={`group relative overflow-hidden rounded-2xl border px-4 py-3.5 text-left transition-all
                                                ${selected
                                                        ? 'border-indigo-400 bg-gradient-to-br from-indigo-600/70 via-indigo-500/60 to-purple-500/60 shadow-[0_18px_45px_rgba(79,70,229,0.7)]'
                                                        : 'border-slate-700/80 bg-slate-900/70 hover:border-indigo-500/60 hover:bg-slate-900'
                                                    }`}
                                            >
                                                <div
                                                    className={`text-xs font-semibold mb-1 flex items-center gap-1.5 ${selected ? 'text-indigo-50' : 'text-slate-300'
                                                        }`}
                                                >
                                                    <span>{g.name}</span>
                                                </div>
                                                <p
                                                    className={`text-[11px] leading-relaxed ${selected ? 'text-indigo-100/90' : 'text-slate-400'
                                                        }`}
                                                >
                                                    {g.desc}
                                                </p>

                                                {selected && (
                                                    <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.35),_transparent_60%)]" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ファイルアップロード */}
                            <div className="space-y-3">
                                <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                                    <span className="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-sky-400 to-indigo-400" />
                                    動画ファイル（mp4 / mov など）
                                </label>

                                <div className="relative group">
                                    <input
                                        type="file"
                                        accept="video/*"
                                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                                        className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
                                    />
                                    <div
                                        className={`relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all
                                        ${file
                                                ? 'border-emerald-400/80 bg-gradient-to-br from-emerald-600/40 via-emerald-500/20 to-slate-900/60 shadow-[0_20px_60px_rgba(16,185,129,0.5)]'
                                                : 'border-slate-600/80 bg-slate-900/60 hover:border-indigo-400 hover:bg-slate-900/80'
                                            }`}
                                    >
                                        <div
                                            className={`flex h-14 w-14 items-center justify-center rounded-full border text-indigo-200 shadow-lg
                                            ${file
                                                    ? 'border-emerald-300/80 bg-emerald-500/30'
                                                    : 'border-indigo-400/70 bg-indigo-500/30'
                                                }`}
                                        >
                                            <Icons.Upload />
                                        </div>

                                        <div>
                                            <p className="text-sm font-semibold text-slate-50">
                                                {file ? file.name : 'ここにドラッグ＆ドロップ、またはクリックして選択'}
                                            </p>
                                            <p className="mt-1 text-[11px] text-slate-400">
                                                {file
                                                    ? `${(file.size / 1024 / 1024).toFixed(1)} MB / 推奨: 2時間以内の動画`
                                                    : '長時間の配信でもOK。アップロード中もこのタブを閉じずにお待ちください。'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleUpload}
                            disabled={!file || uploading}
                            className={`w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-full px-8 py-3.5 text-sm font-bold tracking-wide transition-all
                            ${!file || uploading
                                    ? 'cursor-not-allowed bg-slate-700/60 text-slate-400'
                                    : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-[0_16px_45px_rgba(236,72,153,0.7)] hover:shadow-[0_20px_60px_rgba(236,72,153,0.85)] hover:translate-y-[-1px] active:translate-y-[0.5px]'
                                }`}
                        >
                            {uploading ? (
                                <>
                                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                                    アップロード中...
                                </>
                            ) : (
                                <>
                                    <Icons.Brain />
                                    解析を開始する
                                </>
                            )}
                        </button>
                    </div>

                    {/* 右：ビジュアルプレビュー */}
                    <div className="hidden lg:flex items-center justify-center">
                        <div className="relative w-full max-w-[320px]">
                            <div className="absolute -inset-1 rounded-[2.2rem] bg-gradient-to-br from-indigo-500/70 via-purple-500/70 to-emerald-400/70 blur-2xl opacity-70" />
                            <div className="relative aspect-[9/16] w-full rounded-[2rem] border border-slate-600/80 bg-slate-900/90 shadow-[0_30px_80px_rgba(15,23,42,0.9)] overflow-hidden flex flex-col">
                                <div className="h-9 flex items-center justify-between px-4 border-b border-slate-700/80 bg-slate-900/80">
                                    <div className="flex gap-1.5">
                                        <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                                    </div>
                                    <span className="text-[10px] font-semibold text-slate-400">
                                        Preview
                                    </span>
                                </div>
                                <div className="flex-1 relative flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.45),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(52,211,153,0.4),_transparent_55%)]">
                                    <div className="absolute inset-x-6 top-8 space-y-2 text-center">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-200/80">
                                            AI EDIT HIGHLIGHT
                                        </p>
                                        <p className="text-sm font-bold text-slate-50 leading-snug">
                                            {file
                                                ? 'アップロードされた動画からベストなハイライトを生成します'
                                                : 'まだ動画が選択されていません'}
                                        </p>
                                    </div>
                                    <div className="absolute inset-x-4 bottom-8 flex flex-col gap-2">
                                        <div className="h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
                                            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-indigo-500" />
                                        </div>
                                        <div className="flex justify-between text-[9px] text-slate-300/80 font-mono">
                                            <span>00:00:00</span>
                                            <span>AI Cut</span>
                                            <span>00:59:59</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // =================================================================
    // 🅱️ Editor Mode ( /editor/[id] )
    // =================================================================
    if (!videoData) {
        return <div className="p-20 text-center">Loading Project...</div>;
    }

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            {/* ヘッダー */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div className="flex items-center gap-4">
                    <StatusBadge status={videoStatus} />
                    <h2 className="font-bold text-gray-700">{videoData.ai_title || 'Untitled Project'}</h2>
                </div>
                <button onClick={() => router.push('/dashboard')} className="text-sm text-gray-500 hover:text-gray-900">
                    一覧に戻る
                </button>
            </div>

            {/* 1. 解析中 */}
            {['pending_analysis', 'analyzing'].includes(videoStatus) && (
                <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-gray-200">
                    <div className="inline-block p-4 bg-indigo-50 text-indigo-600 rounded-full animate-pulse mb-4">
                        <Icons.Brain />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">AIが動画を解析しています</h3>
                    <p className="text-gray-500 mt-2">Gemini Pro が見どころを探しています。<br />このページを離れても解析は続きます。</p>
                </div>
            )}

            {/* 2. 編集画面 */}
            {videoStatus === 'waiting_approval' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* 左カラム */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">AI Title Idea</span>
                            <p className="text-lg font-bold text-gray-900 mt-1">{videoData.ai_title}</p>
                            <p className="text-sm text-gray-600 mt-2 leading-relaxed">{videoData.ai_reason}</p>
                        </div>

                        <div className="bg-black rounded-xl overflow-hidden shadow-sm relative group aspect-video">
                            <video
                                key={videoId}
                                ref={videoRef}
                                src={videoData.original_url}
                                onLoadedMetadata={onLoadedMetadata}
                                onTimeUpdate={handleTimeUpdate}
                                controls
                                crossOrigin="anonymous"
                                className="w-full h-full object-contain"
                            />
                            <div className="absolute inset-0 pointer-events-none bg-black/60 transition-opacity"
                                style={{
                                    clipPath: `polygon(0 0, 0 100%, ${(editRange[0] / duration) * 100}% 100%, ${(editRange[0] / duration) * 100}% 0, ${(editRange[1] / duration) * 100}% 0, ${(editRange[1] / duration) * 100}% 100%, 100% 100%, 100% 0)`
                                }}>
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                            <div className="flex justify-between text-xs font-mono text-gray-500 mb-4">
                                <span>Start: {editRange[0].toFixed(1)}s</span>
                                <span className="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded">Duration: {(editRange[1] - editRange[0]).toFixed(1)}s</span>
                                <span>End: {editRange[1].toFixed(1)}s</span>
                            </div>
                            <Slider
                                range
                                min={0}
                                max={duration || 100}
                                step={0.1}
                                value={editRange}
                                onChange={onSliderChange as any}
                                trackStyle={[{ backgroundColor: '#4f46e5', height: 8 }]}
                                handleStyle={[
                                    { borderColor: '#4f46e5', backgroundColor: 'white', width: 24, height: 24, marginTop: -9, opacity: 1, boxShadow: '0 2px 5px rgba(0,0,0,0.2)' },
                                    { borderColor: '#4f46e5', backgroundColor: 'white', width: 24, height: 24, marginTop: -9, opacity: 1, boxShadow: '0 2px 5px rgba(0,0,0,0.2)' },
                                ]}
                                railStyle={{ backgroundColor: '#e5e7eb', height: 8 }}
                            />
                        </div>
                    </div>

                    {/* 右カラム (Preview) */}
                    <div className="space-y-4">
                        <div className="relative mx-auto aspect-[9/16] w-full max-w-[260px] bg-gray-900 rounded-[2rem] border-[8px] border-gray-800 overflow-hidden shadow-xl ring-1 ring-black/5">
                            <canvas
                                key={videoId}
                                ref={canvasRef}
                                width={720}
                                height={1280}
                                className="absolute inset-0 w-full h-full object-cover"
                            />
                        </div>
                        <button
                            onClick={handleApprove}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                            <Icons.Check /> 作成する
                        </button>
                    </div>
                </div>
            )}

            {/* 3. 作成中 */}
            {['queued_creation', 'creating'].includes(videoStatus) && (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
                    <div className="inline-block p-4 bg-purple-50 text-purple-600 rounded-full animate-spin mb-4">
                        <svg className="w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">動画を生成しています...</h3>
                    <p className="text-gray-500 mt-2">FFmpegによるレンダリング中です。完了すると通知されます。</p>
                </div>
            )}

            {/* 4. 完了 */}
            {videoStatus === 'completed' && (
                <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                    <div className="order-2 md:order-1 space-y-6">
                        <div className="inline-block px-3 py-1 bg-green-100 text-green-700 font-bold rounded-full text-sm">Completed</div>
                        <h3 className="text-3xl font-extrabold text-gray-900">✨ 完成しました！</h3>
                        <a
                            href={videoData.result_url}
                            download
                            className="block w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-center shadow-md transition-all flex items-center justify-center gap-2"
                        >
                            <Icons.Download /> ダウンロード
                        </a>
                    </div>
                    <div className="order-1 md:order-2">
                        <div className="aspect-[9/16] bg-black rounded-[2rem] overflow-hidden shadow-xl mx-auto border-[8px] border-gray-800 relative max-w-[240px]">
                            <video
                                src={videoData.result_url}
                                controls
                                poster={videoData.thumbnail_url}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* 5. エラー */}
            {videoStatus === 'error' && (
                <div className="bg-red-50 border border-red-200 p-6 rounded-xl text-center">
                    <h3 className="text-red-700 font-bold text-xl">エラーが発生しました</h3>
                    <p className="text-red-600 mt-2">{videoData.error_message}</p>
                </div>
            )}

        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles: any = {
        pending_analysis: { text: '待機中', color: 'bg-gray-100 text-gray-600' },
        analyzing: { text: '解析中', color: 'bg-indigo-100 text-indigo-700 animate-pulse' },
        waiting_approval: { text: '承認待ち', color: 'bg-green-100 text-green-700' },
        queued_creation: { text: '作成待機', color: 'bg-purple-100 text-purple-700' },
        creating: { text: '作成中', color: 'bg-purple-100 text-purple-700 animate-pulse' },
        completed: { text: '完了', color: 'bg-blue-100 text-blue-700' },
        error: { text: 'エラー', color: 'bg-red-100 text-red-700' },
    };
    const current = styles[status] || { text: status, color: 'bg-gray-100 text-gray-500' };

    return (
        <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide border border-transparent ${current.color}`}>
            {current.text}
        </span>
    );
}