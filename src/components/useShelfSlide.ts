import { useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

function bookSlots(row: HTMLElement) {
  return Array.from(row.querySelectorAll<HTMLElement>(':scope > [data-shelf-slot]'), (book) => ({
    book,
    id: book.dataset.shelfSlot as string,
    bounds: book.getBoundingClientRect()
  }));
}

function intersectsRow(book: DOMRect, row: DOMRect) {
  return book.right > row.left && book.left < row.right;
}

function edgeOffset(book: DOMRect, row: DOMRect) {
  const side = book.left + book.width / 2 < row.left + row.width / 2 ? -1 : 1;
  return side * Math.min(book.width * 0.22, 44);
}

function bookPose(book: HTMLElement) {
  return book.querySelector<HTMLElement>(':scope > [data-shelf-pose]');
}

function snapshot(book: HTMLElement, bounds: DOMRect) {
  const pose = bookPose(book);
  const style = pose && getComputedStyle(pose);
  const matrix = style && style.transform !== 'none' ? new DOMMatrixReadOnly(style.transform) : undefined;
  const roll = (matrix ? Math.atan2(matrix.b, matrix.a) * 180 / Math.PI : 0) + (parseFloat(style?.rotate ?? '') || 0);
  const slotStyle = getComputedStyle(book);
  return { bounds, opacity: Number(slotStyle.opacity), layer: Number(slotStyle.zIndex) || 0, roll };
}

type BookSnapshot = ReturnType<typeof snapshot>;

const slideTiming = {
  duration: 480,
  easing: 'cubic-bezier(0.32, 0.08, 0.22, 1)',
  fill: 'backwards'
} satisfies KeyframeAnimationOptions;

export function useShelfSlide() {
  const flights = useRef(new Set<Animation>());
  const leaving = useRef(new Map<string, HTMLElement>());

  const stop = () => {
    flights.current.forEach((flight) => flight.cancel());
    flights.current.clear();
    leaving.current.forEach((book) => book.remove());
    leaving.current.clear();
  };

  useLayoutEffect(() => stop, []);

  return (row: HTMLElement, nextIds: string[], reduceMotion: boolean, update: () => void, align?: () => void) => {
    const commit = () => {
      flushSync(update);
      align?.();
    };
    if (reduceMotion || !row.animate || !CSS.supports('translate', '0px 0px')) {
      stop();
      commit();
      return;
    }

    const viewport = row.getBoundingClientRect();
    const slots = bookSlots(row).filter(({ bounds }) => intersectsRow(bounds, viewport))
      .map((slot) => ({ ...slot, start: snapshot(slot.book, slot.bounds) }));
    const before = new Map(slots.map(({ id, start }) => [id, start]));
    leaving.current.forEach((book, id) => {
      const bounds = book.getBoundingClientRect();
      if (intersectsRow(bounds, viewport)) before.set(id, snapshot(book, bounds));
    });
    const next = new Set(nextIds);
    const departures = slots.flatMap(({ book, id, start }) => {
      if (next.has(id)) return [];
      const copy = book.cloneNode(true) as HTMLElement;
      copy.removeAttribute('data-shelf-slot');
      copy.removeAttribute('data-sort-album');
      copy.querySelectorAll('[data-cover]').forEach((cover) => cover.removeAttribute('data-cover'));
      copy.inert = true;
      copy.setAttribute('aria-hidden', 'true');
      const pose = bookPose(book);
      const copyPose = bookPose(copy);
      if (pose && copyPose) copyPose.style.rotate = getComputedStyle(pose).rotate;
      return [{ copy, id, start, width: getComputedStyle(book).width }];
    });

    // Measure the moving books before cancelling so a reversal starts in place.
    stop();
    commit();
    const landingViewport = row.getBoundingClientRect();

    const track = (animation: Animation) => {
      flights.current.add(animation);
      const cleanup = () => flights.current.delete(animation);
      animation.finished.then(cleanup, cleanup);
      return animation;
    };

    const play = (book: HTMLElement, start: BookSnapshot, end: BookSnapshot, toX = 0) => {
      const fromX = start.bounds.left - end.bounds.left;
      const fromY = start.bounds.top - end.bounds.top;
      const distance = Math.hypot(toX - fromX, fromY);
      const fade = start.opacity !== end.opacity;
      const depth = start.layer !== end.layer;
      const roll = start.roll - end.roll;
      const pose = bookPose(book);
      // Correct the new book angle on the same timeline as its position, including on reversal.
      if (pose && Math.abs(roll) >= 0.05) track(pose.animate({ rotate: [`${roll}deg`, '0deg'] }, slideTiming));
      if (distance < 0.1 && !fade && !depth) return;
      const lift = Math.min(distance * 0.09, 16);
      const frames = Array.from({ length: 9 }, (_, step) => {
        const progress = step / 8;
        const x = fromX + (toX - fromX) * progress;
        const y = fromY * (1 - progress) - 4 * lift * progress * (1 - progress);
        const frame: Keyframe = { translate: `${x}px ${y}px` };
        if (fade) frame.opacity = start.opacity + (end.opacity - start.opacity) * progress;
        if (depth) frame.zIndex = `${Math.round(start.layer + (end.layer - start.layer) * progress)}`;
        return frame;
      });
      return track(book.animate(frames, slideTiming));
    };

    bookSlots(row).forEach(({ book, id, bounds }) => {
      const start = before.get(id);
      if (!start && !intersectsRow(bounds, landingViewport)) return;
      const end = snapshot(book, bounds);
      const entry = new DOMRect(bounds.left + edgeOffset(bounds, landingViewport), bounds.top, bounds.width, bounds.height);
      play(book, start ?? { ...end, bounds: entry, opacity: 0 }, end);
    });

    departures.forEach(({ copy, id, start, width }) => {
      const { bounds } = start;
      const left = bounds.left - landingViewport.left;
      const top = bounds.top - landingViewport.top;
      Object.assign(copy.style, {
        position: 'absolute', left: `${left + row.scrollLeft}px`, top: `${top + row.scrollTop}px`,
        width, zIndex: `${start.layer}`, transform: 'none', pointerEvents: 'none'
      });
      copy.style.setProperty('--shelf-book-width', width);
      row.append(copy);
      leaving.current.set(id, copy);
      const flight = play(copy, start, { ...start, bounds: copy.getBoundingClientRect(), opacity: 0 }, edgeOffset(bounds, viewport));
      const remove = () => {
        copy.remove();
        if (leaving.current.get(id) === copy) leaving.current.delete(id);
      };
      if (flight) flight.finished.then(remove, remove);
      else remove();
    });
  };
}
