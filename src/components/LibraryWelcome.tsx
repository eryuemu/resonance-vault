import React from 'react';
import { BookOpen, FolderPlus, LoaderCircle, RefreshCw } from 'lucide-react';

interface LibraryWelcomeProps {
  loading: boolean;
  importing: boolean;
  canImport: boolean;
  error: string;
  loadError: boolean;
  onImport: () => void;
  onRetry: () => void;
}

export function LibraryWelcome({ loading, importing, canImport, error, loadError, onImport, onRetry }: LibraryWelcomeProps) {
  return (
    <main className="paper-texture-dark flex min-h-dvh items-center justify-center bg-[#0d0e11] px-6 py-12 text-[#eae8e3]">
      <div className="w-full max-w-xl text-center">
        <BookOpen className="mx-auto mb-8 h-12 w-12 text-[#c5a059]" strokeWidth={1} aria-hidden="true" />
        <p className="mb-4 font-mono text-xs tracking-[0.3em] text-[#c5a059]">RESONANCE VAULT</p>
        <h1 className="font-serif text-3xl leading-relaxed sm:text-4xl">把你的音乐，收藏成一本画册。</h1>
        <p className="mx-auto mt-5 max-w-md text-sm leading-7 text-[#a2a4b3]">
          选择音乐所在的文件夹，自动收录歌曲与封面。<br />
          音乐保留在原位置，下次打开继续听。
        </p>
        {loading ? (
          <p role="status" className="mt-9 flex items-center justify-center gap-2 text-sm text-[#c5a059]">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />正在打开音乐库…
          </p>
        ) : canImport ? (
          <button type="button" onClick={onImport} disabled={importing || loadError}
            className="mt-9 inline-flex items-center gap-2 rounded-lg border border-[#c5a059]/60 bg-[#c5a059]/15 px-6 py-3 text-[#e8d5ae] transition hover:bg-[#c5a059]/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c5a059] disabled:cursor-wait disabled:opacity-50">
            {importing ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <FolderPlus className="h-5 w-5" aria-hidden="true" />}
            {importing ? '正在选择文件夹或收录歌曲…' : '选择音乐文件夹'}
          </button>
        ) : (
          <p className="mt-9 text-sm text-[#c5a059]">请在桌面应用中添加本地音乐。</p>
        )}
        {error && (
          <div role="alert" className="mt-6 rounded-lg border border-[#c5a059]/30 p-4 text-left text-sm leading-6 text-[#e8d5ae]">
            <p>{error}</p>
            {loadError && <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-2 underline underline-offset-4">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />重新读取音乐库
            </button>}
          </div>
        )}
        <p className="mt-7 text-xs leading-6 text-[#777b89]">支持 MP3、FLAC、M4A、WAV、OGG 等音频，包含子文件夹。<br />没有封面和歌曲标签也可以导入。</p>
      </div>
    </main>
  );
}
