import { flushSync } from 'react-dom';
import type { ShelfDisplayMode } from './types';

function findCover(id: string) {
  return document.querySelector<HTMLElement>(`[data-cover="${CSS.escape(id)}"]`);
}

function shelfBookParts(cover: HTMLElement | null) {
  const book = cover?.closest<HTMLElement>('.shelf-book');
  const pose = book?.parentElement;
  return book && pose ? { book, pose } : undefined;
}

function settleTransform(element: HTMLElement, start: string) {
  const rest = getComputedStyle(element).transform;
  if (start !== rest) {
    element.animate([{ transform: start }, { transform: rest }], {
      duration: 180, easing: 'ease-out', fill: 'backwards'
    });
  }
}

export interface CoverReversal {
  signal: AbortSignal;
  restore: () => void;
}

export async function moveCover(from: string, to: string, update: () => void, reduceMotion: boolean, reversal?: CoverReversal) {
  const source = findCover(from);
  if (reduceMotion || !document.startViewTransition || !source) {
    update();
    return;
  }

  const root = document.documentElement;
  let destination: HTMLElement | null | undefined;
  let committed = false;
  let departurePose: { roll: string; tilt: string } | undefined;
  let removeAbortListener: (() => void) | undefined;
  root.dataset.vaultTransition = '';
  source.style.viewTransitionName = 'vault-cover';

  try {
    const transition = document.startViewTransition(() => {
      source.style.removeProperty('view-transition-name');
      if (reversal?.signal.aborted) return;
      const model = reversal && shelfBookParts(source);
      if (model) {
        departurePose = {
          roll: getComputedStyle(model.pose).transform,
          tilt: getComputedStyle(model.book).transform
        };
      }
      flushSync(update);
      committed = true;
      destination = findCover(to);
      if (destination) destination.style.viewTransitionName = 'vault-cover';
    });

    if (reversal) {
      let ready = false;
      void transition.ready.then(() => { ready = true; }, () => {});
      const reverse = () => {
        const animations = ready ? document.getAnimations().filter(({ effect, currentTime }) =>
          effect instanceof KeyframeEffect && effect.pseudoElement?.startsWith('::view-transition') && Number(currentTime) > 0
        ) : [];
        if (!animations.length) transition.skipTransition();
        for (const animation of animations) animation.reverse();
      };
      reversal.signal.addEventListener('abort', reverse, { once: true });
      removeAbortListener = () => reversal.signal.removeEventListener('abort', reverse);
    }

    await transition.finished;
  } finally {
    removeAbortListener?.();
    delete root.dataset.vaultTransition;
    source.style.removeProperty('view-transition-name');
    destination?.style.removeProperty('view-transition-name');
    if (committed && reversal?.signal.aborted) {
      flushSync(reversal.restore);
      const restored = departurePose && shelfBookParts(findCover(from));
      if (restored && departurePose) {
        // The snapshot can end in the hovered pose even though the live shelf remounts at rest.
        settleTransform(restored.pose, departurePose.roll);
        settleTransform(restored.book, departurePose.tilt);
      }
    }
  }
}

const shelfReturnMotion: Record<ShelfDisplayMode, { tilt: string; lift: number }> = {
  shelf: { tilt: 'rotateX(-8deg) rotateY(-16deg)', lift: 0 },
  stacked: { tilt: 'rotateX(-12deg) rotateY(-22deg)', lift: 18 },
  fan: { tilt: 'rotateX(-10deg) rotateY(-18deg)', lift: 32 },
  cascade: { tilt: 'rotateX(-24deg) rotateY(-20deg)', lift: 0 }
};

