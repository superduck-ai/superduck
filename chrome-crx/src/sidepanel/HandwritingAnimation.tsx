import React, { useEffect, useRef, useState } from 'react';
import glyphData from './assets/satisfy/glyphData.json';
import satisfyFontUrl from './assets/satisfy/satisfy.ttf?url';

type StrokePoint = [number, number, number];
type Stroke = { p: StrokePoint[]; d: number; a: number };
type Glyph = { w: number; t: number; s: Stroke[] };

function normalizeGlyphs(data: typeof glyphData): Record<string, Glyph> {
  return Object.fromEntries(
    Object.entries(data).map(([key, glyph]) => [
      key,
      {
        w: glyph.w,
        t: glyph.t,
        s: glyph.s.map((stroke) => ({
          d: stroke.d,
          a: stroke.a,
          p: stroke.p.map((point): StrokePoint => [point[0], point[1], point[2]])
        }))
      }
    ])
  );
}

const GLYPHS = normalizeGlyphs(glyphData);
const UNITS_PER_EM = 1024;
const ASCENDER = 957;

let fontFaceInjected = false;
function ensureFontFace() {
  if (fontFaceInjected) return;
  fontFaceInjected = true;
  const style = document.createElement('style');
  style.textContent = `@font-face { font-family: 'Satisfy'; src: url(${satisfyFontUrl}); font-display: swap; }`;
  document.head.appendChild(style);
  if (document.fonts?.load) {
    void document.fonts.load(`16px Satisfy`).catch(() => {});
  }
}

interface Props {
  text?: string;
  fontSize?: number;
  color?: string;
  speed?: number; // multiplier on glyph durations
  className?: string;
  maxWidth?: number; // shrink fontSize so glyph row fits within this
}

export const HandwritingAnimation: React.FC<Props> = ({
  text = 'SuperDuck',
  fontSize: requestedFontSize = 96,
  color = 'currentColor',
  speed = 1,
  className,
  maxWidth,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasPlayedRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Track container width so the canvas re-fits when the sidepanel is resized.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      setContainerWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    ensureFontFace();
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const chars = Array.from(text).filter((c) => GLYPHS[c]);
    if (chars.length === 0) return;

    const totalAdvanceUnits = chars.reduce((sum, c) => sum + GLYPHS[c].w, 0);
    const availWidth = maxWidth ?? containerWidth ?? requestedFontSize * 6;
    if (!availWidth) return;
    const padFactor = 0.4; // matches widthPx padding below
    // widthPx = totalAdvance * scale + fontSize * padFactor; scale = fontSize/UNITS_PER_EM
    // → fontSize * (totalAdvance/UNITS_PER_EM + padFactor) <= availWidth
    const maxFitFontSize = availWidth / (totalAdvanceUnits / UNITS_PER_EM + padFactor);
    const fontSize = Math.max(24, Math.min(requestedFontSize, Math.floor(maxFitFontSize)));

    const scale = fontSize / UNITS_PER_EM;
    const totalAdvance = totalAdvanceUnits;
    const widthPx = Math.ceil(totalAdvance * scale) + fontSize * padFactor;
    const heightPx = Math.ceil(fontSize * 1.4);

    // Per-glyph absolute timing (ms)
    const glyphTimings: { startMs: number; durMs: number; offsetX: number; glyph: Glyph }[] = [];
    let cursor = fontSize * 0.2;
    let timeCursor = 0;
    const PAUSE_BETWEEN_MS = 80;
    for (const c of chars) {
      const g = GLYPHS[c];
      const durMs = g.t * 1000 * (1 / speed);
      glyphTimings.push({ startMs: timeCursor, durMs, offsetX: cursor, glyph: g });
      timeCursor += durMs + PAUSE_BETWEEN_MS;
      cursor += g.w * scale;
    }
    const totalMs = timeCursor;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(widthPx * dpr);
    canvas.height = Math.floor(heightPx * dpr);
    canvas.style.width = `${widthPx}px`;
    canvas.style.height = `${heightPx}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const context = ctx;
    context.scale(dpr, dpr);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const resolvedColor =
      color === 'currentColor' ? getComputedStyle(container).color : color;
    context.strokeStyle = resolvedColor;

    const baselineY = fontSize * 1.05;

    function transform(x: number, y: number, offsetX: number): [number, number] {
      return [offsetX + x * scale, baselineY + y * scale];
    }

    function pressureToWidth(pressure: number): number {
      const norm = Math.min(1, Math.max(0, pressure / 130));
      return (1.6 + norm * 4.0) * (fontSize / 96);
    }

    function drawStrokeUpTo(stroke: Stroke, offsetX: number, t: number) {
      // t in [0, 1] — fraction of this stroke completed
      const points = stroke.p;
      if (points.length < 2 || t <= 0) return;
      const targetIdx = (points.length - 1) * t;
      const lastFull = Math.floor(targetIdx);
      const frac = targetIdx - lastFull;

      for (let i = 0; i < lastFull; i++) {
        const a = points[i];
        const b = points[i + 1];
        const [ax, ay] = transform(a[0], a[1], offsetX);
        const [bx, by] = transform(b[0], b[1], offsetX);
        context.lineWidth = pressureToWidth((a[2] + b[2]) / 2);
        context.beginPath();
        context.moveTo(ax, ay);
        context.lineTo(bx, by);
        context.stroke();
      }
      // Partial trailing segment, lerp endpoint by frac
      if (lastFull < points.length - 1 && frac > 0) {
        const a = points[lastFull];
        const b = points[lastFull + 1];
        const [ax, ay] = transform(a[0], a[1], offsetX);
        const [bx, by] = transform(b[0], b[1], offsetX);
        const px = ax + (bx - ax) * frac;
        const py = ay + (by - ay) * frac;
        context.lineWidth = pressureToWidth(a[2] + (b[2] - a[2]) * frac);
        context.beginPath();
        context.moveTo(ax, ay);
        context.lineTo(px, py);
        context.stroke();
      }
    }

    let raf = 0;
    let startTime = 0;
    let cancelled = false;

    // After the first play, resize-driven re-runs redraw the final frame
    // statically instead of replaying the stroke animation.
    if (hasPlayedRef.current) {
      for (const gt of glyphTimings) {
        for (const stroke of gt.glyph.s) {
          drawStrokeUpTo(stroke, gt.offsetX, 1);
        }
      }
      return () => {};
    }

    function frame(now: number) {
      if (cancelled) return;
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      context.clearRect(0, 0, widthPx, heightPx);

      for (const gt of glyphTimings) {
        if (elapsed < gt.startMs) break;
        const localElapsed = elapsed - gt.startMs;
        const totalGlyphDurMs = gt.durMs;
        for (const stroke of gt.glyph.s) {
          const strokeStartMs = stroke.d * totalGlyphDurMs;
          const strokeDurMs = stroke.a * totalGlyphDurMs;
          if (localElapsed < strokeStartMs) continue;
          const strokeElapsed = localElapsed - strokeStartMs;
          const t = strokeDurMs > 0 ? Math.min(1, strokeElapsed / strokeDurMs) : 1;
          drawStrokeUpTo(stroke, gt.offsetX, t);
        }
      }

      if (elapsed < totalMs) {
        raf = requestAnimationFrame(frame);
      } else {
        hasPlayedRef.current = true;
      }
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [text, requestedFontSize, color, speed, maxWidth, containerWidth]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color, width: '100%' }}
    >
      <canvas ref={canvasRef} aria-label={text} role="img" />
    </div>
  );
};

export default HandwritingAnimation;
