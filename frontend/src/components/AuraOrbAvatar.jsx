import React, { useState, useEffect, useRef } from 'react';
import { playWakeChime } from '../utils/sound';

/**
 * Interactive AURA Orb Character
 * Replicates the luminous iridescent floating orb with cute glowing eyes and speech bubble.
 * Features:
 * - 3D Bobbing / Floating movement
 * - GPU-accelerated Direct DOM Eye Tracking (Zero React re-render lag)
 * - State-driven expressions (Idle, Listening, Thinking, Speaking, Wake-word triggered)
 * - Squish click physics & activation chime
 * - Floating speech bubble
 */
export function AuraOrbAvatar({
  status = 'idle', // 'idle' | 'listening' | 'thinking' | 'speaking' | 'wake_standby'
  wakeTriggered = false,
  onClick,
  currentMessage = ''
}) {
  const orbRef = useRef(null);
  const eyesContainerRef = useRef(null);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isSquishing, setIsSquishing] = useState(false);

  // Direct DOM Eye-tracking (Zero React state dispatch overhead)
  useEffect(() => {
    let animationFrameId;

    const handleMouseMove = (e) => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        if (!orbRef.current || !eyesContainerRef.current) return;
        const rect = orbRef.current.getBoundingClientRect();
        const orbCenterX = rect.left + rect.width / 2;
        const orbCenterY = rect.top + rect.height / 2;

        const deltaX = e.clientX - orbCenterX;
        const deltaY = e.clientY - orbCenterY;

        // Limit eye travel within the orb face
        const distance = Math.hypot(deltaX, deltaY);
        const maxDistance = 12;
        const factor = distance > 0 ? Math.min(distance, 350) / 350 : 0;
        const angle = Math.atan2(deltaY, deltaX);

        const targetX = Math.cos(angle) * maxDistance * factor;
        const targetY = Math.sin(angle) * (maxDistance * 0.7) * factor;

        eyesContainerRef.current.style.transform = `translate(${targetX}px, ${targetY}px)`;
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Periodic natural blinking
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 200);
    }, 4500 + Math.random() * 2000);

    return () => clearInterval(blinkInterval);
  }, []);

  // Pure derived speech bubble text (Zero state thrashing)
  const bubbleText = wakeTriggered
    ? 'Hi Atharva! ✨'
    : status === 'listening'
    ? "I'm listening..."
    : status === 'thinking'
    ? 'Thinking...'
    : status === 'speaking'
    ? 'Speaking...'
    : status === 'wake_standby'
    ? 'Say "Hello AURA"!'
    : 'Hello!';

  const handleOrbClick = () => {
    setIsSquishing(true);
    playWakeChime();
    setTimeout(() => setIsSquishing(false), 280);

    if (onClick) {
      onClick();
    }
  };

  return (
    <div className={`aura-character-stage ${status} ${wakeTriggered ? 'wake-bounce' : ''}`}>
      {/* Floating Speech Bubble */}
      <div className="aura-speech-bubble">
        <span className="bubble-text">{bubbleText}</span>
        <div className="bubble-tail" />
      </div>

      {/* Main Luminous Aura Orb */}
      <div
        ref={orbRef}
        className={`aura-luminous-orb ${status} ${isSquishing ? 'squish' : ''}`}
        onClick={handleOrbClick}
        title="I am AURA! Click me to speak or say 'Hello AURA'"
      >
        {/* Iridescent Glow Rings & Atmospheric aura */}
        <div className="orb-inner-ambient" />
        <div className="orb-highlight-glare" />

        {/* Reactive Soundwave / Pulse Rings when listening */}
        {status === 'listening' && (
          <>
            <div className="orb-pulse-ring ring-1" />
            <div className="orb-pulse-ring ring-2" />
          </>
        )}

        {/* Cute Glowing Arrowhead Eyes */}
        <div
          ref={eyesContainerRef}
          className={`aura-eyes-container ${isBlinking ? 'blink' : ''} ${status}`}
        >
          {/* Left Eye */}
          <div className="aura-eye left-eye">
            <svg viewBox="0 0 24 28" className="eye-svg">
              <path
                d="M 12 3 C 14 3 19 14 21 21 C 22 24 19 25 16 23 C 13 21 11 21 8 23 C 5 25 2 24 3 21 C 5 14 10 3 12 3 Z"
                fill="#ffffff"
              />
            </svg>
          </div>

          {/* Right Eye */}
          <div className="aura-eye right-eye">
            <svg viewBox="0 0 24 28" className="eye-svg">
              <path
                d="M 12 3 C 14 3 19 14 21 21 C 22 24 19 25 16 23 C 13 21 11 21 8 23 C 5 25 2 24 3 21 C 5 14 10 3 12 3 Z"
                fill="#ffffff"
              />
            </svg>
          </div>
        </div>

        {/* Cheerful Blush Patches */}
        <div className="orb-blush blush-left" />
        <div className="orb-blush blush-right" />
      </div>

      {/* Floating 3D Ground Shadow */}
      <div className={`aura-ground-shadow ${status}`} />
    </div>
  );
}
