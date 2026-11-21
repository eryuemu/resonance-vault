import { useLayoutEffect, useRef, useState } from 'react';
import type { MutableRefObject, PointerEvent, RefObject } from 'react';
import type { ShelfDisplayMode } from '../types';

type GalleryMode = Exclude<ShelfDisplayMode, 'shelf'>;
export type ShelfPositions = Record<GalleryMode, number>;

export const shelfWindowSize = 5;
const pixelsPerBook = 120;
const wrap = (value: number, count: number) => ((value % count) + count) % count;
const loops = (mode: GalleryMode, count: number) => mode === 'fan' && count > 1;

function limitPosition(mode: GalleryMode, count: number, position: number) {
  return loops(mode, count) ? wrap(position, count) : Math.max(0, Math.min(position, count - shelfWindowSize));
}

function halfWindow(count: number) {
  return (Math.min(count, shelfWindowSize) - 1) / 2;
}

export function galleryCenter(mode: GalleryMode, count: number, position: number) {
  const center = halfWindow(count) + position;
  // Across the fan's seam, choose the end of the library nearest the center.
  return loops(mode, count) ? wrap(center + 0.5, count) - 0.5 : center;
}

export function galleryPosition(mode: GalleryMode, count: number, center: number) {
  return limitPosition(mode, count, center - halfWindow(count));
}

function rowBookCenter(book: HTMLElement) {
  return book.offsetLeft + book.offsetWidth / 2;
}

export function rowCenter(row: HTMLElement) {
  const books = row.querySelectorAll<HTMLElement>(':scope > [data-shelf-slot]');
  const middle = row.scrollLeft + row.clientWidth / 2;
  let previous = 0;
  for (let index = 0; index < books.length; index++) {
    const center = rowBookCenter(books[index]);
    if (center >= middle) return index === 0 ? 0 : index - (center - middle) / (center - previous);
    previous = center;
  }
  return Math.max(0, books.length - 1);
}

export function alignRow(row: HTMLElement, center: number) {
  const books = row.querySelectorAll<HTMLElement>(':scope > [data-shelf-slot]');
  if (!books.length) return;
  const index = Math.max(0, Math.min(center, books.length - 1));
  const left = Math.floor(index);
  const start = rowBookCenter(books[left]);
  const end = rowBookCenter(books[Math.ceil(index)]);
  row.scrollLeft = start + (end - start) * (index - left) - row.clientWidth / 2;
}

export function shelfBooks(mode: ShelfDisplayMode, count: number, position: number) {
  if (mode === 'shelf') return Array.from({ length: count }, (_, index) => ({ index, offset: 0, opacity: 1 }));
  const half = halfWindow(count);
  const circular = loops(mode, count);
  const center = half + limitPosition(mode, count, position);
  const edge = circular ? Math.min(half + 0.85, count / 2) : half + 0.85;
  const books = [];
  for (let i = Math.floor(center - edge) + 1; i < center + edge; i++) {
    if (!circular && (i < 0 || i >= count)) continue;
    const offset = i - center;
    const fade = Math.min(1, (edge - Math.abs(offset)) / (edge - half));
    const opacity = fade * fade * (3 - 2 * fade);
    books.push({ index: circular ? wrap(i, count) : i, offset, opacity });
  }
  return books;
}

export function useShelfBrowse(
  rowRef: RefObject<HTMLDivElement>,
  mode: ShelfDisplayMode | 'search',
  count: number,
  positions: MutableRefObject<ShelfPositions>,
  reduceMotion: boolean,
) {
  const [location, setLocation] = useState<{ mode: GalleryMode; position: number }>();
  const [browsing, setBrowsing] = useState(false);
  const scroll = useRef<(pixels: number, immediate?: boolean) => boolean>();
  const pause = useRef<() => void>();
  const touch = useRef<{ id: number; startX: number; startY: number; x: number; dragging: boolean }>();
  const position = mode === 'shelf' || mode === 'search' ? 0 : limitPosition(mode, count,
    location?.mode === mode ? location.position : positions.current[mode]);

  // Save the rendered position so the open book returns to the exact same slot.
  useLayoutEffect(() => {
    if (mode !== 'shelf' && mode !== 'search') positions.current[mode] = position;
  }, [mode, position, positions]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const stage = row?.parentElement;
    if (mode === 'search' || !row || !stage) return;

    const horizontal = mode === 'shelf';
    const circular = !horizontal && loops(mode, count);
    const read = () => horizontal ? row.scrollLeft : positions.current[mode];
    const clamp = (value: number) => horizontal
      ? Math.max(0, Math.min(value, row.scrollWidth - row.clientWidth))
      : circular ? value : limitPosition(mode, count, value);
    const write = (value: number) => {
      if (horizontal) row.scrollLeft = value;
      else setLocation({ mode, position: limitPosition(mode, count, value) });
    };
    let current = read();
    let target = current;
    let frame = 0;
    let previous = 0;

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    pause.current = () => {
      stop();
      current = target = read();
      setBrowsing(false);
    };
    setBrowsing(false);

    const advance = (now: number) => {
      target = clamp(target);
      const elapsed = Math.min(now - previous, 50);
      previous = now;
      current += (target - current) * -Math.expm1(-elapsed / 85);
      if (Math.abs(target - current) <= (horizontal ? 0.75 : 0.006)) {
        current = target = circular ? wrap(target, count) : target;
        write(current);
        frame = 0;
        setBrowsing(false);
        return;
      }
      write(current);
      frame = requestAnimationFrame(advance);
    };

    scroll.current = (pixels, immediate) => {
      if (row.closest('[inert]') || !Number.isFinite(pixels) || !pixels) return false;
      if (!frame && horizontal) current = target = read();
      if (immediate && frame) target = current;
      const next = clamp(target + (horizontal ? pixels * 1.6 : pixels / pixelsPerBook));
      if (next === target) return frame !== 0;
      target = next;
      if (reduceMotion || immediate) {
        stop();
        current = target = circular ? wrap(target, count) : target;
        write(current);
        setBrowsing(false);
      } else if (!frame) {
        setBrowsing(true);
        previous = performance.now();
        frame = requestAnimationFrame(advance);
      }
      return true;
    };

    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      const unit = event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? row.clientWidth : 1;
      const distance = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (scroll.current?.(distance * unit)) event.preventDefault();
    };
    stage.addEventListener('wheel', wheel, { passive: false });
    return () => {
      stop();
      scroll.current = pause.current = undefined;
      touch.current = undefined;
      stage.removeEventListener('wheel', wheel);
    };
  }, [mode, count, reduceMotion, rowRef, positions]);

  return {
    position,
    browsing,
    pause: () => pause.current?.(),
    setPosition: (mode: GalleryMode, position: number) => setLocation({ mode, position }),
    step: (direction: number) => scroll.current?.(direction * pixelsPerBook),
    touchHandlers: mode === 'shelf' ? undefined : {
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.pointerType !== 'touch' || !event.isPrimary) return;
        touch.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, dragging: false };
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const gesture = touch.current;
        if (!gesture || event.pointerId !== gesture.id) return;
        const distance = gesture.startX - event.clientX;
        if (!gesture.dragging) {
          if (Math.abs(distance) < 8 || Math.abs(distance) <= Math.abs(gesture.startY - event.clientY)) return;
          gesture.dragging = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        scroll.current?.(gesture.x - event.clientX, true);
        gesture.x = event.clientX;
      },
      onPointerUp() { touch.current = undefined; },
      onPointerCancel() { touch.current = undefined; }
    }
  };
}
