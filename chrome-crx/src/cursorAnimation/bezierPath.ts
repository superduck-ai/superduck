import type { Vec2, Rect, MotionPath, BezierSegment, SpringConfig } from './types';
import { CLICK_ANGLE_DEG } from './types';
import { wrapAngle } from './spring';

const CANDIDATE_COUNT = 20;
const START_HANDLE_RATIO = 0.41960295031576633;
const END_HANDLE_RATIO = 0.15;
const ARC_SIZE_RATIO = 0.2765523188064277;
const ARC_FLOW_RATIO = 0.5783555327868779;
const BOUNDS_MARGIN = 20;
const SAMPLE_COUNT = 24;

const ARC_DISTANCES = [0.55, 0.8, 1.05];
const ARC_HANDLE_SCALES = [0.65, 1, 1.35];

const MIN_RESPONSE = 0.12;
const MAX_RESPONSE = 2.2;
const DAMPING_FRACTION = 0.9;
const VELOCITY_DAMPING = 0.7;

export function planPath(start: Vec2, end: Vec2, bounds: Rect): MotionPath {
  const candidates = generateCandidates(start, end, bounds);
  return selectBestPath(candidates, bounds);
}

export function samplePathPoint(path: MotionPath, progress: number): Vec2 {
  const t = clamp(progress, 0, 1);
  const segCount = path.segments.length;
  const raw = t === 1 ? segCount - 1 : t * segCount;
  const segIdx = Math.floor(raw);
  const seg = path.segments[segIdx];
  if (!seg) return path.end;
  const segStart = segIdx === 0 ? path.start : path.segments[segIdx - 1].end;
  const localT = t === 1 ? 1 : raw - segIdx;
  return cubicBezierPoint(segStart, seg, localT);
}

export function samplePathTangent(path: MotionPath, progress: number): Vec2 {
  const t = clamp(progress, 0, 1);
  const segCount = path.segments.length;
  const raw = t === 1 ? segCount - 1 : t * segCount;
  const segIdx = Math.floor(raw);
  const seg = path.segments[segIdx];
  if (!seg) return { x: 0, y: -1 };
  const segStart = segIdx === 0 ? path.start : path.segments[segIdx - 1].end;
  const localT = t === 1 ? 1 : raw - segIdx;
  return cubicBezierTangent(segStart, seg, localT);
}

export function tangentToAngle(tangent: Vec2): number {
  if (dist({ x: 0, y: 0 }, tangent) < 0.001) return wrapAngle(CLICK_ANGLE_DEG);
  const n = normalize(tangent);
  return wrapAngle(Math.atan2(n.y, n.x) * (180 / Math.PI) + 90);
}

export function computePathSpringConfig(path: MotionPath): SpringConfig {
  const analysis = analyzePath(path);
  const d = Math.max(1, dist(path.start, path.end));
  const lengthRatio = clamp((analysis.length - 180) / 760, 0, 1);
  const excessRatio = clamp(Math.max(0, analysis.length / d - 1) / 0.55, 0, 1);
  const turnRatio = clamp(analysis.totalTurn / (Math.PI * 1.4), 0, 1);
  const energyRatio = clamp(analysis.angleEnergy / 1.25, 0, 1);
  const curveFactor = clamp(excessRatio * 0.42 + turnRatio * 0.38 + energyRatio * 0.2, 0, 1);
  const reverseScore = computeReverseScore(path);
  const hasArc = path.arc !== null;

  const response = clamp(
    (0.42 + lengthRatio * 0.22 + curveFactor * 0.12 + reverseScore * 0.28 + (hasArc ? 0.04 : 0)) *
      VELOCITY_DAMPING *
      (hasArc ? 0.9 : 1),
    MIN_RESPONSE,
    MAX_RESPONSE
  );

  return {
    response,
    dampingFraction: DAMPING_FRACTION
  };
}

