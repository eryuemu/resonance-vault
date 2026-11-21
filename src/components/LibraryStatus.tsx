import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function LibraryStatus({ error, message, warnings, importing }: {
  error: string;
  message: string;
  warnings: string[];
  importing: boolean;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(Boolean(error || message || importing));
    if (!message || error || warnings.length || importing) return;
    const timeout = window.setTimeout(() => setVisible(false), 3200);
    return () => window.clearTimeout(timeout);
  }, [error, message, warnings, importing]);
  if (!visible || (!error && !message && !importing)) return null;
  return (
    <div className="fixed bottom-32 left-1/2 z-[60] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-[#c5a059]/40 bg-[#17171b] px-4 py-3 text-sm leading-6 text-[#f5e7cc] shadow-lg">
      {!importing && <button type="button" aria-label="关闭导入提示" onClick={() => setVisible(false)} className="float-right ml-4 rounded p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>}
      <p role={error ? 'alert' : 'status'}>{error || (importing ? '正在选择文件夹或收录歌曲，大型音乐库可能需要一些时间…' : message)}</p>
      {!!warnings.length && (
        <details className="mt-1 text-xs opacity-75">
          <summary className="cursor-pointer">查看导入说明（{warnings.length}{warnings.length === 50 ? '+' : ''}）</summary>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto break-all">
            {warnings.map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
