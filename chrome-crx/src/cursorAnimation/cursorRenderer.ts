import type {
  Vec2,
  Rect,
  CursorState,
  CursorAction,
  BezierMotion,
  ScootMotion,
  SpringConfig
} from './types';
import { CLICK_ANGLE_DEG } from './types';
import {
  createSpring,
  snapSpring,
  advanceSpring,
  isSpringSettled,
  setSpringTargetAngle,
  wrapAngle,
  wrapAngleDelta
} from './spring';
import {
  planPath,
  samplePathPoint,
  samplePathTangent,
  tangentToAngle,
  computePathSpringConfig,
  dist
} from './bezierPath';

const CURSOR_SIZE = 24;
const HALF = CURSOR_SIZE / 2;
const PATH_THRESHOLD = 196;
const ARRIVAL_DIST = 0.85;
const ARRIVAL_VEL = 12;
const SAFETY_TIMEOUT_MS = 2000;
const FRAME_DT = 1 / 60;

const DEFAULT_X_RATIO = 0.58;
const DEFAULT_Y_RATIO = 0.55;

const THINK_RAMP_DURATION = 1.41;
const THINK_OSC_PERIOD = 0.66;
const THINK_AMPLITUDE = 12.5;

const SPRING_POS: SpringConfig = { response: 0.19, dampingFraction: 0.9 };
const SPRING_ROTATION: SpringConfig = { response: 0.12, dampingFraction: 0.9 };
const SPRING_STRETCH: SpringConfig = { response: 0.2, dampingFraction: 0.85 };
const SPRING_VISIBILITY: SpringConfig = { response: 0.42, dampingFraction: 0.86 };
const SPRING_SCOOT_AXIS: SpringConfig = { response: 0.12, dampingFraction: 0.9 };
const SPRING_SCOOT_STRETCH: SpringConfig = { response: 0.12, dampingFraction: 0.86 };
const SPRING_SCOOT_ROTATION: SpringConfig = { response: 0.055, dampingFraction: 0.82 };
const SPRING_SCOOT_PROGRESS: SpringConfig = { response: 0.19, dampingFraction: 0.94 };

export class CursorRenderer {
  private layerEl: HTMLDivElement | null = null;
  private cursorEl: HTMLDivElement | null = null;
  private state: CursorState | null = null;
  private rafId: number | null = null;
  private lastTimestamp = 0;
  private firstMove = true;
  private pendingResolve: (() => void) | null = null;
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;
  private cursorAssetUrl: string | null = null;

  constructor() {
    try {
      this.cursorAssetUrl = chrome.runtime.getURL('cursor-chat.png');
    } catch {
      this.cursorAssetUrl = null;
    }
  }

