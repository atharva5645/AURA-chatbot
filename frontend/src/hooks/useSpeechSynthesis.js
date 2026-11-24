import { useState, useEffect, useCallback, useRef } from 'react';

// Global Set to prevent Chromium V8 garbage collection of active utterances
const activeUtterances = new Set();

/**
 * Clean markdown symbols, emojis, and formatting before speaking aloud
 */
function sanitizeForSpeech(raw) {
  if (!raw) return '';
  return raw
    .replace(/[*_#`~>]/g, '') // remove markdown bold, italics, headers, code
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // remove emojis
    .replace(/•/g, ', ') // replace bullet points with natural speech pause
    .replace(/\s+/g, ' ')
    .trim();
}

export function useSpeechSynthesis() {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(() => {
    // Default to NOT muted (false) unless explicitly saved
    return localStorage.getItem('aura_tts_muted') === 'true';
  });
  const [rate, setRate] = useState(() => {
    return parseFloat(localStorage.getItem('aura_tts_rate') || '1.0');
  });
  const [pitch, setPitch] = useState(() => {
    return parseFloat(localStorage.getItem('aura_tts_pitch') || '1.0');
  });

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const onEndRef = useRef(null);
  const lastSpokenTextRef = useRef('');
  const lastSpokenTimeRef = useRef(0);

  // Unlock SpeechSynthesis on first user interaction to comply with browser autoplay policies
  useEffect(() => {
    if (!isSupported) return;
    const unlockAudio = () => {
      try {
        if (synthRef.current) {
          const silent = new SpeechSynthesisUtterance(' ');
          silent.volume = 0;
          synthRef.current.speak(silent);
        }
      } catch (e) {}
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [isSupported]);

  // Load available native voices
  useEffect(() => {
    if (!isSupported) return;

    const updateVoices = () => {
      try {
        const available = synthRef.current.getVoices();
        if (available && available.length > 0) {
          setVoices(available);

          // Prefer clean local/native English voice (David, Zira, Samantha, or local service)
          const preferred =
            available.find(v => v.lang.startsWith('en') && v.localService && (v.name.includes('David') || v.name.includes('Zira') || v.name.includes('Mark') || v.name.includes('Samantha'))) ||
            available.find(v => v.lang.startsWith('en') && v.localService) ||
            available.find(v => v.lang.startsWith('en')) ||
            available[0];

          setSelectedVoice(preferred || null);
        }
      } catch (e) {
        console.warn('Could not query speech synthesis voices:', e);
      }
    };

    updateVoices();
    if (synthRef.current && synthRef.current.onvoiceschanged !== undefined) {
      synthRef.current.onvoiceschanged = updateVoices;
    }
  }, [isSupported]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      localStorage.setItem('aura_tts_muted', String(next));
      if (next && synthRef.current) {
        synthRef.current.cancel();
        setIsSpeaking(false);
      }
      return next;
    });
  }, []);

  const changeRate = useCallback((newRate) => {
    setRate(newRate);
    localStorage.setItem('aura_tts_rate', String(newRate));
  }, []);

  const changePitch = useCallback((newPitch) => {
    setPitch(newPitch);
    localStorage.setItem('aura_tts_pitch', String(newPitch));
  }, []);

  /**
   * Speak text aloud using browser-native SpeechSynthesis
   */
  const speak = useCallback((text, onEndCallback = null) => {
    if (!isSupported || !synthRef.current) {
      if (onEndCallback) onEndCallback();
      return;
    }

    if (isMuted) {
      console.log('🔇 Voice output is muted.');
      if (onEndCallback) onEndCallback();
      return;
    }

    const cleanText = sanitizeForSpeech(text);
    if (!cleanText) {
      if (onEndCallback) onEndCallback();
      return;
    }

    const now = Date.now();
    // Prevent repeating identical text within 3.5 seconds
    if (cleanText.toLowerCase() === lastSpokenTextRef.current.toLowerCase() && (now - lastSpokenTimeRef.current < 3500)) {
      console.log('🔇 Duplicate TTS speech suppressed:', cleanText);
      return;
    }
    lastSpokenTextRef.current = cleanText;
    lastSpokenTimeRef.current = now;

    // Cancel any currently playing or queued utterances to prevent back-to-back repetitions
    try {
      if (synthRef.current) {
        synthRef.current.cancel();
        activeUtterances.clear();
      }
    } catch (e) {}

    onEndRef.current = onEndCallback;

    const doSpeak = () => {
      try {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'en-US';
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
        utterance.rate = rate;
        utterance.pitch = pitch;

        // Keep utterance in persistent Set so Chrome V8 doesn't garbage collect it!
        activeUtterances.add(utterance);

        utterance.onstart = () => {
          setIsSpeaking(true);
        };

        utterance.onend = () => {
          activeUtterances.delete(utterance);
          setIsSpeaking(false);
          if (onEndRef.current) {
            const cb = onEndRef.current;
            onEndRef.current = null;
            cb();
          }
        };

        utterance.onerror = (e) => {
          activeUtterances.delete(utterance);
          // "interrupted" or "canceled" are normal when speech is stopped
          if (e.error !== 'interrupted' && e.error !== 'canceled') {
            console.warn('Speech synthesis utterance error:', e.error);
          }
          setIsSpeaking(false);
          if (onEndRef.current) {
            const cb = onEndRef.current;
            onEndRef.current = null;
            cb();
          }
        };

        // Ensure engine is unpaused
        if (synthRef.current.paused) {
          synthRef.current.resume();
        }

        synthRef.current.speak(utterance);

        // Chrome timeout watchdog: if Chrome pauses after 12s, resume it
        const resumeWatchdog = setInterval(() => {
          if (!activeUtterances.has(utterance)) {
            clearInterval(resumeWatchdog);
            return;
          }
          if (synthRef.current && synthRef.current.paused) {
            synthRef.current.resume();
          }
        }, 3000);

      } catch (err) {
        console.error('Failed to initiate speech synthesis:', err);
        setIsSpeaking(false);
        if (onEndCallback) onEndCallback();
      }
    };

    // If currently speaking, safely cancel and queue on next tick (fixes Chromium IPC cancel race)
    if (synthRef.current.speaking) {
      try {
        synthRef.current.cancel();
      } catch (e) {}
      setTimeout(doSpeak, 40);
    } else {
      doSpeak();
    }
  }, [isSupported, isMuted, selectedVoice, rate, pitch]);

  const cancel = useCallback(() => {
    if (synthRef.current) {
      onEndRef.current = null;
      try {
        synthRef.current.cancel();
      } catch (e) {
        // Ignored
      }
      setIsSpeaking(false);
    }
    activeUtterances.clear();
  }, []);

  return {
    isSupported,
    isSpeaking,
    isMuted,
    toggleMute,
    voices,
    selectedVoice,
    setSelectedVoice,
    rate,
    changeRate,
    pitch,
    changePitch,
    speak,
    cancel
  };
}
