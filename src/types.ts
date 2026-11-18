export interface Track {
  id: string;
  trackNumber: number;
  title: string;
  artist: string;
  composer: string;
  duration: string;
  audioUrl: string;
}

export interface Album {
  id: string;
  catalogNumber: string;
  title: string;
  subtitle: string;
  artist: string;
  releaseDate: string;
  publisher: string;
  studio: string;
  artwork: string;
  aspectRatio: 'portrait' | 'landscape';
  artworkPosition?: string;
  dimensions: string;
  description: string;
  videoUrl?: string;
  tracks: Track[];
  credits: { label: string; value: string }[];
}

export type ViewMode = 'shelf' | 'spread' | 'stage';
export const shelfDisplayModes = ['shelf', 'stacked', 'fan', 'cascade'] as const;
export type ShelfDisplayMode = (typeof shelfDisplayModes)[number];
export type ThemeMode = 'dark' | 'light';
export type VideoStatus = 'loading' | 'ready' | 'error';
export type PlaybackMode = 'all' | 'album' | 'one' | 'shuffle';