export async function moveBookToShelf(from: string, to: string, update: () => void, reduceMotion: boolean, mode: ShelfDisplayMode) {
  const source = findCover(from);
  if (reduceMotion || !source?.animate) {
    update();
    return;
  }

  const start = source.getBoundingClientRect();
  flushSync(update);

  const model = shelfBookParts(findCover(to));
  if (!model) return;
  const { book, pose } = model;
  const slot = book.closest<HTMLElement>('[data-shelf-slot]');
  const shelf = slot?.closest('main');
  const host = shelf?.parentElement;
  if (!slot || !shelf || !host) return;

  const landing = slot.getBoundingClientRect();
  if (!start.width || !start.height || !landing.width || !landing.height) return;

  // Fly the shelf's actual 3D faces in a separate layer so the shelf's overflow cannot clip them.
  const flight = document.createElement('div');
  flight.dataset.shelfReturnFlight = '';
  flight.inert = true;
  flight.setAttribute('aria-hidden', 'true');
  Object.assign(flight.style, { left: `${landing.left}px`, top: `${landing.top}px` });
  flight.style.setProperty('--shelf-book-width', getComputedStyle(book).width);

  const flyingPose = pose.cloneNode() as HTMLElement;
  const flyingBook = book.cloneNode(true) as HTMLElement;
  const flyingCover = flyingBook.querySelector<HTMLElement>('[data-cover]');
  if (!flyingCover) return;
  flyingBook.querySelectorAll('button').forEach(button => button.remove());
  flyingCover.removeAttribute('data-cover');
  flyingPose.append(flyingBook);
  flight.append(flyingPose);

  const landingRoll = getComputedStyle(pose).transform;
  const landingTilt = getComputedStyle(book).transform;
  const { tilt, lift } = shelfReturnMotion[mode];
  flyingPose.style.transform = 'none';
  flyingBook.style.transform = tilt;
  host.append(flight);

  // Match the visible cover at takeoff, including the perspective of its initial tilt.
  const projected = flyingCover.getBoundingClientRect();
  if (!projected.width || !projected.height) {
    flight.remove();
    return;
  }
  const scaleX = start.width / projected.width;
  const scaleY = start.height / projected.height;
  const startX = start.left - landing.left - (projected.left - landing.left) * scaleX;
  const startY = start.top - landing.top - (projected.top - landing.top) * scaleY;
  const startTransform = `translate(${startX}px, ${startY}px) scale(${scaleX}, ${scaleY})`;
  const landingTransform = 'translate(0px, 0px) scale(1, 1)';
  const arrival = 0.86;
  const ease = 'cubic-bezier(0.32, 0.1, 0.22, 1)';
  const timing: KeyframeAnimationOptions = { duration: 560, fill: 'both' };

  const wasInert = shelf.inert;
  shelf.inert = true;
  slot.dataset.shelfReturnTarget = '';

  const animations = [
    flight.animate([
      { transform: startTransform, translate: '0px 0px', opacity: 1, easing: ease },
      { offset: 0.38, translate: `0px ${-lift}px`, easing: 'ease-in-out' },
      { offset: arrival, transform: landingTransform, translate: '0px 0px', opacity: 1 },
      { transform: landingTransform, translate: '0px 0px', opacity: 0 }
    ], timing),
    flyingPose.animate([
      { transform: 'none', easing: ease },
      { offset: arrival, transform: landingRoll },
      { transform: landingRoll }
    ], timing),
    flyingBook.animate([
      { transform: tilt, easing: ease },
      { offset: arrival, transform: landingTilt },
      { transform: landingTilt }
    ], timing),
    slot.animate([{ opacity: 0 }, { offset: arrival, opacity: 0 }, { opacity: 1 }], timing),
    shelf.animate([{ opacity: 0.36 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' })
  ];
  const cancel = () => animations.forEach(animation => animation.cancel());
  window.addEventListener('resize', cancel, { once: true });

  try {
    await Promise.allSettled(animations.map(animation => animation.finished));
  } finally {
    window.removeEventListener('resize', cancel);
    flight.remove();
    slot.removeAttribute('data-shelf-return-target');
    shelf.inert = wasInert;
    cancel();
  }
}
