'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link'; // ★ Linkをインポート
// import { useRouter } from 'next/navigation'; // ← 不要になるので削除

export default function Dashboard() {
    const [videos, setVideos] = useState<any[]>([]);
    // const router = useRouter(); // ← 不要になるので削除

    useEffect(() => {
        const fetchVideos = async () => {
            // エラー回避: 自分のIDの動画がないとエラーになることがあるのでtry-catchで囲む
            try {
                const { data, error } = await supabase
                    .from('videos')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) console.error(error);
                if (data) setVideos(data);
            } catch (e) {
                console.error("Fetch error:", e);
            }
        };
        fetchVideos();
    }, []);

    // createNewProject 関数は削除（Linkタグで直接飛ぶため）

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">マイプロジェクト</h2>

                {/* ★ここを button から Link に変更 */}
                <Link
                    href="/editor/new"
                    className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2"
                >
                    ＋ 新規作成
                </Link>
            </div>

            {videos.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                    <p className="text-gray-400 font-bold">まだプロジェクトがありません</p>
                    <p className="text-sm text-gray-400 mt-2">右上のボタンから動画をアップロードしましょう</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {videos.map((video) => (
                        <Link key={video.id} href={`/editor/${video.id}`} className="block group">
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-all h-full flex flex-col">
                                <div className="aspect-video bg-gray-100 relative">
                                    {video.thumbnail_url ? (
                                        <img src={video.thumbnail_url} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                                            {/* 動画アイコン */}
                                            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
                                        </div>
                                    )}
                                    <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/50 text-white text-xs font-bold backdrop-blur-sm">
                                        {translateStatus(video.status)}
                                    </div>
                                </div>
                                <div className="p-4 flex-1">
                                    <h3 className="font-bold text-gray-900 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                                        {video.ai_title || '名称未設定のプロジェクト'}
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-2">
                                        {new Date(video.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

function translateStatus(status: string) {
    const map: any = {
        pending_analysis: '待機中',
        analyzing: '解析中',
        waiting_approval: '承認待ち',
        queued_creation: '作成待機',
        creating: '作成中',
        completed: '完了',
        error: 'エラー',
    };
    return map[status] || status;
}