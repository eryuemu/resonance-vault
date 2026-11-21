import { useCallback, useEffect, useRef, useState } from 'react';
import type { Album } from '../types';
import { createLibraryProvider } from './provider';

export function useLibrary() {
  const [provider] = useState(createLibraryProvider);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const importLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setLoadError(false);
    try { setAlbums(await provider.load()); }
    catch (reason) { setError(String(reason)); setLoadError(true); }
    finally { setLoading(false); }
  }, [provider]);

  useEffect(() => { void load(); }, [load]);

  const importFolder = useCallback(async () => {
    if (!provider.importFolder || importLock.current || loading || loadError) return;
    importLock.current = true;
    setImporting(true);
    setError('');
    setMessage('');
    setWarnings([]);
    try {
      const result = await provider.importFolder();
      if (result) {
        setAlbums(result.albums);
        setWarnings(result.warnings);
        setMessage(result.addedTracks > 0
          ? `已添加 ${result.addedTracks} 首歌曲${result.existingTracks ? `，更新 ${result.existingTracks} 首已收录歌曲` : ''}。`
          : `已更新 ${result.existingTracks} 首歌曲，没有重复添加。`);
      }
    } catch (reason) { setError(String(reason)); }
    finally { importLock.current = false; setImporting(false); }
  }, [provider, loading, loadError]);

  useEffect(() => provider.onImportRequested?.(() => void importFolder()), [provider, importFolder]);

  return { albums, loading, importing, error, loadError, message, warnings, load, importFolder,
    canImport: !!provider.importFolder };
}
