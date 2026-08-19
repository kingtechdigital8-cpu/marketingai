/**
 * Minimal damped-spring utility for procedural body motion (see
 * avatar-idle-engine.ts). A spring reaches its target with a bit of
 * momentum/overshoot rather than snapping — that's what makes chained
 * motion (shoulder → upper arm → forearm → hand) read as follow-through
 * instead of everything moving in lockstep.
 *
 * Deliberately just two numbers, no class — the caller owns a plain object
 * per axis and calls stepSpring() on it every frame. No allocation inside
 * stepSpring() itself, so a whole skeleton's worth of springs (dozens of
 * these) costs nothing extra per frame beyond the arithmetic.
 */
export interface Spring {
  value: number;
  velocity: number;
}

export function createSpring(initial = 0): Spring {
  return { value: initial, velocity: 0 };
}

/**
 * Semi-implicit Euler spring-damper. `damping = 2 * Math.sqrt(stiffness)`
 * (mass = 1) is critically damped — reaches the target with no overshoot.
 * This project intentionally runs slightly under that on the "lead" bones
 * (shoulders, upper arms) so motion carries a touch of weight/overshoot,
 * and slightly over it on "trailing" bones (hands, fingertips) so the very
 * last link in a chain settles cleanly instead of jiggling.
 */
export function stepSpring(spring: Spring, target: number, delta: number, stiffness: number, damping: number): number {
  const force = (target - spring.value) * stiffness - spring.velocity * damping;
  spring.velocity += force * delta;
  spring.value += spring.velocity * delta;
  return spring.value;
}
