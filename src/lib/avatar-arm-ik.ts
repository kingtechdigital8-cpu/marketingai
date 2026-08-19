import * as THREE from "three";

// ============================================================================
// Minimal, reusable analytic 2-bone IK (shoulder→elbow→hand) — the same
// technique game engines call "TwoBoneIK" (law-of-cosines elbow solve + an
// elbow "pole" direction to disambiguate the bend plane). Deliberately just
// an arm solver, not a general-purpose IK rig — only what avatar-gesture-
// engine.ts needs for gestures where the hand must reach a specific point
// relative to another bone (currently: salute's hand-to-forehead).
//
// Works entirely from bone hierarchy + world transforms, never a hardcoded
// world-space coordinate — the caller supplies a world-space TARGET (e.g.
// computed from the head bone's current position/rotation, see
// computeHeadRelativeWorldPoint below), and this solves the two joint
// rotations needed to reach it, however the character/head is currently
// oriented.
// ============================================================================

const _shoulderPos = new THREE.Vector3();
const _targetLocal = new THREE.Vector3();
const _parentInverse = new THREE.Matrix4();
const _dirLocal = new THREE.Vector3();
const _aimQuat = new THREE.Quaternion();
const _toTarget = new THREE.Vector3();
const _toPole = new THREE.Vector3();
const _poleOnPlane = new THREE.Vector3();
const _bendAxis = new THREE.Vector3();
const _elbowDir = new THREE.Vector3();
const _elbowWorldPos = new THREE.Vector3();
const _fallbackUp = new THREE.Vector3();
const _headWorldPos = new THREE.Vector3();
const _headWorldQuat = new THREE.Quaternion();
const _offsetScratch = new THREE.Vector3();

/**
 * Orients `bone` (a rotation relative to its own parent) so that
 * `childAxisLocal` — the CONSTANT, un-rotated direction from this bone
 * toward its child in the bone's own rest-local frame (i.e.
 * `childBone.position.clone().normalize()`, since a bone's `.position` is
 * its fixed offset from its parent and never touched by rotation-only
 * posing) — points at `worldTarget`. Ignores roll around that axis (shortest
 * -arc rotation) — kept as the simple building block; solveTwoBoneIK below
 * uses aimBoneTowardWorldPointWithRoll instead, which constrains roll too
 * (see that function's own comment for why the plain version alone left the
 * elbow's twist undefined and could read as the arm bending backward even
 * though the hand itself reached the right point).
 */
export function aimBoneTowardWorldPoint(bone: THREE.Object3D, childAxisLocal: THREE.Vector3, worldTarget: THREE.Vector3) {
  const parent = bone.parent;
  if (!parent) return;
  _parentInverse.copy(parent.matrixWorld).invert();
  _targetLocal.copy(worldTarget).applyMatrix4(_parentInverse);
  _dirLocal.copy(_targetLocal).sub(bone.position);
  if (_dirLocal.lengthSq() < 1e-10) return; // target coincides with the bone itself — nothing sane to aim at
  _dirLocal.normalize();
  _aimQuat.setFromUnitVectors(childAxisLocal, _dirLocal);
  bone.quaternion.copy(_aimQuat);
}

const _poleLocal = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _srcRight = new THREE.Vector3();
const _srcUp = new THREE.Vector3();
const _srcForward = new THREE.Vector3();
const _srcMat = new THREE.Matrix4();
const _dstMat = new THREE.Matrix4();
const _srcQuat = new THREE.Quaternion();
const _srcQuatInv = new THREE.Quaternion();
const _dstQuat = new THREE.Quaternion();
const _parentWorldQuat = new THREE.Quaternion();
const _parentWorldQuatInv = new THREE.Quaternion();

/**
 * Same job as aimBoneTowardWorldPoint (point `childAxisLocal` at
 * `worldTarget`) but ALSO constrains roll/twist around that aim axis, using
 * `worldPoleDir` (a world-space direction, e.g. shoulder→pole) as the
 * reference for where `rollAxisLocal` — any local direction on the bone
 * that is NOT parallel to `childAxisLocal`; it doesn't need to correspond to
 * a real anatomical landmark, just be consistent — should end up pointing.
 *
 * Why this exists: setFromUnitVectors() (the plain aimBoneTowardWorldPoint)
 * finds the SHORTEST rotation between two vectors, which fully determines
 * where the aim axis points but leaves rotation AROUND that axis completely
 * unconstrained/arbitrary. For a 2-bone arm, that arbitrary roll doesn't
 * affect the hand's final POSITION at all (confirmed live: the hand reached
 * within ~1cm of the salute target using the plain version) — but it very
 * visibly affects how the elbow/forearm LOOK getting there, and can easily
 * read as the arm twisting backward even though the endpoint is correct.
 * Constraining roll via the same pole vector that already biases the elbow
 * bend plane keeps both consistent with a single, deliberately-anatomical
 * reference instead of leaving twist to whatever quaternion math happens to
 * produce.
 *
 * Standard "aim + roll via basis construction" technique: build an
 * orthonormal basis at both the source (bone's rest-local frame) and
 * destination (world-target-facing, pole-oriented frame), then compute the
 * single rotation that maps one onto the other.
 */