function generateCandidates(start: Vec2, end: Vec2, bounds: Rect): MotionPath[] {
  const clickDir = angleToVec(CLICK_ANGLE_DEG);
  const d = dist(start, end);
  const delta = { x: end.x - start.x, y: end.y - start.y };
  const dir = normalize(delta);

  const startHandleLen = clamp(d * START_HANDLE_RATIO, 48, Math.min(640, d * 0.9));
  const endHandleLen = clamp(d * END_HANDLE_RATIO, 48, Math.min(640, d * 0.9));
  const antiClick = { x: -clickDir.x, y: -clickDir.y };

  const startCtrl = clampToBounds(bounds, start, clickDir, startHandleLen);
  const endCtrl = clampToBounds(bounds, end, antiClick, endHandleLen);

  const startCtrlShort = clampToBounds(bounds, start, clickDir, startHandleLen * 0.65);
  const endCtrlShort = clampToBounds(bounds, end, antiClick, endHandleLen * 0.65);

  const perp = { x: -dir.y, y: dir.x };
  const cross = perp.x * clickDir.x + perp.y * clickDir.y;
  const sign = cross >= 0 ? 1 : -1;
  const arcNormal = { x: perp.x * sign, y: perp.y * sign };
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

  const candidates: MotionPath[] = [];

  candidates.push(makeDirectPath(start, end, startCtrl, endCtrl));
  candidates.push(makeDirectPath(start, end, startCtrlShort, endCtrlShort));

  for (const arcScale of ARC_DISTANCES) {
    for (const handleScale of ARC_HANDLE_SCALES) {
      addArcPair(candidates, {
        start,
        end,
        startCtrl,
        endCtrl,
        midpoint,
        arcNormal,
        dir,
        startHandleLen,
        clickDir,
        arcDistBase: clamp(d * ARC_SIZE_RATIO, 50, 520),
        arcHandleBase: clamp(d * ARC_FLOW_RATIO, 38, 440),
        arcScale,
        handleScale
      });
    }
  }

  return candidates.slice(0, CANDIDATE_COUNT);
}

interface ArcParams {
  start: Vec2;
  end: Vec2;
  startCtrl: Vec2;
  endCtrl: Vec2;
  midpoint: Vec2;
  arcNormal: Vec2;
  dir: Vec2;
  startHandleLen: number;
  clickDir: Vec2;
  arcDistBase: number;
  arcHandleBase: number;
  arcScale: number;
  handleScale: number;
}

function addArcPair(candidates: MotionPath[], p: ArcParams): void {
  addArcCandidate(candidates, p, p.arcNormal);
  addArcCandidate(candidates, p, { x: -p.arcNormal.x, y: -p.arcNormal.y });
}

function addArcCandidate(candidates: MotionPath[], p: ArcParams, normal: Vec2): void {
  const arcDist = p.arcDistBase * p.arcScale;
  const handleDist = p.arcHandleBase * p.handleScale;
  const arc: Vec2 = {
    x: p.midpoint.x + normal.x * arcDist + p.clickDir.x * p.startHandleLen * 0.16,
    y: p.midpoint.y + normal.y * arcDist + p.clickDir.y * p.startHandleLen * 0.16
  };
  const arcIn: Vec2 = { x: arc.x - p.dir.x * handleDist, y: arc.y - p.dir.y * handleDist };
  const arcOut: Vec2 = { x: arc.x + p.dir.x * handleDist, y: arc.y + p.dir.y * handleDist };

  candidates.push({
    start: p.start,
    end: p.end,
    startControl: p.startCtrl,
    endControl: p.endCtrl,
    arc,
    arcIn,
    arcOut,
    segments: [
      { control1: p.startCtrl, control2: arcIn, end: arc },
      { control1: arcOut, control2: p.endCtrl, end: p.end }
    ]
  });
}

function makeDirectPath(start: Vec2, end: Vec2, c1: Vec2, c2: Vec2): MotionPath {
  return {
    start,
    end,
    startControl: c1,
    endControl: c2,
    arc: null,
    arcIn: null,
    arcOut: null,
    segments: [{ control1: c1, control2: c2, end }]
  };
}

interface PathAnalysis {
  length: number;
  angleEnergy: number;
  maxAngleChange: number;
  totalTurn: number;
  inBounds: boolean;
}

function analyzePath(path: MotionPath, bounds?: Rect): PathAnalysis {
  let length = 0;
  let angleEnergy = 0;
  let maxAngleChange = 0;
  let totalTurn = 0;
  let prevAngle: number | null = null;
  let inBounds = true;
  let prev = path.start;
  let segStart = path.start;

  for (const seg of path.segments) {
    for (let i = 1; i <= SAMPLE_COUNT; i++) {
      const t = i / SAMPLE_COUNT;
      const pt = cubicBezierPoint(segStart, seg, t);
      length += dist(prev, pt);

      if (bounds) {
        inBounds = inBounds && isInBounds(pt, bounds, BOUNDS_MARGIN);
      }

      const dx = pt.x - prev.x;
      const dy = pt.y - prev.y;
      if (dx * dx + dy * dy > 0.0001) {
        const angle = Math.atan2(dy, dx);
        if (prevAngle !== null) {
          const change = wrapRadians(angle - prevAngle);
          angleEnergy += change * change;
          maxAngleChange = Math.max(maxAngleChange, Math.abs(change));
          totalTurn += Math.abs(change);
        }
        prevAngle = angle;
      }
      prev = pt;
    }
    segStart = seg.end;
  }

  return { length, angleEnergy, maxAngleChange, totalTurn, inBounds };
}

