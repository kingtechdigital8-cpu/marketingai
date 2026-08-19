"use client";

import { useRef } from "react";

interface FooterWordmarkProps {
  text: string;
}

/**
 * Huge faint/grainy brand wordmark with a mouse-following "spotlight" that
 * reveals a colored (brand gradient) version of the same text underneath —
 * same effect family as eulerstream.com's footer, per explicit reference.
 * Mutates the container's CSS custom properties directly on mousemove
 * (see .footer-wordmark-glow's mask-image in globals.css) instead of React
 * state, so the spotlight tracks the cursor every frame without re-rendering.
 */
export function FooterWordmark({ text }: FooterWordmarkProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    containerRef.current?.style.setProperty("--spotlight-x", `${x}%`);
    containerRef.current?.style.setProperty("--spotlight-y", `${y}%`);
  }

  function handleMouseLeave() {
    containerRef.current?.style.setProperty("--spotlight-x", "50%");
    containerRef.current?.style.setProperty("--spotlight-y", "50%");
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      aria-hidden="true"
      className="footer-wordmark"
    >
      <span className="footer-wordmark-text footer-wordmark-base">{text}</span>
      <span className="footer-wordmark-text footer-wordmark-glow">{text}</span>
      <span className="noise-overlay" />
    </div>
  );
}