export function aimBoneTowardWorldPointWithRoll(
  bone: THREE.Object3D,
  childAxisLocal: THREE.Vector3,
  rollAxisLocal: THREE.Vector3,
  worldTarget: THREE.Vector3,
  worldPoleDir: THREE.Vector3
) {
  const parent = bone.parent;
  if (!parent) return;
  _parentInverse.copy(parent.matrixWorld).invert();
  _targetLocal.copy(worldTarget).applyMatrix4(_parentInverse);
  _dirLocal.copy(_targetLocal).sub(bone.position);
  if (_dirLocal.lengthSq() < 1e-10) return;
  _dirLocal.normalize();

  // worldPoleDir is a DIRECTION, not a position — rotate it into the
  // parent's local space (rotation only, via quaternion, not the full
  // position-including matrix used for the target point above).
  parent.getWorldQuaternion(_parentWorldQuat);
  _parentWorldQuatInv.copy(_parentWorldQuat).invert();
  _poleLocal.copy(worldPoleDir).applyQuaternion(_parentWorldQuatInv);

  // Destination basis: forward = aim direction, right/up derived from the pole.
  _right.crossVectors(_poleLocal, _dirLocal);
  if (_right.lengthSq() < 1e-8) {
    _fallbackUp.set(0, 1, 0);
    _right.crossVectors(_fallbackUp, _dirLocal);
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
  }
  _right.normalize();
  _up.crossVectors(_dirLocal, _right).normalize();

  // Source basis: the bone's own rest-local reference axes.
  _srcForward.copy(childAxisLocal).normalize();
  _srcRight.crossVectors(rollAxisLocal, _srcForward);
  if (_srcRight.lengthSq() < 1e-8) {
    _fallbackUp.set(0, 1, 0);
    _srcRight.crossVectors(_fallbackUp, _srcForward);
    if (_srcRight.lengthSq() < 1e-8) _srcRight.set(1, 0, 0);
  }
  _srcRight.normalize();
  _srcUp.crossVectors(_srcForward, _srcRight).normalize();

  _srcMat.makeBasis(_srcRight, _srcUp, _srcForward);
  _dstMat.makeBasis(_right, _up, _dirLocal);
  _srcQuat.setFromRotationMatrix(_srcMat);
  _dstQuat.setFromRotationMatrix(_dstMat);
  _srcQuatInv.copy(_srcQuat).invert();

  bone.quaternion.copy(_dstQuat).multiply(_srcQuatInv);
}

const _scratchPerp1 = new THREE.Vector3();
const _scratchPerp2 = new THREE.Vector3();
const _pickAxisCandidate = new THREE.Vector3();

/** Any consistent (given a fixed `dir`) direction perpendicular to `dir` — used as the roll-axis reference for aimBoneTowardWorldPointWithRoll when a bone has no anatomically-meaningful roll landmark calibrated. Picks the world axis LEAST aligned with `dir` and crosses it, so it's always well-conditioned (never near-parallel to `dir`, which would make the cross product degenerate). */
function pickArbitraryPerpendicular(dir: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const absX = Math.abs(dir.x);
  const absY = Math.abs(dir.y);
  const absZ = Math.abs(dir.z);
  if (absX <= absY && absX <= absZ) _pickAxisCandidate.set(1, 0, 0);
  else if (absY <= absZ) _pickAxisCandidate.set(0, 1, 0);
  else _pickAxisCandidate.set(0, 0, 1);
  return out.crossVectors(_pickAxisCandidate, dir).normalize();
}

/**
 * Simplified analytic 2-bone IK. Bends the elbow toward `poleWorldPos` (only
 * its DIRECTION from the shoulder matters, not its distance — it does not
 * need to be reachable itself). Mutates upperBone/lowerBone's quaternions
 * DIRECTLY and at full strength — the caller (avatar-gesture-engine.ts) is
 * responsible for blending the result against idle's pose and for calling
 * `object.updateMatrixWorld(true)` up the chain beforehand so the world
 * positions read here reflect this frame's actual pose, not a stale one.
 */
