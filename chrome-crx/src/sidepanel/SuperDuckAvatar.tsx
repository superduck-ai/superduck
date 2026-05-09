import React, { useEffect, useRef, useState, useCallback, useReducer } from 'react';
import type { Animations } from './superduck-animations';

// Static Duck logo SVG (fallback)
function DuckLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      className={className}
    >
      {/* Right Leg */}
      <path d="M 110 140 L 110 175 L 125 185 L 115 188 L 100 188 L 95 182 L 102 175 L 102 140 Z" fill="#F48C06" stroke="#2D3142" strokeWidth="4" strokeLinejoin="round" />
      {/* Left Leg */}
      <path d="M 85 140 L 85 175 L 100 185 L 90 188 L 75 188 L 70 182 L 77 175 L 77 140 Z" fill="#F48C06" stroke="#2D3142" strokeWidth="4" strokeLinejoin="round" />
      {/* Tail */}
      <path d="M 40 102 L 15 90 L 25 108 L 10 115 L 25 125 Z" fill="#1A1A1A" stroke="#2D3142" strokeWidth="4" strokeLinejoin="round" />
      {/* Body Base */}
      <path d="M 25 115 C 40 150, 90 170, 130 150 C 155 135, 165 110, 145 80 L 115 80 C 100 95, 60 105, 25 115 Z" fill="#E5E7E9" stroke="#2D3142" strokeWidth="4" strokeLinejoin="round" />
      {/* Chest */}
      <path d="M 115 80 L 145 80 C 165 110, 155 135, 130 150 C 110 130, 105 100, 115 80 Z" fill="#8D6A58" stroke="#2D3142" strokeWidth="4" strokeLinejoin="round" />
      {/* Wing */}
      <path d="M 50 115 C 70 105, 110 105, 130 120 C 110 145, 60 145, 50 115 Z" fill="#BEC3C6" stroke="#2D3142" strokeWidth="4" strokeLinejoin="round" />
      <path d="M 63 122 L 112 122 L 102 138 L 58 138 Z" fill="#FFFFFF" stroke="#2D3142" strokeWidth="3" strokeLinejoin="round" />
      <path d="M 66 125 L 109 125 L 101 135 L 61 135 Z" fill="#2B5A9B" stroke="#2D3142" strokeWidth="3" strokeLinejoin="round" />
      {/* Neck Ring */}
      <path d="M 115 80 Q 130 88 145 80 L 143 70 Q 130 78 117 70 Z" fill="#FFFFFF" stroke="#2D3142" strokeWidth="4" strokeLinejoin="round" />
      {/* Head */}
      <path d="M 117 70 C 100 50, 105 20, 130 20 C 150 20, 155 45, 143 70 Q 130 78 117 70 Z" fill="#388E3C" stroke="#2D3142" strokeWidth="4" strokeLinejoin="round" />
      {/* Eye */}
      <circle cx="132" cy="38" r="4" fill="#1A1A1A" />
      <circle cx="131" cy="37" r="1.5" fill="#FFFFFF" />
      {/* Lower Beak */}
      <path d="M 146 51 C 160 51, 175 52, 182 53 C 170 56, 150 56, 144 56 Z" fill="#F4B41A" stroke="#2D3142" strokeWidth="4" strokeLinejoin="round" />
      {/* Upper Beak */}
      <path d="M 144 42 C 160 42, 180 44, 186 48 C 187 49, 182 51, 146 51 Z" fill="#F4B41A" stroke="#2D3142" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

export type AvatarState = 'static' | 'thinking' | 'writing' | 'shimmer' | 'tickle';

interface SuperDuckAvatarProps {
  state?: AvatarState;
  className?: string;
  isInteractive?: boolean;
}

export function SuperDuckAvatar({
  state = 'static',
  className = '',
  isInteractive = true,
}: SuperDuckAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousStateRef = useRef<AvatarState>(state);
  const [animations, setAnimations] = useState<Animations | null>(null);
  const [currentState, setCurrentState] = useState<AvatarState>(state);
  const [clickCount, incrementClickCount] = useReducer((x) => x + 1, 0);

  // Load animations data
  useEffect(() => {
    import('./superduck-animations').then((module) => {
      setAnimations(module.animations);
    });
  }, []);

  // Update state when prop changes
  useEffect(() => {
    setCurrentState(state);
  }, [state]);

  // Handle animation
  useEffect(() => {
    const element = containerRef.current;
    const canAnimate = element && typeof element.animate === 'function';

    let animation: Animation | undefined;
    let finishHandler: (() => void) | undefined;

    if (!animations || currentState === 'static' || !canAnimate) {
      return;
    }

    const animData = animations[currentState];
    if (!animData) return;

    const { frameCount, speed } = animData;

    // Create keyframes for translateY animation
    const keyframes = Array.from({ length: frameCount }, (_, i) => ({
      transform: `translateY(-${(i * 100) / frameCount}%)`,
    }));

    // Start animation
    animation = element.animate(keyframes, {
      duration: speed * keyframes.length,
      iterations: currentState === 'tickle' ? 1 : Infinity,
      easing: `steps(${keyframes.length}, jump-none)`,
    });

    // Handle tickle animation finish
    if (currentState === 'tickle') {
      finishHandler = () => setCurrentState(previousStateRef.current);
      animation.addEventListener('finish', finishHandler);
    }

    // Save current state (except tickle)
    if (currentState !== 'tickle') {
      previousStateRef.current = currentState;
    }

    return () => {
      if (finishHandler && animation) {
        animation.removeEventListener('finish', finishHandler);
      }
      animation?.cancel();
    };
  }, [animations, currentState]);

  // Handle click interaction
  const handleClick = useCallback(() => {
    if (!isInteractive) return;
    if (currentState === 'writing' || currentState === 'thinking' || currentState === 'tickle') {
      return;
    }
    setCurrentState('tickle');
    incrementClickCount();
  }, [isInteractive, currentState]);

  // Tooltip message based on click count
  let tooltipMessage = "Hi, I'm SuperDuck. How can I help you today?";
  if (clickCount < 32 && clickCount > 24) {
    tooltipMessage = "Ugh, well you can't do that forever";
  } else if (clickCount <= 24 && clickCount > 18) {
    tooltipMessage = "Alright, alright, you have my attention!";
  } else if (clickCount <= 18 && clickCount > 12) {
    tooltipMessage = "Are you still doing that?";
  } else if (clickCount <= 12 && clickCount > 5) {
    tooltipMessage = "Yes, yes. What can I do for you?";
  }

  const hideTooltip =
    !isInteractive || currentState === 'writing' || currentState === 'thinking';

  // Render static logo if no animations loaded or static state
  if (currentState === 'static' || !animations) {
    return (
      <div
        aria-hidden="true"
        title={!hideTooltip ? tooltipMessage : undefined}
        className="inline-block"
      >
        <div
          className={`w-8 text-accent-brand inline-block select-none ${className}`}
          onMouseDown={handleClick}
        >
          <DuckLogo className="w-full" />
        </div>
      </div>
    );
  }

  // Render animated avatar
  const animData = animations[currentState];
  const aspectRatio = animData.width / animData.height;

  return (
    <div
      aria-hidden="true"
      title={!hideTooltip ? tooltipMessage : undefined}
      className="inline-block"
    >
      <div
        className={`w-8 text-accent-brand inline-block overflow-hidden select-none ${className}`}
        style={{ aspectRatio }}
        onMouseDown={handleClick}
      >
        <div
          ref={containerRef}
          className="[&>svg]:block [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: animData.svg }}
        />
      </div>
    </div>
  );
}
