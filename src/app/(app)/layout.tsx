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
    const [theme, setTheme] = useState<'light' | 'dark'>('dark');

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

    // テーマの初期化
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const stored = window.localStorage.getItem('clipten-theme');
        const prefersDark = window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches;
        const next: 'light' | 'dark' =
            stored === 'light' || stored === 'dark'
                ? stored
                : prefersDark
                    ? 'dark'
                    : 'light';
        setTheme(next);
        document.documentElement.dataset.theme = next;
    }, []);

    const toggleTheme = () => {
        const next: 'light' | 'dark' = theme === 'light' ? 'dark' : 'light';
        setTheme(next);
        if (typeof window !== 'undefined') {
            document.documentElement.dataset.theme = next;
            window.localStorage.setItem('clipten-theme', next);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    // ロード中は画面を隠す（一瞬ログイン画面に戻されるのを防ぐ）
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="h-4 w-4 rounded-full animate-bounce bg-blue-500"></div>
                    <p className="mt-4 text-xs text-foreground/60">Loading...</p>
                </div>
            </div>
        );
    }

    // ログインしていない場合は何も表示しない（useEffectで飛ばされるのを待つ）
    if (!user) return null;

    return (
        <div className="min-h-screen bg-background text-foreground flex">
            {/* --- 左サイドバー --- */}
            <aside className="w-64 bg-white/90 border-r border-primary-soft/40 fixed h-full hidden md:flex flex-col z-10 backdrop-blur">
                <div className="px-6 pt-6 pb-4 flex items-center justify-between gap-2">
                    <h1 className="text-2xl font-extrabold tracking-tight text-blue-600">
                        Clipten AI
                    </h1>
                    <button
                        type="button"
                        onClick={toggleTheme}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary-soft bg-white/70 text-blue-600 text-xs font-bold hover:bg-primary-soft/60 hover:text-blue-700 transition-colors"
                        aria-label="テーマを切り替え"
                    >
                        {theme === 'dark' ? '☀' : '🌙'}
                    </button>
                </div>

                <nav className="flex-1 px-4 space-y-1">
                    <Link href="/dashboard" className={`flex items-center gap-3 px-4 py-3 rounded-lg font-bold transition-colors ${pathname === '/dashboard'
                            ? 'bg-primary-soft text-blue-700'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}>
                        <span>📂</span> プロジェクト
                    </Link>
                    <div className="text-xs font-bold text-slate-400 px-4 mt-6 mb-2">ACCOUNT</div>
                    <button onClick={handleLogout} className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg font-bold text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors">
                        <span>🚪</span> ログアウト
                    </button>
                </nav>

                <div className="p-4 border-t border-primary-soft/40">
                    <div className="flex items-center gap-3">
                        {/* ユーザーアイコン */}
                        <div className="w-10 h-10 rounded-full bg-primary-soft overflow-hidden flex-shrink-0">
                            {user?.user_metadata?.avatar_url ? (
                                <img src={user.user_metadata.avatar_url} alt="User" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                                    {user?.email?.charAt(0).toUpperCase()}
                                </div>
                            )}
                        </div>
                        <div className="text-xs overflow-hidden">
                            <p className="font-bold text-slate-900 truncate">{user?.user_metadata?.full_name || 'User'}</p>
                            <p className="text-slate-500 truncate">{user?.email}</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* --- メインコンテンツ --- */}
            <div className="flex-1 md:ml-64 bg-background">
                {children}
            </div>
        </div>
    );
}