  animateTo(x: number, y: number, action: CursorAction | string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.cancelPending();
      this.ensureAttached();

      const target: Vec2 = { x, y };
      const state = this.state!;

      if (this.firstMove) {
        this.firstMove = false;
        this.teleportTo(state, target);
        state.visibilitySpring.target = 1;
        this.render(state);
        this.startLoop();
        this.handleArrival(state, action, resolve);
        return;
      }

      snapSpring(state.visibilitySpring, state.visibilitySpring.value);
      state.visibilitySpring.target = 1;
      state.thinkStartedAt = null;

      const d = dist(state.point, target);
      if (d < 0.5) {
        this.handleArrival(state, action, resolve);
        return;
      }

      this.pendingResolve = () => this.handleArrival(state, action, resolve);
      this.safetyTimer = setTimeout(() => {
        this.resolvePending();
      }, SAFETY_TIMEOUT_MS);

      if (d > PATH_THRESHOLD) {
        this.startBezierMotion(state, target);
      } else {
        this.startScootMotion(state, target);
      }

      this.startLoop();
    });
  }

  hide(): void {
    this.cancelPending();
    this.stopLoop();
    this.removeDOM();
    this.state = null;
    this.firstMove = true;
    this.sweepRipples();
  }

  detachFromDOM(): void {
    if (this.layerEl?.parentNode) {
      this.layerEl.parentNode.removeChild(this.layerEl);
    }
    this.sweepRipples();
  }

  reattachToDOM(): void {
    if (this.layerEl && !this.layerEl.parentNode) {
      document.body.appendChild(this.layerEl);
    }
  }

  showIdle(): void {
    if (this.state && !this.firstMove) return;
    this.ensureAttached();
    const state = this.state!;
    const bounds = this.getViewportBounds();
    const defaultPos: Vec2 = {
      x: Math.round(bounds.width * DEFAULT_X_RATIO),
      y: Math.round(bounds.height * DEFAULT_Y_RATIO)
    };
    this.teleportTo(state, defaultPos);
    snapSpring(state.visibilitySpring, 0);
    state.visibilitySpring.target = 1;
    state.thinkStartedAt = now();
    this.firstMove = false;
    this.render(state);
    this.startLoop();
  }

  // --- DOM ---

  private ensureAttached(): void {
    if (!this.layerEl) {
      this.createDOM();
    }
    if (this.layerEl && !this.layerEl.parentNode) {
      document.body.appendChild(this.layerEl);
    }
    if (!this.state) {
      this.state = this.createInitialState();
    }
  }

  private createDOM(): void {
    const layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.id = 'superduck-agent-cursor-layer';
    Object.assign(layer.style, {
      position: 'fixed',
      inset: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: '2147483646'
    });

    const cursor = document.createElement('div');
    cursor.id = 'superduck-agent-cursor';
    Object.assign(cursor.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${CURSOR_SIZE}px`,
      height: `${CURSOR_SIZE}px`,
      transformOrigin: `${HALF}px ${HALF}px`,
      willChange: 'transform',
      pointerEvents: 'none'
    });

    const offset = document.createElement('div');
    Object.assign(offset.style, {
      transform: 'translate3d(12px, -2.5px, 0)'
    });

    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.width = 23;
    img.height = 24;
    if (this.cursorAssetUrl) {
      img.src = this.cursorAssetUrl;
    }
    Object.assign(img.style, {
      display: 'block',
      transform: 'rotate(44deg) scale(1)',
      transformOrigin: '0 0'
    });

    offset.appendChild(img);
    cursor.appendChild(offset);
    layer.appendChild(cursor);

    this.layerEl = layer;
    this.cursorEl = cursor;
  }

  private removeDOM(): void {
    if (this.layerEl?.parentNode) {
      this.layerEl.parentNode.removeChild(this.layerEl);
    }
    this.layerEl = null;
    this.cursorEl = null;
  }

  private sweepRipples(): void {
    document.querySelectorAll('.superduck-cursor-ripple').forEach((el) => el.remove());
  }

  // --- State ---

  private createInitialState(): CursorState {
    const r = wrapAngle(CLICK_ANGLE_DEG);
    return {
      point: { x: 0, y: 0 },
      rotation: r,
      scootAxisRotation: 0,
      motion: null,
      thinkStartedAt: null,
      positionXSpring: createSpring(0, 0, SPRING_POS),
      positionYSpring: createSpring(0, 0, SPRING_POS),
      rotationSpring: createSpring(r, r, SPRING_ROTATION),
      stretchSpring: createSpring(1, 1, SPRING_STRETCH),
      visibilitySpring: createSpring(0, 0, SPRING_VISIBILITY),
      scootAxisSpring: createSpring(0, 0, SPRING_SCOOT_AXIS),
      scootStretchSpring: createSpring(1, 1, SPRING_SCOOT_STRETCH),
      scootRotationSpring: createSpring(0, 0, SPRING_SCOOT_ROTATION)
    };
  }

  private teleportTo(state: CursorState, pt: Vec2): void {
    state.point = { ...pt };
    state.motion = null;
    snapSpring(state.positionXSpring, pt.x);
    snapSpring(state.positionYSpring, pt.y);
    snapSpring(state.rotationSpring, wrapAngle(CLICK_ANGLE_DEG));
    state.rotation = state.rotationSpring.value;
    this.resetScoot(state);
    snapSpring(state.stretchSpring, 1);
  }

  private resetScoot(state: CursorState): void {
    snapSpring(state.scootAxisSpring, 0);
    snapSpring(state.scootRotationSpring, 0);
    snapSpring(state.scootStretchSpring, 1);
    state.scootAxisRotation = 0;
  }

  // --- Motion modes ---

  private startBezierMotion(state: CursorState, target: Vec2): void {
    const bounds = this.getViewportBounds();
    const path = planPath(state.point, target, bounds);
    const springCfg = computePathSpringConfig(path);

    const posResponse = clamp(springCfg.response * 0.18, 0.035, 0.12);
    this.setPositionSpringConfig(state, posResponse, springCfg.dampingFraction);

    state.motion = {
      mode: 'bezier',
      path,
      progressSpring: createSpring(0, 1, springCfg)
    } satisfies BezierMotion;

    state.thinkStartedAt = null;
  }

  private startScootMotion(state: CursorState, target: Vec2): void {
    const start = { ...state.point };
    const delta = { x: target.x - start.x, y: target.y - start.y };
    const len = dist(start, target);
    const dir = len < 0.001 ? { x: 1, y: 0 } : { x: delta.x / len, y: delta.y / len };

    const axisRotation = Math.atan2(dir.y, dir.x) * (180 / Math.PI);
    const rotTarget = clamp(dir.x * 0.75 + -dir.y * 0.62, -1, 1) * 70;

    this.setPositionSpringConfig(state, SPRING_POS.response, SPRING_POS.dampingFraction);
    state.positionXSpring.target = target.x;
    state.positionYSpring.target = target.y;
    setSpringTargetAngle(state.rotationSpring, wrapAngle(CLICK_ANGLE_DEG));
    setSpringTargetAngle(state.scootAxisSpring, axisRotation);

    state.motion = {
      mode: 'scoot',
      start,
      end: target,
      axisRotation,
      rotationTarget: rotTarget,
      progressSpring: createSpring(0, 1, SPRING_SCOOT_PROGRESS)
    } satisfies ScootMotion;

    state.thinkStartedAt = null;
  }

  private setPositionSpringConfig(state: CursorState, response: number, damping: number): void {
    state.positionXSpring.response = response;
    state.positionYSpring.response = response;
    state.positionXSpring.dampingFraction = damping;
    state.positionYSpring.dampingFraction = damping;
  }

  // --- Animation loop ---

  private startLoop(): void {
    if (this.rafId !== null) return;
    this.lastTimestamp = now();
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick(timestamp: number): void {
    this.rafId = null;
    const state = this.state;
    if (!state || !this.cursorEl) return;

    const elapsed =
      this.lastTimestamp === 0
        ? FRAME_DT
        : Math.max(FRAME_DT, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;

    const arrived = this.advanceMotion(state, elapsed);

    advanceSpring(state.visibilitySpring, elapsed);
    advanceSpring(state.stretchSpring, elapsed);
    advanceSpring(state.scootStretchSpring, elapsed);
    advanceSpring(state.scootRotationSpring, elapsed);

    this.render(state);

    if (arrived) {
      this.resolvePending();
      state.thinkStartedAt = now();
    }

    if (this.isAnimating(state)) {
      this.rafId = requestAnimationFrame((ts) => this.tick(ts));
    }
  }

  private advanceMotion(state: CursorState, dt: number): boolean {
    if (!state.motion) {
      state.stretchSpring.target = 1;
      state.scootStretchSpring.target = 1;
      state.scootRotationSpring.target = 0;
      return false;
    }

    if (state.motion.mode === 'bezier') {
      return this.advanceBezier(state, state.motion, dt);
    }
    return this.advanceScoot(state, state.motion, dt);
  }

  private advanceBezier(state: CursorState, motion: BezierMotion, dt: number): boolean {
    state.scootStretchSpring.target = 1;
    state.scootRotationSpring.target = 0;

    advanceSpring(motion.progressSpring, dt);
    const progress = clamp(motion.progressSpring.value, 0, 1);

    const pt = samplePathPoint(motion.path, progress);
    const tangent = samplePathTangent(motion.path, progress);
    const angle = tangentToAngle(tangent);

    state.positionXSpring.target = pt.x;
    state.positionYSpring.target = pt.y;
    setSpringTargetAngle(state.rotationSpring, angle);
    setSpringTargetAngle(state.scootAxisSpring, 0);

    const { point, speed } = this.advancePositionSprings(state, dt);
    state.stretchSpring.target = computeStretchFromSpeed(speed);

    if (
      progress >= 0.999 &&
      Math.abs(motion.progressSpring.velocity) < 0.01 &&
      this.isNearTarget(state, pt)
    ) {
      const finalPt = samplePathPoint(motion.path, 1);
      const finalTangent = samplePathTangent(motion.path, 1);
      const finalAngle = tangentToAngle(finalTangent);
      this.snapToPoint(state, finalPt);
      snapSpring(state.rotationSpring, finalAngle);
      state.rotation = finalAngle;
      snapSpring(state.scootAxisSpring, 0);
      state.scootAxisRotation = 0;
      snapSpring(state.stretchSpring, 1);
      state.motion = null;
      return true;
    }
    return false;
  }

  private advanceScoot(state: CursorState, motion: ScootMotion, dt: number): boolean {
    advanceSpring(motion.progressSpring, dt);
    state.positionXSpring.target = motion.end.x;
    state.positionYSpring.target = motion.end.y;
    setSpringTargetAngle(state.scootAxisSpring, motion.axisRotation);
    setSpringTargetAngle(state.rotationSpring, wrapAngle(CLICK_ANGLE_DEG));

    const progressVal = this.computeScootProgress(state, motion);
    const envelope = Math.sin(Math.min(1, progressVal) * Math.PI);

    state.stretchSpring.target = 1;
    state.scootStretchSpring.target = lerp(
      1,
      lerp(1, 0, Math.sin(clamp(progressVal, 0, 1) * Math.PI)),
      0.15
    );
    state.scootRotationSpring.target = motion.rotationTarget * envelope;

    const { point } = this.advancePositionSprings(state, dt);

    if (
      progressVal >= 0.999 &&
      Math.abs(motion.progressSpring.velocity) < 0.01 &&
      this.isNearTarget(state, motion.end)
    ) {
      this.snapToPoint(state, motion.end);
      snapSpring(state.rotationSpring, wrapAngle(CLICK_ANGLE_DEG));
      state.rotation = state.rotationSpring.value;
      this.resetScoot(state);
      snapSpring(state.stretchSpring, 1);
      state.motion = null;
      return true;
    }
    return false;
  }

  private advancePositionSprings(state: CursorState, dt: number): { point: Vec2; speed: number } {
    const prevPoint = { ...state.point };
    advanceSpring(state.positionXSpring, dt);
    advanceSpring(state.positionYSpring, dt);
    advanceSpring(state.rotationSpring, dt);
    advanceSpring(state.scootAxisSpring, dt);

    const newPoint = { x: state.positionXSpring.value, y: state.positionYSpring.value };
    const speed = dist(prevPoint, newPoint) / Math.max(dt, 1 / 240);

    state.point = newPoint;
    state.rotation = state.rotationSpring.value;
    state.scootAxisRotation = state.scootAxisSpring.value;

    return { point: newPoint, speed };
  }

  private computeScootProgress(state: CursorState, motion: ScootMotion): number {
    const delta = { x: motion.end.x - motion.start.x, y: motion.end.y - motion.start.y };
    const lenSq = delta.x ** 2 + delta.y ** 2;
    if (lenSq < 0.001) return 1;
    const dot =
      (state.point.x - motion.start.x) * delta.x + (state.point.y - motion.start.y) * delta.y;
    return clamp(dot / lenSq, 0, 1);
  }

  private isNearTarget(state: CursorState, target: Vec2): boolean {
    return (
      dist(state.point, target) <= ARRIVAL_DIST &&
      Math.abs(state.positionXSpring.velocity) <= ARRIVAL_VEL &&
      Math.abs(state.positionYSpring.velocity) <= ARRIVAL_VEL
    );
  }

  private snapToPoint(state: CursorState, pt: Vec2): void {
    state.point = { ...pt };
    snapSpring(state.positionXSpring, pt.x);
    snapSpring(state.positionYSpring, pt.y);
  }

  private isAnimating(state: CursorState): boolean {
    if (state.motion) return true;
    if (state.thinkStartedAt !== null) return true;
    return (
      !isSpringSettled(state.positionXSpring) ||
      !isSpringSettled(state.positionYSpring) ||
      !isSpringSettled(state.rotationSpring) ||
      !isSpringSettled(state.scootAxisSpring) ||
      !isSpringSettled(state.scootRotationSpring) ||
      !isSpringSettled(state.scootStretchSpring) ||
      !isSpringSettled(state.stretchSpring) ||
      !isSpringSettled(state.visibilitySpring)
    );
  }

  // --- Render ---

  private render(state: CursorState): void {
    if (!this.cursorEl) return;

    const rotation = this.computeThinkingRotation(state);
    const vis = clamp(state.visibilitySpring.value, 0, 1);
    const stretch = state.stretchSpring.value;
    const scootStretch = clamp(state.scootStretchSpring.value, 0, 1);
    const scootRot = state.scootRotationSpring.value;
    const axisRot = state.scootAxisRotation;

    const scaleFactor = lerp(0.4, 1, vis);
    const blur = lerp(5, 0, vis);

    const transforms: string[] = [];
    transforms.push(
      `translate3d(${round(state.point.x - HALF)}px, ${round(state.point.y - HALF)}px, 0)`
    );

    if (Math.abs(wrapAngleDelta(0, axisRot)) > 0.001 || Math.abs(scootStretch - 1) > 0.001) {
      transforms.push(`rotate(${round(axisRot)}deg)`);
      transforms.push(`scale(1, ${round(scootStretch)})`);
      transforms.push(`rotate(${round(-axisRot)}deg)`);
    }

    transforms.push(`rotate(${round(wrapAngle(rotation + scootRot))}deg)`);
    transforms.push(`scale(${round(stretch * scaleFactor)}, ${round(scaleFactor)})`);

    this.cursorEl.style.transform = transforms.join(' ');
    this.cursorEl.style.opacity = `${round(vis)}`;
    this.cursorEl.style.filter = `blur(${round(blur)}px)`;
  }

  private computeThinkingRotation(state: CursorState): number {
    if (state.thinkStartedAt === null) return state.rotation;

    const elapsed = (now() - state.thinkStartedAt) / 1000;

    const envelope = Math.min(1, elapsed / THINK_RAMP_DURATION);
    const ramp = Math.sin(envelope * Math.PI);
    const oscillation = Math.sin((elapsed / THINK_OSC_PERIOD) * Math.PI * 2) * ramp;

    if (envelope >= 1) {
      state.thinkStartedAt = null;
      return state.rotation;
    }

    return state.rotation + oscillation * THINK_AMPLITUDE;
  }

  // --- Click effect ---

  private handleArrival(
    state: CursorState,
    action: CursorAction | string,
    resolve: () => void
  ): void {
    const isClick = action === 'click' || action === 'doubleclick' || action === 'tripleclick';
    if (isClick) {
      this.createClickRipple(state.point.x, state.point.y);
    }
    resolve();
  }

  private createClickRipple(x: number, y: number): void {
    this.injectRippleKeyframes();
    const ripple = document.createElement('div');
    ripple.className = 'superduck-cursor-ripple';
    Object.assign(ripple.style, {
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      width: '30px',
      height: '30px',
      borderRadius: '50%',
      background:
        'radial-gradient(circle, rgba(217,119,87,0.5) 0%, rgba(230,140,85,0.2) 50%, transparent 70%)',
      zIndex: '2147483646',
      pointerEvents: 'none',
      animation: 'superduck-cursor-click-ripple 0.4s ease-out forwards',
      transform: 'translate(-50%, -50%)'
    });
    document.body.appendChild(ripple);
    setTimeout(() => {
      if (ripple.parentNode) ripple.remove();
    }, 450);
  }

  private injectRippleKeyframes(): void {
    if (document.getElementById('superduck-cursor-ripple-styles')) return;
    const style = document.createElement('style');
    style.id = 'superduck-cursor-ripple-styles';
    style.textContent = `
      @keyframes superduck-cursor-click-ripple {
        0% { transform: translate(-50%, -50%) scale(0); opacity: 0.7; }
        100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  // --- Helpers ---

  private cancelPending(): void {
    if (this.safetyTimer !== null) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
    this.pendingResolve = null;
  }

  private resolvePending(): void {
    const fn = this.pendingResolve;
    this.cancelPending();
    fn?.();
  }

  private getViewportBounds(): Rect {
    return {
      width: window.visualViewport?.width ?? window.innerWidth,
      height: window.visualViewport?.height ?? window.innerHeight
    };
  }
}

function computeStretchFromSpeed(speed: number): number {
  return clamp(1 - speed / 5500, 0.65, 1);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
