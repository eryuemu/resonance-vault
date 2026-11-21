import React, { useLayoutEffect, useState } from 'react';
import { motion, useSpring, useMotionValue, useMotionTemplate, useReducedMotion, useTransform, type MotionStyle } from 'framer-motion';
import { Play } from 'lucide-react';
import { Album, ShelfDisplayMode } from '../types';
import { HardcoverArtwork } from './HardcoverArtwork';
import type { useShelfDrag } from './useShelfDrag';

const stackRotations = [-6, 3, -3];
const poseTransform = (_: unknown, hoverTransform: string) => `${hoverTransform} rotateZ(var(--shelf-roll))`;

interface ThreeDimensionalBookProps {
  album: Album;
  displayMode: ShelfDisplayMode;
  index: number;
  total: number;
  offset: number;
  opacity: number;
  browsing: boolean;
  onOpen: () => void;
  onPlay: () => void;
  sortControls?: React.ReactNode;
  dragHandlers?: ReturnType<ReturnType<typeof useShelfDrag>['handle']>;
  dropClass: string;
}

export const ThreeDimensionalBook: React.FC<ThreeDimensionalBookProps> = ({
  album,
  displayMode,
  index,
  total,
  offset,
  opacity,
  browsing,
  onOpen,
  onPlay,
  sortControls,
  dragHandlers,
  dropClass
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showQuickPlay, setShowQuickPlay] = useState(false);
  const reduceMotion = useReducedMotion();
  const stacked = displayMode === 'stacked';
  const fan = displayMode === 'fan';
  const cascade = displayMode === 'cascade';
  const overlapping = displayMode !== 'shelf';

  // Mouse tilt physics with spring smoothing
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x, { stiffness: 220, damping: 20 });
  const mouseYSpring = useSpring(y, { stiffness: 220, damping: 20 });

  const baseRestingRotateX = cascade ? -30 : overlapping ? 4 : 0;
  const shelfRotateY = index === 0 ? -9 : index === total - 1 ? -4 : -6;
  const baseRestingRotateY = cascade ? -6 + offset * 3 : stacked ? -12 : fan ? -10 : shelfRotateY;
  const hovering = isHovered && !reduceMotion && !browsing;
  const pointerTilt = overlapping ? (hovering && !stacked ? 0.35 : 0) : 1;
  const restingRotateX = useSpring(baseRestingRotateX, { stiffness: 170, damping: 24 });
  const restingRotateY = useSpring(baseRestingRotateY, { stiffness: 170, damping: 24 });
  const tiltStrength = useSpring(pointerTilt, { stiffness: 170, damping: 24 });
  useLayoutEffect(() => {
    if (reduceMotion) {
      restingRotateX.jump(baseRestingRotateX);
      restingRotateY.jump(baseRestingRotateY);
      tiltStrength.jump(pointerTilt);
    } else {
      restingRotateX.set(baseRestingRotateX);
      restingRotateY.set(baseRestingRotateY);
      tiltStrength.set(pointerTilt);
    }
  }, [baseRestingRotateX, baseRestingRotateY, pointerTilt, reduceMotion, restingRotateX, restingRotateY, tiltStrength]);

  // 3D rotations based on cursor
  const rotateX = useTransform(() => restingRotateX.get() - mouseYSpring.get() * tiltStrength.get() * 20);
  const rotateY = useTransform(() => restingRotateY.get() + mouseXSpring.get() * tiltStrength.get() * 28);

  // Dynamic light glare position
  const glareX = useTransform(mouseXSpring, [-0.5, 0.5], ['0%', '100%']);
  const glareY = useTransform(mouseYSpring, [-0.5, 0.5], ['0%', '100%']);
  const glare = useMotionTemplate`radial-gradient(ellipse at ${glareX} ${glareY}, rgb(255 236 190 / 0.26), transparent 62%)`;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || reduceMotion || browsing) return;
    if (!isHovered) setIsHovered(true);
    if (stacked) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    x.set(mouseX / rect.width - 0.5);
    y.set(mouseY / rect.height - 0.5);
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
    x.set(0);
    y.set(0);
  };

  const fanAngle = offset * 12;
  const radians = fanAngle * Math.PI / 180;
  const stackAngle = stacked ? stackRotations[index % stackRotations.length] : 0;
  const rotation = fan ? fanAngle : cascade ? offset * 3 : stackAngle;

  // Keep the same cover in front when the same group opens into a fan or folds into a stack.
  const overlappingLayer = Math.round(1000 - Math.abs(offset - 0.04) * 100);
  const bookLayer = fan || stacked ? overlappingLayer + (stacked && hovering ? 1000 : 0)
    : cascade ? total - index : (hovering ? total : 0) + index + 1;
  const faint = opacity < 0.2;

  const slotStyle = {
    '--book-layer': bookLayer,
    '--shelf-offset': overlapping ? offset : undefined,
    '--fan-x': fan ? Math.sin(radians) : undefined,
    '--fan-y': fan ? 1 - Math.cos(radians) : undefined,
    opacity: opacity === 1 ? undefined : opacity
  } as React.CSSProperties;

  return (
    <motion.div
      initial={false}
      layout={sortControls && !reduceMotion ? 'position' : false}
      data-shelf-slot={album.id}
      data-sort-album={sortControls ? album.id : undefined}
      data-fan-book={fan || undefined}
      data-stacked-book={stacked || undefined}
      data-cascade-book={cascade || undefined}
      data-shelf-faint={faint || undefined}
      style={slotStyle}
      className={`shelf-book-slot relative flex shrink-0 flex-col items-center select-none ${dropClass} ${overlapping ? 'col-start-1 row-start-1' : ''}`}
    >
      <motion.div
        initial={false}
        data-shelf-pose
        style={{ perspective: 1200, '--shelf-roll': `${rotation}deg` } as MotionStyle}
        transformTemplate={poseTransform}
        animate={{
          rotate: hovering ? -stackAngle : 0,
          y: hovering ? (fan ? -22 : overlapping ? -15 : -10) : 0,
          scale: hovering ? (fan ? 1.03 : overlapping ? 1.02 : 1) : 1
        }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: fan || cascade ? 28 : 30 }}
      >
        <motion.div
          onPointerMove={dragHandlers ? undefined : handlePointerMove}
          onPointerEnter={(event) => {
            if (event.pointerType !== 'touch') setShowQuickPlay(true);
          }}
          onPointerLeave={() => {
            setShowQuickPlay(false);
            handlePointerLeave();
          }}
          style={{
            rotateX: reduceMotion ? baseRestingRotateX : rotateX,
            rotateY: reduceMotion ? baseRestingRotateY : rotateY,
            transformStyle: 'preserve-3d'
          }}
          data-drag-surface
          className={`shelf-book ${dragHandlers ? 'touch-none cursor-grab active:cursor-grabbing' : ''}`}
          data-show-quick-play={(showQuickPlay && !browsing) || undefined}
          {...dragHandlers}
        >
          <div className="shelf-book-back" aria-hidden="true" />
          <div className="shelf-book-paper" aria-hidden="true" />
          <div className="shelf-book-fore-edge" aria-hidden="true" />
          <div className="shelf-book-head-edge" aria-hidden="true" />
          <div className="shelf-book-spine" aria-hidden="true" />

          <div className="shelf-book-cover" data-cover={`shelf-${album.id}`}>
            <HardcoverArtwork
              album={album}
              lit={hovering}
              sheen={
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: glare,
                    opacity: hovering ? 1 : 0.1,
                    transition: 'opacity 0.25s'
                  }}
                />
              }
            />
          </div>

          {!sortControls && (
            <>
              <button
                type="button"
                className="shelf-book-trigger"
                data-shelf-landing
                tabIndex={faint ? -1 : undefined}
                aria-label={`翻开《${album.title}》`}
                onClick={onOpen}
              />
              <button type="button" tabIndex={faint ? -1 : undefined} onClick={(event) => {
                if (event.detail > 0) event.currentTarget.blur();
                onPlay();
              }} aria-label={`播放《${album.title}》`}
                title="直接播放" className="shelf-quick-play absolute bottom-3 right-3 grid h-10 w-10 place-items-center rounded-full border border-white/40 bg-black/85 text-white transition-opacity hover:border-[#e2bd77] hover:text-[#e2bd77]">
                <Play className="ml-0.5 h-4 w-4 fill-current" aria-hidden="true" />
              </button>
            </>
          )}
        </motion.div>
      </motion.div>

      {!overlapping && (
        <div data-shelf-book-caption className="mt-5 flex h-10 items-center justify-center">
          {sortControls ?? <span className="max-w-48 truncate text-sm opacity-75">{album.artist}</span>}
        </div>
      )}
    </motion.div>
  );
};