export function solveTwoBoneIK(
  upperBone: THREE.Object3D,
  lowerBone: THREE.Object3D,
  upperChildAxisLocal: THREE.Vector3,
  lowerChildAxisLocal: THREE.Vector3,
  upperLength: number,
  lowerLength: number,
  targetWorldPos: THREE.Vector3,
  poleWorldPos: THREE.Vector3
): void {
  upperBone.getWorldPosition(_shoulderPos);

  _toTarget.copy(targetWorldPos).sub(_shoulderPos);
  const totalLen = upperLength + lowerLength;
  let targetDist = _toTarget.length();
  const minDist = Math.abs(upperLength - lowerLength) + 1e-4;
  const maxDist = Math.max(minDist + 1e-4, totalLen - 1e-4);
  targetDist = THREE.MathUtils.clamp(targetDist, minDist, maxDist);
  if (_toTarget.lengthSq() < 1e-10) _toTarget.set(0, 0, 1);
  const targetDir = _toTarget.normalize();

  // Law of cosines — angle at the shoulder between (shoulder→target) and (shoulder→elbow).
  const cosShoulder = (upperLength * upperLength + targetDist * targetDist - lowerLength * lowerLength) / (2 * upperLength * targetDist);
  const shoulderAngle = Math.acos(THREE.MathUtils.clamp(cosShoulder, -1, 1));

  // In-plane pole direction — component of shoulder→pole perpendicular to shoulder→target.
  _toPole.copy(poleWorldPos).sub(_shoulderPos);
  _poleOnPlane.copy(_toPole).sub(targetDir.clone().multiplyScalar(_toPole.dot(targetDir)));
  if (_poleOnPlane.lengthSq() < 1e-8) {
    _fallbackUp.set(0, 1, 0);
    _poleOnPlane.copy(_fallbackUp).sub(targetDir.clone().multiplyScalar(targetDir.dot(_fallbackUp)));
    if (_poleOnPlane.lengthSq() < 1e-8) _poleOnPlane.set(1, 0, 0);
  }
  _poleOnPlane.normalize();
  _bendAxis.crossVectors(targetDir, _poleOnPlane).normalize();

  // Rotating targetDir by +shoulderAngle around (targetDir × poleOnPlane) bends toward the pole — verified analytically (Rodrigues rotation of the canonical axis-aligned case).
  _elbowDir.copy(targetDir).applyAxisAngle(_bendAxis, shoulderAngle);
  _elbowWorldPos.copy(_shoulderPos).addScaledVector(_elbowDir, upperLength);

  // Roll-constrained aim for BOTH bones (see aimBoneTowardWorldPointWithRoll's
  // own comment for why the plain aim-only version left twist undefined) —
  // both use the SAME pole direction as their roll reference, so the whole
  // arm reads as one consistent bend instead of the upper and lower segment
  // twisting independently of each other.
  pickArbitraryPerpendicular(upperChildAxisLocal, _scratchPerp1);
  aimBoneTowardWorldPointWithRoll(upperBone, upperChildAxisLocal, _scratchPerp1, _elbowWorldPos, _poleOnPlane);
  upperBone.updateMatrixWorld(true);

  pickArbitraryPerpendicular(lowerChildAxisLocal, _scratchPerp2);
  aimBoneTowardWorldPointWithRoll(lowerBone, lowerChildAxisLocal, _scratchPerp2, targetWorldPos, _poleOnPlane);
  lowerBone.updateMatrixWorld(true);
}

/**
 * A world-space point offset from `headBone`'s CURRENT world position/
 * rotation — e.g. the temple/forehead — so it automatically follows however
 * the head is currently posed (idle sway, look-at, nod/shake), never a
 * static world coordinate. `localOffset` is expressed in the head bone's own
 * rest-local axes (the same convention every other rotation in this project
 * already assumes for a VRM's NORMALIZED humanoid bones).
 */
export function computeHeadRelativeWorldPoint(headBone: THREE.Object3D, localOffset: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  headBone.getWorldPosition(_headWorldPos);
  headBone.getWorldQuaternion(_headWorldQuat);
  _offsetScratch.copy(localOffset).applyQuaternion(_headWorldQuat);
  return out.copy(_headWorldPos).add(_offsetScratch);
}
