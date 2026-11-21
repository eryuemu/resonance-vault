import type { Album } from '../types';
import fallbackArtwork from '../assets/default-cover.svg';

export interface LibraryImport {
  albums: Album[];
  addedTracks: number;
  existingTracks: number;
  warnings: string[];
}

// UI and playback depend on this boundary, so another source can be added later.
export interface LibraryProvider {
  load(): Promise<Album[]>;
  importFolder?: () => Promise<LibraryImport | null>;
  onImportRequested?: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    vaultDesktop?: Required<LibraryProvider>;
  }
}

function withArtwork(albums: Album[]): Album[] {
  return albums.map((album) => album.artwork ? album : { ...album, artwork: fallbackArtwork });
}

export function createLibraryProvider(): LibraryProvider {
  if (import.meta.env.MODE === 'desktop') {
    const desktop = window.vaultDesktop;
    if (!desktop) {
      return { async load() { throw new Error('请从共鸣典藏馆桌面应用打开音乐库。'); } };
    }
    return {
      async load() {
        return withArtwork(await desktop.load());
      },
      async importFolder() {
        const result = await desktop.importFolder();
        return result ? { ...result, albums: withArtwork(result.albums) } : null;
      },
      onImportRequested: desktop.onImportRequested,
    };
  }
  return {
    async load() {
      // Keep the existing development preview without bundling private media in desktop builds.
      const { LOCAL_ARCHIVE } = await import('../data/vaultData');
      return LOCAL_ARCHIVE;
    },
  };
}
