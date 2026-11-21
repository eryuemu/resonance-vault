import { flushSync } from 'react-dom';

function findCover(id: string) {
  return document.querySelector<HTMLElement>(`[data-cover="${CSS.escape(id)}"]`);
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
  let landingSlot: HTMLElement | null | undefined;
  let committed = false;
  let removeAbortListener: (() => void) | undefined;
  const departingSlot = reversal && source.closest<HTMLElement>('[data-shelf-slot]');
  root.dataset.vaultTransition = '';
  // The shelf snapshot can reappear during a reversal. Only the moving cover represents this book in it.
  departingSlot?.setAttribute('data-vault-departing-book', '');
  source.style.viewTransitionName = 'vault-cover';

  try {
    const transition = document.startViewTransition(() => {
      source.style.removeProperty('view-transition-name');
      if (reversal?.signal.aborted) return;
      flushSync(update);
      committed = true;
      const cover = findCover(to);
      const shelfLanding = from === 'folio-cover' ? cover?.parentElement?.querySelector<HTMLElement>('[data-shelf-landing]') : undefined;
      destination = shelfLanding ?? cover;

      // The invisible trigger supplies the endpoint while the real book stays in shelf depth order.
      if (shelfLanding) {
        landingSlot = shelfLanding.closest<HTMLElement>('[data-shelf-slot]');
        if (landingSlot) landingSlot.dataset.vaultLandingBook = 'waiting';
        root.dataset.vaultTransition = 'shelf-return';
      } else if (cover?.closest('[data-frame-window]')) {
        root.dataset.vaultTransition = 'frame-return';
      }

      if (destination) destination.style.viewTransitionName = 'vault-cover';
    });

    let ready = false;
    void transition.ready.then(() => {
      ready = true;
      if (landingSlot) landingSlot.dataset.vaultLandingBook = 'ready';
    }, () => {});
    if (reversal) {
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
    departingSlot?.removeAttribute('data-vault-departing-book');
    destination?.style.removeProperty('view-transition-name');
    landingSlot?.removeAttribute('data-vault-landing-book');
    if (committed && reversal?.signal.aborted) flushSync(reversal.restore);
  }
}

const bookReturnTiming = {
  duration: 540,
  easing: 'cubic-bezier(0.32, 0.1, 0.22, 1)',
  fill: 'both'
} satisfies KeyframeAnimationOptions;

function coverFinish(style: CSSStyleDeclaration): Keyframe {
  return { borderColor: style.borderColor, borderRadius: style.borderRadius, boxShadow: style.boxShadow };
}

export async function returnBookToShelf(from: string, to: string, update: () => void, reduceMotion: boolean) {
  const source = findCover(from);
  if (reduceMotion || !source?.animate) return moveCover(from, to, update, reduceMotion);

  const sourceBounds = source.getBoundingClientRect();
  const sourceStyle = getComputedStyle(source);
  const startSize = { width: sourceStyle.width, height: sourceStyle.height };
  const startFinish = coverFinish(sourceStyle);
  const startCaption = source.querySelector<HTMLElement>('.hardcover-caption')?.offsetTop;
  const folioStyle = getComputedStyle(source.closest('.folio')!);
  const startPitch = folioStyle.transform === 'none' ? '0deg' : folioStyle.getPropertyValue('--folio-tilt').trim();
  const startTransform = `rotateX(${startPitch}) rotateY(0deg)`;
  const toolbar = source.closest('main')?.querySelector<HTMLElement>('header');
  const toolbarBounds = toolbar?.getBoundingClientRect();
  const exitingToolbar = toolbar?.cloneNode(true) as HTMLElement | undefined;

  flushSync(update);
  const cover = findCover(to);
  const book = cover?.closest<HTMLElement>('.shelf-book');
  const pose = book?.parentElement;
  const slot = book?.closest<HTMLElement>('[data-shelf-slot]');
  const shelf = slot?.closest('main');
  if (!cover || !book || !pose || !slot || !shelf) return;

  const landingBounds = cover.getBoundingClientRect();
  const landingLayer = Number(getComputedStyle(slot).zIndex);
  const overlapsLanding = (item: HTMLElement) => {
    const front = item.querySelector('.shelf-book-cover');
    if (!front || Number(getComputedStyle(item).zIndex) <= landingLayer) return false;
    const bounds = front.getBoundingClientRect();
    return bounds.left < landingBounds.right && bounds.right > landingBounds.left &&
      bounds.top < landingBounds.bottom && bounds.bottom > landingBounds.top;
  };
  const shelfScene = Array.from(shelf.querySelectorAll<HTMLElement>('[data-shelf-return-scene], [data-shelf-slot]'))
    .filter((item) => item !== slot)
    .map((item) => ({ item, inFront: overlapsLanding(item), opacity: getComputedStyle(item).opacity }));
  const landingOpacity = getComputedStyle(slot).opacity;

  const poseStyle = getComputedStyle(pose);
  const landingRoll = poseStyle.transform;
  const [originX, originY] = poseStyle.transformOrigin.split(' ').map(parseFloat);
  const bookStyle = getComputedStyle(book);
  const landingBook = { width: bookStyle.width, height: bookStyle.height, transform: bookStyle.transform };
  const landingFinish = coverFinish(getComputedStyle(cover));
  const caption = cover.querySelector<HTMLElement>('.hardcover-caption');
  const landingCaption = caption?.offsetTop;
  const poseTransform = pose.style.transform;
  pose.style.transform = 'none';
  const rest = pose.getBoundingClientRect();
  pose.style.transform = poseTransform;

  // Move the real book within its own stacking layer, with its slot reserving the shelf layout.
  slot.style.minWidth = `${slot.offsetWidth}px`;
  slot.style.minHeight = `${slot.offsetHeight}px`;
  pose.style.left = `${rest.left}px`;
  pose.style.top = `${rest.top}px`;
  slot.setAttribute('data-vault-returning-book', '');
  const wasInert = shelf.inert;
  shelf.inert = true;
  const animations: Animation[] = [];
  const stop = () => animations.forEach((animation) => animation.cancel());

  try {
    // Match the projected hardcover before interpolating down to the shelf size and rotation.
    const measure = pose.animate({ transform: ['none', 'none'] }, { fill: 'both' });
    const measureBook = book.animate([{ ...startSize, transform: startTransform }], { fill: 'both' });
    measure.currentTime = measureBook.currentTime = 0;
    const origin = pose.getBoundingClientRect();
    const projected = cover.getBoundingClientRect();
    measure.cancel();
    measureBook.cancel();
    const pivotX = origin.left + originX;
    const pivotY = origin.top + originY;
    const scaleX = sourceBounds.width / projected.width;
    const scaleY = sourceBounds.height / projected.height;
    const x = sourceBounds.left - pivotX - (projected.left - pivotX) * scaleX;
    const y = sourceBounds.top - pivotY - (projected.top - pivotY) * scaleY;

    animations.push(pose.animate([
      { transform: 'none', translate: `${x}px ${y}px`, scale: `${scaleX} ${scaleY}` },
      { transform: landingRoll, translate: '0px 0px', scale: '1 1' }
    ], bookReturnTiming));
    animations.push(book.animate([{ ...startSize, transform: startTransform }, landingBook], bookReturnTiming));
    animations.push(cover.animate([startFinish, landingFinish], bookReturnTiming));
    if (landingOpacity !== '1') animations.push(slot.animate([{ opacity: 1 }, { opacity: landingOpacity }], bookReturnTiming));
    if (caption && startCaption !== undefined && landingCaption !== undefined) {
      animations.push(caption.animate([
        { top: `${startCaption}px`, bottom: 'auto' },
        { top: `${landingCaption}px`, bottom: 'auto' }
      ], bookReturnTiming));
    }

    const sceneTiming = { duration: 360, fill: 'both' } as const;
    for (const { item, inFront, opacity } of shelfScene) {
      // Reveal overlapping neighbors as the moving book slides behind them.
      animations.push(item.animate([
        { opacity: 0, offset: 0 }, { opacity: 0, offset: inFront ? 0.52 : 0.3, easing: 'ease' }, { opacity }
      ], { ...sceneTiming, duration: inFront ? 460 : 360 }));
    }
    const label = slot.querySelector<HTMLElement>('[data-shelf-book-caption]');
    if (label) animations.push(label.animate([
      { opacity: 0 }, { opacity: 0, offset: 0.88 }, { opacity: 1 }
    ], { ...bookReturnTiming, easing: 'linear' }));

    if (exitingToolbar && toolbarBounds) {
      Object.assign(exitingToolbar.style, {
        position: 'fixed', pointerEvents: 'none', zIndex: '1',
        left: `${toolbarBounds.left}px`, top: `${toolbarBounds.top}px`, width: `${toolbarBounds.width}px`
      });
      exitingToolbar.inert = true;
      exitingToolbar.setAttribute('aria-hidden', 'true');
      shelf.append(exitingToolbar);
      animations.push(exitingToolbar.animate([
        { opacity: 1, easing: 'ease' }, { opacity: 0, offset: 0.6 }, { opacity: 0 }
      ], sceneTiming));
    }

    window.addEventListener('resize', stop, { once: true });
    await Promise.allSettled(animations.map((animation) => animation.finished));
  } finally {
    window.removeEventListener('resize', stop);
    stop();
    exitingToolbar?.remove();
    shelf.inert = wasInert;
    slot.removeAttribute('data-vault-returning-book');
    slot.style.removeProperty('min-width');
    slot.style.removeProperty('min-height');
    pose.style.removeProperty('left');
    pose.style.removeProperty('top');
  }
}
