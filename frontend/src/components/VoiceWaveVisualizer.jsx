import React from 'react';
import { Volume2, Sparkles, Zap, Radio, Check } from 'lucide-react';

export function VoiceWaveVisualizer({
  status, // 'idle' | 'listening' | 'thinking' | 'speaking' | 'wake_standby'
  transcript,
  interimText,
  lastHeard,
  microphoneName,
  wakeTriggered,
  onStop,
  onCancel
}) {
  const currentSpeech = transcript || interimText;

  // If idle and not triggered, keep visualizer clean and unobtrusive
  if (status === 'idle' && !wakeTriggered) {
    return null;
  }

  return (
    <div className={`voice-visualizer-container ${status} ${wakeTriggered ? 'wake-activated' : ''}`}>
      {/* Dynamic Animated Equalizer Core */}
      <div className="voice-visualizer-core">
        {status === 'listening' && (
          <div className="wave-bars-wrapper">
            <span className="wave-bar bar-1" />
            <span className="wave-bar bar-2" />
            <span className="wave-bar bar-3" />
            <span className="wave-bar bar-4" />
            <span className="wave-bar bar-5" />
            <span className="wave-bar bar-6" />
            <span className="wave-bar bar-7" />
          </div>
        )}

        {status === 'speaking' && (
          <div className="wave-bars-wrapper speaking">
            <span className="wave-bar s-1" />
            <span className="wave-bar s-2" />
            <span className="wave-bar s-3" />
            <span className="wave-bar s-4" />
            <span className="wave-bar s-5" />
          </div>
        )}

        {status === 'thinking' && (
          <div className="thinking-spinner-ring" />
        )}

        {status === 'wake_standby' && (
          <div className="standby-radar-core">
            <span className="radar-dot" />
            <span className="radar-ripple" />
          </div>
        )}
      </div>

      {/* Status & Live Transcript Display */}
      <div className="voice-status-info">
        <div className="voice-status-badge">
          {wakeTriggered && (
            <span className="wake-pill-highlight">
              <Zap size={14} />
              <span>"Hello AURA" Detected! ✨</span>
            </span>
          )}

          {status === 'listening' && !wakeTriggered && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="pulsing-red-dot" />
              <span>Listening via {microphoneName || 'system default microphone'}... (Auto-sends when you pause)</span>
            </div>
          )}

          {status === 'thinking' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={14} className="spin-icon" style={{ color: 'var(--accent-teal)' }} />
              <span>AURA is understanding your request...</span>
            </div>
          )}

          {status === 'speaking' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Volume2 size={14} style={{ color: 'var(--accent-teal)' }} />
              <span>AURA is speaking response...</span>
            </div>
          )}

          {status === 'wake_standby' && !wakeTriggered && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#047857', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                <Radio size={13} className="pulse-icon" />
                <span>Microphone Standby • Say <strong>"Hello AURA"</strong> anytime</span>
              </span>
              {lastHeard && (
                <span className="wake-live-heard">
                  (Heard: "{lastHeard}")
                </span>
              )}
            </div>
          )}
        </div>

        {/* Live speech feedback during active listening */}
        {currentSpeech && status === 'listening' && (
          <div className="live-transcript-box">
            "{currentSpeech}"
          </div>
        )}
      </div>

      {/* Action Controls when listening */}
      {status === 'listening' && (
        <div className="voice-action-controls">
          <button
            type="button"
            className="btn-voice-send-now"
            onClick={onStop}
            title="Done speaking, submit now"
          >
            <Check size={14} />
            <span>Done</span>
          </button>
          <button
            type="button"
            className="btn-voice-cancel"
            onClick={onCancel}
            title="Cancel voice input"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
