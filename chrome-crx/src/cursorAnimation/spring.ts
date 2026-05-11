import type { SpringConfig, SpringState } from './types';

const STEP = 1 / 240;
const MAX_SCRIPT_DRIFT = 1;
const SETTLE_VELOCITY = 0.001 * 60;

export function createSpring(value: number, target: number, config: SpringConfig): SpringState {
  return {
    value,
    target,
    velocity: 0,
    force: 0,
    simulationTime: 0,
    scriptTime: 0,
    response: config.response,
    dampingFraction: config.dampingFraction
  };
}

export function snapSpring(spring: SpringState, value: number): void {
  spring.value = value;
  spring.target = value;
  spring.velocity = 0;
  spring.force = 0;
  spring.simulationTime = 0;
  spring.scriptTime = 0;
}

export function setSpringTargetAngle(spring: SpringState, target: number): void {
  spring.target = spring.value + wrapAngleDelta(spring.value, target);
}

export function advanceSpring(spring: SpringState, dt: number): void {
  const response = Math.max(0.001, spring.response);
  const maxStiffness = 1 / (2 * STEP * STEP);
  const stiffness = Math.min(((Math.PI * 2) / response) ** 2, maxStiffness);
  const damping = Math.sqrt(stiffness) * 2 * spring.dampingFraction;

  spring.scriptTime += Math.max(0, dt);

  if (spring.scriptTime - spring.simulationTime > MAX_SCRIPT_DRIFT) {
    spring.simulationTime = spring.scriptTime - 1 / 60;
  }

  while (spring.simulationTime < spring.scriptTime) {
    integrateStep(spring, stiffness, damping);
    spring.simulationTime += STEP;
  }

  if (isSpringSettled(spring)) {
    spring.value = spring.target;
  }
}

function integrateStep(spring: SpringState, stiffness: number, damping: number): void {
  const halfStep = STEP / 2;
  const vHalf = spring.velocity + spring.force * halfStep;
  spring.value += vHalf * STEP;
  spring.force = vHalf * -damping + (spring.target - spring.value) * stiffness;
  spring.velocity = vHalf + spring.force * halfStep;
}

export function isSpringSettled(spring: SpringState): boolean {
  if (Math.max(spring.velocity ** 2, spring.force ** 2) > SETTLE_VELOCITY ** 2) {
    return false;
  }
  const threshold = spring.target * 0.01;
  const delta = spring.target - spring.value;
  if (threshold === 0) return true;
  return delta * delta <= threshold * threshold;
}

export function wrapAngleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function wrapAngle(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}
