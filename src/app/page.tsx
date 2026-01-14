import { redirect } from 'next/navigation';

export default function RootPage() {
  // サイトのトップに来たら、強制的にダッシュボードへ転送する
  // (もしログインしていなければ、ダッシュボード側でさらにログイン画面へ飛ばされます)
  redirect('/dashboard');
}