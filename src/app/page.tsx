'use client';

import { useEffect } from 'react';

const NOTION_URL = process.env.NEXT_PUBLIC_NOTION_PAGE_URL || 'https://notion.so';

export default function RedirectPage() {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = NOTION_URL;
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black text-center">
      {/* Fallback de Meta Refresh se JS estiver desativado */}
      <noscript>
        <meta http-equiv="refresh" content={`1;url=${NOTION_URL}`} />
      </noscript>

      <div className="max-w-md w-full bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-8 backdrop-blur-xl shadow-2xl flex flex-col items-center">
        {/* Glow & Spinner */}
        <div className="relative mb-6">
          <div className="absolute -inset-1 bg-gradient-to-r from-amber-500 to-orange-600 rounded-full blur-md opacity-50 animate-pulse"></div>
          <div className="relative w-16 h-16 rounded-full bg-zinc-950 flex items-center justify-center border border-zinc-700">
            <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">
          Youth EBC
        </h1>
        <p className="text-zinc-400 text-sm mb-6">
          You're being redirected to our Notion page. If you are not redirected automatically, please click the button below.
        </p>

        {/* Botão de fallback caso demore */}
        <a
          href={NOTION_URL}
          className="w-full py-3 px-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 rounded-xl text-xs font-semibold text-zinc-200 transition-all duration-200 active:scale-[0.98]"
        >
          Go to Notion Page
        </a>
      </div>

      {/* <footer className="mt-8 text-zinc-600 text-xs font-medium">
        Youth EBC &copy; {new Date().getFullYear()}
      </footer> */}
    </main>
  );
}