export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  width: number;
  height: number;
}

export interface SpringConfig {
  response: number;
  dampingFraction: number;
}

export interface SpringState {
  value: number;
  target: number;
  velocity: number;
  force: number;
  simulationTime: number;
  scriptTime: number;
  response: number;
  dampingFraction: number;
}

export interface BezierSegment {
  control1: Vec2;
  control2: Vec2;
  end: Vec2;
}

export interface MotionPath {
  start: Vec2;
  segments: BezierSegment[];
  arc: Vec2 | null;
  arcIn: Vec2 | null;
  arcOut: Vec2 | null;
  end: Vec2;
  startControl: Vec2;
  endControl: Vec2;
}

export const CLICK_ANGLE_DEG = -44;

export type CursorAction =
  | 'click'
  | 'doubleclick'
  | 'tripleclick'
  | 'scroll'
  | 'hover'
  | 'drag_start';

export interface BezierMotion {
  mode: 'bezier';
  path: MotionPath;
  progressSpring: SpringState;
}

export interface ScootMotion {
  mode: 'scoot';
  start: Vec2;
  end: Vec2;
  axisRotation: number;
  rotationTarget: number;
  progressSpring: SpringState;
}

export type CursorMotion = BezierMotion | ScootMotion | null;

export interface CursorState {
  point: Vec2;
  rotation: number;
  scootAxisRotation: number;
  motion: CursorMotion;
  thinkStartedAt: number | null;

  positionXSpring: SpringState;
  positionYSpring: SpringState;
  rotationSpring: SpringState;
  stretchSpring: SpringState;
  visibilitySpring: SpringState;
  scootAxisSpring: SpringState;
  scootStretchSpring: SpringState;
  scootRotationSpring: SpringState;
}
