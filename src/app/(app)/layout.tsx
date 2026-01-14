'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true); // ロード中フラグ

    useEffect(() => {
        // 1. リアルタイムでログイン状態を監視する
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                // ログイン成功
                setUser(session.user);
                setLoading(false);
            } else {
                // 未ログイン or ログアウト
                // まだロード中（Googleからの戻り待ち）かもしれないので、少し様子を見る
                if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
                    setLoading(false);
                    // ログインページに飛ばす
                    router.push('/login');
                }
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [router]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    // ロード中は画面を隠す（一瞬ログイン画面に戻されるのを防ぐ）
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="h-4 w-4 bg-indigo-600 rounded-full animate-bounce"></div>
                    <p className="mt-4 text-gray-400 text-sm">Loading...</p>
                </div>
            </div>
        );
    }

    // ログインしていない場合は何も表示しない（useEffectで飛ばされるのを待つ）
    if (!user) return null;

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* --- 左サイドバー --- */}
            <aside className="w-64 bg-white border-r border-gray-200 fixed h-full hidden md:flex flex-col z-10">
                <div className="p-6">
                    <h1 className="text-2xl font-extrabold text-indigo-600 tracking-tight">Clipten AI</h1>
                </div>

                <nav className="flex-1 px-4 space-y-1">
                    <Link href="/dashboard" className={`flex items-center gap-3 px-4 py-3 rounded-lg font-bold transition-colors ${pathname === '/dashboard' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                        <span>📂</span> プロジェクト
                    </Link>
                    <div className="text-xs font-bold text-gray-400 px-4 mt-6 mb-2">ACCOUNT</div>
                    <button onClick={handleLogout} className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg font-bold text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors">
                        <span>🚪</span> ログアウト
                    </button>
                </nav>

                <div className="p-4 border-t border-gray-100">
                    <div className="flex items-center gap-3">
                        {/* ユーザーアイコン */}
                        <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                            {user?.user_metadata?.avatar_url ? (
                                <img src={user.user_metadata.avatar_url} alt="User" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-indigo-100 flex items-center justify-center text-indigo-500 font-bold">
                                    {user?.email?.charAt(0).toUpperCase()}
                                </div>
                            )}
                        </div>
                        <div className="text-xs overflow-hidden">
                            <p className="font-bold text-gray-900 truncate">{user?.user_metadata?.full_name || 'User'}</p>
                            <p className="text-gray-500 truncate">{user?.email}</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* --- メインコンテンツ --- */}
            <div className="flex-1 md:ml-64">
                {children}
            </div>
        </div>
    );
}