function scorePath(path: MotionPath, bounds: Rect): { score: number; inBounds: boolean } {
  const a = analyzePath(path, bounds);
  const d = Math.max(1, dist(path.start, path.end));
  const excessLength = Math.max(0, a.length / d - 1);
  const reverseScore = computeReverseScore(path);
  const arcPenalty = path.arc !== null ? 45 : 0;

  const score =
    a.length +
    excessLength * 320 +
    a.angleEnergy * 140 +
    a.maxAngleChange * 180 +
    a.totalTurn * 18 +
    reverseScore * 90 +
    arcPenalty;

  return { score, inBounds: a.inBounds };
}

function selectBestPath(candidates: MotionPath[], bounds: Rect): MotionPath {
  if (candidates.length === 0) throw new Error('No candidate paths');

  let bestInBounds: MotionPath | null = null;
  let bestInBoundsScore = Infinity;
  let bestOverall: MotionPath = candidates[0];
  let bestOverallScore = Infinity;

  for (const c of candidates) {
    const { score, inBounds } = scorePath(c, bounds);
    if (inBounds && score < bestInBoundsScore) {
      bestInBounds = c;
      bestInBoundsScore = score;
    }
    if (score < bestOverallScore) {
      bestOverall = c;
      bestOverallScore = score;
    }
  }

  return bestInBounds ?? bestOverall;
}

function computeReverseScore(path: MotionPath): number {
  const clickDir = angleToVec(CLICK_ANGLE_DEG);
  const d = { x: path.end.x - path.start.x, y: path.end.y - path.start.y };
  const dir = normalize(d);
  const dot = -(dir.x * clickDir.x + dir.y * clickDir.y);
  return clamp((dot - 0.08) / 0.92, 0, 1);
}

function cubicBezierPoint(start: Vec2, seg: BezierSegment, t: number): Vec2 {
  const u = 1 - t;
  const uu = u * u;
  const uuu = uu * u;
  const tt = t * t;
  const ttt = tt * t;
  return {
    x: uuu * start.x + 3 * uu * t * seg.control1.x + 3 * u * tt * seg.control2.x + ttt * seg.end.x,
    y: uuu * start.y + 3 * uu * t * seg.control1.y + 3 * u * tt * seg.control2.y + ttt * seg.end.y
  };
}

function cubicBezierTangent(start: Vec2, seg: BezierSegment, t: number): Vec2 {
  const u = 1 - t;
  return {
    x:
      3 * u * u * (seg.control1.x - start.x) +
      6 * u * t * (seg.control2.x - seg.control1.x) +
      3 * t * t * (seg.end.x - seg.control2.x),
    y:
      3 * u * u * (seg.control1.y - start.y) +
      6 * u * t * (seg.control2.y - seg.control1.y) +
      3 * t * t * (seg.end.y - seg.control2.y)
  };
}

function angleToVec(deg: number): Vec2 {
  const rad = deg * (Math.PI / 180);
  return { x: Math.sin(rad), y: -Math.cos(rad) };
}

function clampToBounds(bounds: Rect, origin: Vec2, dir: Vec2, maxLen: number): Vec2 {
  let len = maxLen;
  if (dir.x < 0) len = Math.min(len, origin.x / -dir.x);
  if (dir.x > 0) len = Math.min(len, (bounds.width - origin.x) / dir.x);
  if (dir.y < 0) len = Math.min(len, origin.y / -dir.y);
  if (dir.y > 0) len = Math.min(len, (bounds.height - origin.y) / dir.y);
  return { x: origin.x + dir.x * Math.max(0, len), y: origin.y + dir.y * Math.max(0, len) };
}

function isInBounds(pt: Vec2, bounds: Rect, margin: number): boolean {
  return (
    pt.x >= margin &&
    pt.x <= bounds.width - margin &&
    pt.y >= margin &&
    pt.y <= bounds.height - margin
  );
}

export function dist(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function normalize(v: Vec2): Vec2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len < 0.001) return { x: 1, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function wrapRadians(r: number): number {
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}
