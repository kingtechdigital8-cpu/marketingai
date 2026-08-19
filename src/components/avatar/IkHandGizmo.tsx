"use client";

import { useState } from "react";
import * as THREE from "three";
import { TransformControls } from "@react-three/drei";

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface DraggableTargetProps {
  initialPosition: Vec3;
  color: string;
  size?: number;
  onChange: (pos: Vec3) => void;
  onDraggingChange: (dragging: boolean) => void;
}

/**
 * A single draggable 3D marker (VRM Animation Studio, Phase C) — a small
 * sphere the admin can grab and move with drei's TransformControls, wired
 * to call back with the marker's new WORLD position on every drag tick.
 * Purely a viewport/UI concern; has no idea what an "IK target" or "pole"
 * even is — the caller (the studio page) decides what to do with the
 * position (see AvatarBoneEditorApi.setHandIkTarget).
 *
 * Uses useState (not useRef) for the target mesh specifically because
 * TransformControls needs a real mounted Object3D to attach to, and a
 * plain ref's assignment doesn't trigger a re-render — so `meshRef.current
 * && <TransformControls .../>` would silently never render. A state
 * setter passed as the mesh's ref callback fires on mount AND schedules
 * the re-render that lets TransformControls actually appear.
 */
export function DraggableTarget({ initialPosition, color, size = 0.02, onChange, onDraggingChange }: DraggableTargetProps) {
  const [meshObject, setMeshObject] = useState<THREE.Mesh | null>(null);

  return (
    <>
      <mesh ref={setMeshObject} position={[initialPosition.x, initialPosition.y, initialPosition.z]}>
        <sphereGeometry args={[size, 16, 12]} />
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.85} />
      </mesh>
      {meshObject && (
        <TransformControls
          object={meshObject}
          mode="translate"
          size={0.5}
          onObjectChange={() => {
            const p = meshObject.position;
            onChange({ x: p.x, y: p.y, z: p.z });
          }}
          onMouseDown={() => onDraggingChange(true)}
          onMouseUp={() => onDraggingChange(false)}
        />
      )}
    </>
  );
}
