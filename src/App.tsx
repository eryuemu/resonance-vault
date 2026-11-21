import React, { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Minimize2 } from 'lucide-react';
import { Album, Track, ViewMode, ThemeMode, shelfDisplayModes } from './types';
import { moveCover, returnBookToShelf, type CoverReversal } from './coverTransition';
import { useSyncedVideo } from './useSyncedVideo';
import { BookshelfView } from './components/BookshelfView';
import { BookSpreadView } from './components/BookSpreadView';
import { GalleryStageView } from './components/GalleryStageView';
import { QuietPlayer } from './components/QuietPlayer';
import { FolioQueueDrawer } from './components/FolioQueueDrawer';
import { knownIds, moveItem, readPreference, writePreference } from './preferences';
import { usePlayback } from './usePlayback';
import { useLibrary } from './library/useLibrary';
import { LibraryWelcome } from './components/LibraryWelcome';
import { LibraryStatus } from './components/LibraryStatus';

const Vault: React.FC<{ libraryAlbums: Album[] }> = ({ libraryAlbums }) => {
  const albumIds = useMemo(() => new Set(libraryAlbums.map((album) => album.id)), [libraryAlbums]);
  const trackIndex = useMemo(() => new Map(libraryAlbums.flatMap((album) => album.tracks.map((track) => [track.id, { album, track }] as const))), [libraryAlbums]);
  const [albumOrder, setAlbumOrder] = useState(() => knownIds(readPreference('arc_shelf_order'), albumIds));
  const albums = useMemo(() => {
    const known = new Map(libraryAlbums.map((album) => [album.id, album]));
    return [...albumOrder.filter((id) => known.has(id)).map((id) => known.get(id)!), ...libraryAlbums.filter((album) => !albumOrder.includes(album.id))];
  }, [albumOrder, libraryAlbums]);
  const playback = usePlayback(albums);
  const { audioRef, togglePlay: handleTogglePlay } = playback;
  const activeRecord = trackIndex.get(playback.trackId) ?? { album: albums[0], track: albums[0].tracks[0] };
  const currentTrack = activeRecord.track;
  const playingAlbum = activeRecord.album;
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [shelfPage, setShelfPage] = useState(0);
  const [selectedAlbumId, setSelectedAlbumId] = useState(albums[0].id);
  const selectedAlbum = albums.find((album) => album.id === selectedAlbumId) ?? albums[0];
  const [currentView, setCurrentView] = useState<ViewMode>('shelf');
  const [stageMedia, setStageMedia] = useState<'image' | 'video'>('image');
  const [pvBackgroundEnabled, setPvBackgroundEnabled] = useState(() => readPreference('arc_pv_background') === true);
  const [folioPvEnabled, setFolioPvEnabled] = useState(() => readPreference('arc_folio_pv') === true);
  const [pvFocusEnabled, setPvFocusEnabled] = useState<false | 'keyboard' | 'pointer'>(false);
  const [bookOpening, setBookOpening] = useState<'waiting' | 'opening' | null>(null);
  const [bookClosing, setBookClosing] = useState(false);
  const [shelfDisplayMode, setShelfDisplayMode] = useState(() => {
    const saved = readPreference('arc_shelf_display');
    return shelfDisplayModes.find((mode) => mode === saved) ?? 'fan';
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlTheme = params.get('theme');
      if (urlTheme === 'light' || urlTheme === 'dark') return urlTheme;
      const saved = (() => {
        try { return localStorage.getItem('arc_theme'); } catch { return null; }
      })();
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const interfaceRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const exitPvFocusRef = useRef<HTMLButtonElement>(null);
  const viewScroll = useRef({ shelf: 0, spread: 0, stage: 0 });
  const shelfScroll = useRef(0);
  const shelfEntry = useRef('');
  const transitionDestination = useRef<ViewMode | null>(null);
  const openingFlight = useRef<AbortController | null>(null);
  const returnFromStageQueued = useRef(false);
  const reduceMotion = useReducedMotion();
  const playingVideoUrl = playingAlbum.tracks[0]?.id === currentTrack.id ? playingAlbum.videoUrl : undefined;
  const backgroundVideoUrl = pvBackgroundEnabled ? playingVideoUrl : undefined;
  const stageVideoUrl = currentView === 'stage' ? selectedAlbum.videoUrl : undefined;
  const videoUrl = backgroundVideoUrl ?? stageVideoUrl;
  const isStageVideoMode = stageMedia === 'video' && !!stageVideoUrl && stageVideoUrl === backgroundVideoUrl;
  const videoStatus = useSyncedVideo(audioRef, videoRef, backgroundVideoUrl);
  const isBackgroundVisible = !!backgroundVideoUrl && videoStatus === 'ready';
  const folioPvStatus = folioPvEnabled && backgroundVideoUrl ? videoStatus : undefined;
  const isPvFocus = !!pvFocusEnabled && isBackgroundVisible;

  useEffect(() => writePreference('arc_shelf_order', albumOrder), [albumOrder]);
  useEffect(() => writePreference('arc_shelf_display', shelfDisplayMode), [shelfDisplayMode]);
  useEffect(() => writePreference('arc_pv_background', pvBackgroundEnabled), [pvBackgroundEnabled]);
  useEffect(() => writePreference('arc_folio_pv', folioPvEnabled), [folioPvEnabled]);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const report = useCallback((message: string) => {
    clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(''), 2300);
  }, []);

  const moveAlbum = useCallback((id: string, target: string) => {
    const ids = albums.map((album) => album.id);
    const position = ids.indexOf(target);
    setAlbumOrder(moveItem(ids, ids.indexOf(id), position));
    report(`已移到第 ${position + 1} 位`);
  }, [albums, report]);

  useLayoutEffect(() => setStageMedia('image'), [currentTrack.id]);

  const playTrack = playback.playTrack;
  const togglePlayTrack = playback.togglePlayTrack;

  const playAlbum = useCallback((album: Album) => {
    const isCurrentInAlbum = album.tracks.some((t) => t.id === currentTrack.id);
    if (isCurrentInAlbum) {
      handleTogglePlay();
    } else {
      const [firstTrack] = album.tracks;
      if (firstTrack) playTrack(firstTrack);
    }
  }, [currentTrack.id, handleTogglePlay, playTrack]);

  const searchShelf = useCallback((value: string) => {
    setSearch(value);
    shelfScroll.current = 0;
    const shelf = mainRef.current?.querySelector('[data-shelf-scroll]');
    if (shelf) shelf.scrollLeft = 0;
  }, []);

  const changeShelfDisplay = useCallback((mode: typeof shelfDisplayMode) => {
    const shelf = mainRef.current?.querySelector('[data-shelf-scroll]');
    if (shelf) shelfScroll.current = shelf.scrollLeft;
    viewScroll.current.shelf = mainRef.current?.scrollTop ?? 0;
    setShelfDisplayMode(mode);
  }, []);

  useLayoutEffect(() => {
    if (!mainRef.current) return;
    mainRef.current.scrollTop = viewScroll.current[currentView];
    const shelf = mainRef.current.querySelector('[data-shelf-scroll]');
    if (shelf) shelf.scrollLeft = shelfScroll.current;
  }, [currentView, shelfDisplayMode]);

  useLayoutEffect(() => {
    if (!isBackgroundVisible) setPvFocusEnabled(false);
  }, [isBackgroundVisible]);

  useLayoutEffect(() => {
    const interfaceElement = interfaceRef.current;
    if (!isPvFocus || !interfaceElement) return;
    const previousFocus = document.activeElement;
    exitPvFocusRef.current?.focus({ preventScroll: true });
    interfaceElement.inert = true;

    return () => {
      interfaceElement.inert = false;
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    };
  }, [isPvFocus]);

  const navigate = useCallback(async (to: ViewMode, fromCover: string, toCover: string, update?: () => void, reversal?: CoverReversal) => {
    if (transitionDestination.current) return false;
    transitionDestination.current = to;

    const main = mainRef.current;
    const from = main?.dataset.view as ViewMode | undefined;
    if (main && from) viewScroll.current[from] = main.scrollTop;
    const shelf = main?.querySelector('[data-shelf-scroll]');
    if (shelf) shelfScroll.current = shelf.scrollLeft;

    try {
      const changeView = () => {
        update?.();
        setCurrentView(to);
      };
      if (to === 'shelf' && fromCover === 'folio-cover' && toCover.startsWith('shelf-') && !search.trim()) {
        await returnBookToShelf(fromCover, toCover, changeView, !!reduceMotion);
      } else {
        await moveCover(fromCover, toCover, changeView, !!reduceMotion, reversal);
      }
      return !reversal?.signal.aborted;
    } finally {
      transitionDestination.current = null;
    }
  }, [reduceMotion, search]);

  const openBook = useCallback(async (album: Album, source = `shelf-${album.id}`) => {
    if (transitionDestination.current) return;
    const controller = new AbortController();
    openingFlight.current = controller;
    try {
      const moved = await navigate('spread', source, 'folio-cover', () => {
        shelfEntry.current = source;
        viewScroll.current.spread = 0;
        setSelectedAlbumId(album.id);
        setBookOpening('waiting');
        setBookClosing(false);
      }, {
        signal: controller.signal,
        restore: () => {
          setBookOpening(null);
          setCurrentView('shelf');
        }
      });
      if (moved) setBookOpening('opening');
    } finally {
      openingFlight.current = null;
    }
  }, [navigate]);

  const returnToShelf = useCallback(() => {
    void navigate('shelf', 'folio-cover', shelfEntry.current);
  }, [navigate]);

  const closeBook = useCallback(() => {
    if (openingFlight.current) openingFlight.current.abort();
    else if (!transitionDestination.current) setBookClosing(true);
  }, []);

  const returnToSpread = useCallback(() => {
    if (transitionDestination.current === 'stage') {
      returnFromStageQueued.current = true;
      return;
    }
    void navigate('spread', 'stage-artwork', 'folio-artwork');
  }, [navigate]);

  const openStage = async () => {
    const moved = await navigate('stage', 'folio-artwork', 'stage-artwork', () => {
      viewScroll.current.stage = 0;
      setBookOpening(null);
      setStageMedia('image');
    });
    if (moved && returnFromStageQueued.current) {
      returnFromStageQueued.current = false;
      returnToSpread();
    }
  };

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('arc_theme', next);
      } catch {}
      return next;
    });
  }, []);

  const playSelectedAlbumPv = () => {
    const videoTrack = selectedAlbum.videoUrl ? selectedAlbum.tracks[0] : undefined;
    if (!videoTrack) return;
    if (currentTrack.id !== videoTrack.id || !playback.isPlaying) playTrack(videoTrack);
  };

  const handleStageMediaChange = (media: 'image' | 'video') => {
    if (media === 'video') {
      playSelectedAlbumPv();
      setPvBackgroundEnabled(true);
    }
    setStageMedia(media);
  };

  const toggleFolioPv = () => {
    if (folioPvStatus) {
      setFolioPvEnabled(false);
      return;
    }
    if (!playingVideoUrl) playSelectedAlbumPv();
    setPvBackgroundEnabled(true);
    setFolioPvEnabled(true);
  };

  const togglePvBackground = () => {
    if (pvBackgroundEnabled) setStageMedia('image');
    setPvBackgroundEnabled(!pvBackgroundEnabled);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape' && !e.repeat && !document.fullscreenElement) {
        if (queueOpen) {
          e.preventDefault();
          setQueueOpen(false);
          return;
        }
        if (isPvFocus) {
          e.preventDefault();
          setPvFocusEnabled(false);
          return;
        }
        if (openingFlight.current) {
          e.preventDefault();
          closeBook();
          return;
        }
        if (currentView === 'stage') {
          returnToSpread();
          return;
        }
        if (currentView === 'spread') {
          e.preventDefault();
          closeBook();
          return;
        }
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const focusedButton = e.target instanceof HTMLElement && e.target.closest('button');
      if (e.code === 'Space' && !e.repeat && (isPvFocus || !focusedButton)) {
        e.preventDefault();
        handleTogglePlay();
        return;
      }
      if (e.key === 'ArrowLeft' && !e.repeat) {
        e.preventDefault();
        const audio = audioRef.current;
        if (audio) {
          playback.seek(audio.currentTime - 5);
          report('快退 5 秒');
        }
        return;
      }
      if (e.key === 'ArrowRight' && !e.repeat) {
        e.preventDefault();
        const audio = audioRef.current;
        if (audio) {
          playback.seek(audio.currentTime + 5);
          report('快进 5 秒');
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        playback.setVolume(playback.volume + 0.05);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        playback.setVolume(playback.volume - 0.05);
        return;
      }
      if ((e.key === 'm' || e.key === 'M') && !e.repeat) {
        e.preventDefault();
        playback.toggleMute();
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePlay, currentView, isPvFocus, queueOpen, returnToSpread, closeBook, audioRef, playback]);

  const isDark = theme === 'dark';
  const spread = (
    <BookSpreadView
      album={selectedAlbum}
      currentTrack={currentTrack}
      isPlaying={playback.isPlaying}
      theme={theme}
      opening={bookOpening}
      closing={bookClosing}
      framePvStatus={folioPvStatus}
      onToggleFolioPv={playingVideoUrl || selectedAlbum.videoUrl ? toggleFolioPv : undefined}
      onToggleTheme={toggleTheme}
      onPlayTrack={togglePlayTrack}
      onOpenStage={openStage}
      onCloseBook={closeBook}
      onBackToShelf={returnToShelf}
    />
  );

  return (
    <div
      data-pv-focus={isPvFocus}
      className={`relative isolate h-dvh w-full flex flex-col transition-colors duration-300 overflow-hidden ${
        isDark
          ? 'paper-texture-dark bg-[#0d0e11] text-[#eae8e3]'
          : 'paper-texture-light bg-[#f7f5ef] text-[#18191e]'
      }`}
    >
      <audio
        ref={audioRef}
        src={currentTrack.audioUrl}
        preload="metadata"
        {...playback.audioEvents}
      />
      {videoUrl && (
        <div
          className={`pv-screen pointer-events-none absolute inset-0 overflow-hidden bg-black ${isBackgroundVisible || isStageVideoMode ? '' : 'invisible'}`}
          aria-hidden="true"
        >
          <video
            key={videoUrl}
            ref={videoRef}
            src={videoUrl}
            muted
            playsInline
            preload={videoUrl === playingVideoUrl ? 'auto' : 'metadata'}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (video.videoHeight) video.style.setProperty('--pv-aspect', String(video.videoWidth / video.videoHeight));
            }}
            className={`pv-video ${isBackgroundVisible ? '' : 'invisible'}`}
          />
          {isBackgroundVisible && !isStageVideoMode && (
            <div className="pv-background-scrim absolute inset-0" data-theme={theme} />
          )}
        </div>
      )}

      <div ref={interfaceRef} className="relative flex min-h-0 flex-1 flex-col">
        <main ref={mainRef} data-view={currentView} className="pv-view flex-1 min-h-0 flex flex-col relative overflow-x-hidden overflow-y-auto" key={currentView}>
          {currentView === 'shelf' && (
            <BookshelfView
              albums={albums}
              search={search}
              searchOpen={searchOpen}
              onSearchOpenChange={setSearchOpen}
              shelfPage={shelfPage}
              onShelfPageChange={setShelfPage}
              onSearch={searchShelf}
              onMoveAlbum={moveAlbum}
              onPlayAlbum={playAlbum}
              onPlayTrack={togglePlayTrack}
              theme={theme}
              displayMode={shelfDisplayMode}
              onDisplayModeChange={changeShelfDisplay}
              onToggleTheme={toggleTheme}
              onSelectAlbum={openBook}
            />
          )}

          {currentView === 'spread' && spread}

          {currentView === 'stage' && (
            <GalleryStageView
              album={selectedAlbum}
              currentTrack={currentTrack}
              isPlaying={playback.isPlaying}
              isVideoMode={isStageVideoMode}
              videoStatus={videoStatus}
              theme={theme}
              onMediaChange={handleStageMediaChange}
              onToggleTheme={toggleTheme}
              onBackToSpread={returnToSpread}
            />
          )}
        </main>

        <div className="pv-player relative z-40 shrink-0">
          <QuietPlayer
            currentTrack={currentTrack}
            currentAlbum={playingAlbum}
            onOpenCover={currentView === 'shelf' ? () => void openBook(playingAlbum, 'player-cover') : undefined}
            isPlaying={playback.isPlaying}
            isBuffering={playback.isBuffering}
            currentTime={playback.currentTime}
            duration={playback.duration}
            volume={playback.volume}
            mode={playback.mode}
            onCycleMode={() => {
              const nextMode = playback.cycleMode();
              const label =
                nextMode === 'one' ? '单曲循环'
                : nextMode === 'album' ? '专辑内循环'
                : nextMode === 'shuffle' ? '随机播放'
                : '全馆连播';
              report(`播放模式：${label}`);
            }}
            theme={theme}
            isVideoMode={isBackgroundVisible || isStageVideoMode}
            pvBackgroundStatus={backgroundVideoUrl ? videoStatus : undefined}
            onTogglePvBackground={playingVideoUrl ? togglePvBackground : undefined}
            onEnterPvFocus={isBackgroundVisible ? (event) => {
              if (!transitionDestination.current) setPvFocusEnabled(event.detail === 0 ? 'keyboard' : 'pointer');
            } : undefined}
            onTogglePlay={handleTogglePlay}
            onSeek={playback.seek}
            onPrev={() => playback.step(-1)}
            onNext={() => playback.step(1)}
            onVolumeChange={playback.setVolume}
            onToggleMute={playback.toggleMute}
            isQueueOpen={queueOpen}
            onToggleQueue={() => setQueueOpen((prev) => !prev)}
            error={playback.error}
          />
        </div>
      </div>

      <FolioQueueDrawer
        isOpen={queueOpen}
        onClose={() => setQueueOpen(false)}
        albums={albums}
        currentTrack={currentTrack}
        isPlaying={playback.isPlaying}
        onPlayTrack={togglePlayTrack}
        onPlayAlbum={playAlbum}
        theme={theme}
      />

      <div className="pointer-events-none absolute inset-x-4 bottom-40 z-50 flex justify-center md:bottom-28" role="status">
        {notice && !isPvFocus && (
          <span className="rounded-md border border-[#c5a059]/40 bg-[#17171b] px-4 py-2 text-sm text-[#f5e7cc] shadow-lg">{notice}</span>
        )}
      </div>

      {isPvFocus && (
        <button
          ref={exitPvFocusRef}
          type="button"
          aria-label="退出清屏"
          aria-keyshortcuts="Escape"
          onClick={() => setPvFocusEnabled(false)}
          data-pv-keyboard={pvFocusEnabled === 'keyboard'}
          className="pv-exit absolute inset-0 z-50 cursor-default outline-none"
        >
          <span className="pv-exit-hint absolute bottom-5 right-5 flex cursor-pointer items-center gap-2 rounded-md border border-white/25 bg-black/70 px-3 py-2 text-xs text-white">
            <Minimize2 className="h-4 w-4" aria-hidden="true" />
            退出清屏 <kbd className="text-white/75">Esc</kbd>
          </span>
        </button>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  const library = useLibrary();
  if (library.loading || !library.albums.length) {
    return <LibraryWelcome loading={library.loading} importing={library.importing} canImport={library.canImport}
      error={library.error} loadError={library.loadError} onImport={() => void library.importFolder()} onRetry={() => void library.load()} />;
  }
  return <>
    <Vault libraryAlbums={library.albums} />
    <LibraryStatus error={library.error} message={library.message} warnings={library.warnings} importing={library.importing} />
  </>;
};

export default App;
