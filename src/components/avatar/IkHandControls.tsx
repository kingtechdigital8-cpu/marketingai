"use client";

import { useRef } from "react";
import { DraggableTarget } from "./IkHandGizmo";
import type { AvatarCanvasHandle } from "./AvatarCanvas";

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface IkHandControlsProps {
  side: "left" | "right";
  avatarRef: React.RefObject<AvatarCanvasHandle | null>;
  initialTarget: Vec3;
  initialPole: Vec3;
  onDraggingChange: (dragging: boolean) => void;
}

/**
 * One hand's IK gizmo pair (VRM Animation Studio, Phase C) — a bigger
 * marker for the hand's destination and a smaller one for the elbow pole
 * (which way the elbow bends). Both push into
 * AvatarCanvas.tsx's setHandIkTarget() via refs, not React state, on every
 * drag tick (per the performance rule: UI state stays in React, the actual
 * per-frame 3D data flows through refs/imperative calls) — the two targets
 * are tracked together here since a single setHandIkTarget() call needs
 * both values regardless of which marker just moved.
 */
export function IkHandControls({ side, avatarRef, initialTarget, initialPole, onDraggingChange }: IkHandControlsProps) {
  const targetRef = useRef<Vec3>(initialTarget);
  const poleRef = useRef<Vec3>(initialPole);

  function pushTarget() {
    avatarRef.current?.setHandIkTarget(side, targetRef.current, poleRef.current);
  }

  return (
    <>
      <DraggableTarget
        initialPosition={initialTarget}
        color={side === "right" ? "#ff4d4d" : "#4d94ff"}
        size={0.022}
        onChange={(pos) => {
          targetRef.current = pos;
          pushTarget();
        }}
        onDraggingChange={onDraggingChange}
      />
      <DraggableTarget
        initialPosition={initialPole}
        color={side === "right" ? "#ffb84d" : "#4dd9ff"}
        size={0.013}
        onChange={(pos) => {
          poleRef.current = pos;
          pushTarget();
        }}
        onDraggingChange={onDraggingChange}
      />
    </>
  );
}
