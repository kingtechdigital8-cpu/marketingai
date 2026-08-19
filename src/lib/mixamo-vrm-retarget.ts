import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

// Mixamo → VRM humanoid bone name map, restricted to the lower-body chain
// (hips + legs + feet + toes) only. AvatarCanvas.tsx's own procedural
// breathing/sway/gesture system already fully owns chest/spine/neck/head/
// arms/fingers — including those tracks here would fight that system for
// control of the same bones every frame (whichever ran last in useFrame
// would silently win). Restricting the retarget to bones the procedural
// system never touches is what lets both run together with no conflict.
const MIXAMO_TO_VRM_LOWER_BODY: Partial<Record<string, VRMHumanBoneName>> = {
  mixamorigHips: "hips",
  mixamorigLeftUpLeg: "leftUpperLeg",
  mixamorigLeftLeg: "leftLowerLeg",
  mixamorigLeftFoot: "leftFoot",
  mixamorigLeftToeBase: "leftToes",
  mixamorigRightUpLeg: "rightUpperLeg",
  mixamorigRightLeg: "rightLowerLeg",
  mixamorigRightFoot: "rightFoot",
  mixamorigRightToeBase: "rightToes",
};

const MIXAMO_CLIP_NAME = "mixamo.com";

/**
 * Loads a Mixamo FBX animation (e.g. an "Idle" export) and retargets only
 * its hips/leg/foot/toe tracks onto the given VRM's normalized humanoid bone
 * space, producing a THREE.AnimationClip playable via AnimationMixer.
 *
 * This is a real authored animation (an animator's keyframes), not a naive
 * sine wave on an isolated bone — the legs bend together with the hips in
 * the same clip, so weight-shift reads as natural without needing runtime
 * IK to keep the feet from lifting off the ground (see the "melayang"
 * floating-bug history in AvatarCanvas.tsx for why that matters here).
 *
 * Retargeting math follows three-vrm's own official Mixamo-loading sample
 * (loadMixamoAnimation.js from the pixiv/three-vrm repo): each rotation
 * track is re-expressed relative to the Mixamo rig's own rest pose (only
 * the DELTA from rest carries over — Mixamo's bind pose isn't the same as
 * VRM's normalized T-pose), and the hips' vertical translation is rescaled
 * by this specific VRM's own hip height so the bob matches its proportions
 * instead of the source mocap character's.
 */
export async function loadMixamoIdleAnimation(url: string, vrm: VRM): Promise<THREE.AnimationClip> {
  const loader = new FBXLoader();
  const asset = await loader.loadAsync(url);
  asset.updateMatrixWorld(true);

  const clip = THREE.AnimationClip.findByName(asset.animations, MIXAMO_CLIP_NAME) ?? asset.animations[0];
  if (!clip) throw new Error("File animasi Mixamo tidak berisi clip animasi.");

  const tracks: THREE.KeyframeTrack[] = [];
  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const quatBuffer = new THREE.Quaternion();

  const motionHips = asset.getObjectByName("mixamorigHips");
  const vrmHipsRestY = vrm.humanoid?.normalizedRestPose.hips?.position?.[1] ?? 1;
  const hipsPositionScale = motionHips && motionHips.position.y !== 0 ? vrmHipsRestY / motionHips.position.y : 1;
  // VRM0.x models face the opposite way from VRM1.0 (see VRMUtils.rotateVRM0
  // elsewhere in this codebase) — mirrored the same way the reference sample does.
  const isLegacyVrm0 = vrm.meta?.metaVersion === "0";

  clip.tracks.forEach((track) => {
    const [mixamoRigName, propertyName] = track.name.split(".");
    const vrmBoneName = MIXAMO_TO_VRM_LOWER_BODY[mixamoRigName];
    if (!vrmBoneName) return; // not part of the lower-body chain we retarget — left to procedural code

    const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName);
    const mixamoRigNode = asset.getObjectByName(mixamoRigName);
    if (!vrmNode || !mixamoRigNode || !mixamoRigNode.parent) return;

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
      mixamoRigNode.parent.getWorldQuaternion(parentRestWorldRotation);

      const values = track.values.slice();
      for (let i = 0; i < values.length; i += 4) {
        quatBuffer.fromArray(values, i);
        quatBuffer.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
        quatBuffer.toArray(values, i);
      }
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${vrmNode.name}.${propertyName}`,
          Array.from(track.times),
          isLegacyVrm0 ? values.map((v, i) => (i % 2 === 0 ? -v : v)) : values
        )
      );
    } else if (track instanceof THREE.VectorKeyframeTrack) {
      const values = track.values.map((v, i) => (isLegacyVrm0 && i % 3 !== 1 ? -v : v) * hipsPositionScale);
      tracks.push(new THREE.VectorKeyframeTrack(`${vrmNode.name}.${propertyName}`, Array.from(track.times), values));
    }
  });

  return new THREE.AnimationClip("vrmIdleLowerBody", clip.duration, tracks);
}
