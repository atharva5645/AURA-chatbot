import { useState, useEffect, useRef, useCallback } from 'react';
import { playWakeChime } from '../utils/sound';

/**
 * Phonetic variations of "Aura" transcribed by Web Speech API across accents
 */
const AURA_VARIANTS = '(?:aura|aurora|arora|ora|oura|ara|laura|haura|aora|orra|horra|order|error|era|or\\s+a|auto|horror|oreo|ayra|ira|eva|avra|atharva|assistant|aoura)';

/**
 * Direct command parser for natural scheduling and reminder requests
 */
function parseDirectCommand(rawText) {
  if (!rawText) return null;
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // If text starts with any active student scheduling command or query
  const directCommandRegex = /^(?:schedule|book|create|set|remind\s+me|what\s+is|what\s+are|what\s+do|show\s+me|list|cancel|reschedule|move|delete)\b/i;
  if (directCommandRegex.test(lower)) {
    return {
      hasWakeWord: true,
      isDirect: true,
      command: text
    };
  }
  return null;
}

/**
 * Natural, fault-tolerant wake-word and command parser
 */
function parseWakeSpeech(rawText) {
  if (!rawText) return null;
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // 1. Leading greeting + AURA: "hello aura", "hey aura", "hi aura", "ok aura", "yo aura", "aura"
  const leadingGreetingAura = new RegExp(`^(?:(?:hey|hi|hello|ok|okay|yo)\\s+)?${AURA_VARIANTS}\\b[\\s,:!?-]*(.*)$`, 'i');
  const m1 = lower.match(leadingGreetingAura);
  if (m1) {
    return {
      hasWakeWord: true,
      command: m1[1] ? m1[1].trim() : ''
    };
  }

  // 2. Anywhere in text: "please hello aura schedule a meeting"
  const anywhereAura = new RegExp(`\\b(?:hey|hi|hello|ok|okay|yo)\\s+${AURA_VARIANTS}\\b[\\s,:!?-]*(.*)$`, 'i');
  const m2 = lower.match(anywhereAura);
  if (m2) {
    return {
      hasWakeWord: true,
      command: m2[1] ? m2[1].trim() : ''
    };
  }

  // 3. Standalone greeting if user just said "hello", "hey", "hi", "hello there"
  if (/^(?:hello|hey|hi)\s*(?:there|bot|assistant)?$/i.test(lower)) {
    return {
      hasWakeWord: true,
      command: ''
    };
  }

  return null;
}

function getOptimalSpeechLang() {
  if (typeof navigator !== 'undefined' && navigator.language) {
    if (navigator.language.startsWith('en')) {
      return navigator.language;
    }
  }
  return 'en-US';
}

export function useSpeechRecognition({
  onSpeechComplete,
  onWakeWordDetected,
  isAssistantSpeaking = false
} = {}) {
  const [isListening, setIsListening] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(() => {
    return localStorage.getItem('aura_wake_word_enabled') !== 'false';
  });
  const [isWakeStandby, setIsWakeStandby] = useState(false);
  const [wakeTriggeredNotice, setWakeTriggeredNotice] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [transcript, setTranscript] = useState('');
  const [lastHeard, setLastHeard] = useState('');
  const [micPermissionState, setMicPermissionState] = useState('prompt');
  const [microphoneName, setMicrophoneName] = useState('System default microphone');
  const [error, setError] = useState(null);
  const [isSupported, setIsSupported] = useState(true);

  // References for reliable state and lifecycle handling
  const recognitionRef = useRef(null);
  const isRecognitionRunningRef = useRef(false);
  const isAssistantSpeakingRef = useRef(isAssistantSpeaking);
  const wakeWordEnabledRef = useRef(wakeWordEnabled);
  const isListeningRef = useRef(false);
  const isWakeStandbyRef = useRef(false);
  const accumulatedRef = useRef('');
  const interimRef = useRef('');
  const lastSpokenRef = useRef('');
  const completeCallbackRef = useRef(onSpeechComplete);
  const wakeCallbackRef = useRef(onWakeWordDetected);
  const restartTimerRef = useRef(null);
  const commandDebounceTimerRef = useRef(null);
  const wakeWordTimerRef = useRef(null);
  const lastHeardThrottleRef = useRef(0);
  const lastAssistantSpeakingEndRef = useRef(0);
  const lastCommandExecutionTimeRef = useRef(0);
  const lastExecutedCommandTextRef = useRef('');

  // Sync callbacks and props into refs
  useEffect(() => {
    isAssistantSpeakingRef.current = isAssistantSpeaking;
  }, [isAssistantSpeaking]);

  useEffect(() => {
    wakeWordEnabledRef.current = wakeWordEnabled;
  }, [wakeWordEnabled]);

  useEffect(() => {
    completeCallbackRef.current = onSpeechComplete;
  }, [onSpeechComplete]);

  useEffect(() => {
    wakeCallbackRef.current = onWakeWordDetected;
  }, [onWakeWordDetected]);

  // Request native microphone permission
  const requestMicPermission = useCallback(async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        const activeTrack = stream.getAudioTracks()[0];
        if (activeTrack?.label) {
          setMicrophoneName(activeTrack.label);
        }
        stream.getTracks().forEach(track => track.stop());
        setMicPermissionState('granted');
        setError(null);
        return true;
      }
    } catch (err) {
      console.warn('Microphone permission query:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicPermissionState('denied');
        setError('Microphone access was denied. Click the lock icon in your browser address bar to allow.');
      }
      return false;
    }
    return false;
  }, []);

  // Safely stop any running recognition instance
  const safelyStopRecognition = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (commandDebounceTimerRef.current) {
      clearTimeout(commandDebounceTimerRef.current);
      commandDebounceTimerRef.current = null;
    }
    if (wakeWordTimerRef.current) {
      clearTimeout(wakeWordTimerRef.current);
      wakeWordTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        // Ignored
      }
      recognitionRef.current = null;
    }
    isRecognitionRunningRef.current = false;
  }, []);

  // Check support and setup permission status on mount
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' })
        .then(permissionStatus => {
          setMicPermissionState(permissionStatus.state);
          permissionStatus.onchange = () => {
            setMicPermissionState(permissionStatus.state);
          };
        })
        .catch(() => {});
    }

    // Auto-grant on first user interaction anywhere on the document
    const handleFirstUserInteraction = () => {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'microphone' })
          .then(p => {
            if (p.state === 'granted') {
              setMicPermissionState('granted');
            }
          })
          .catch(() => {});
      }
    };
    window.addEventListener('click', handleFirstUserInteraction, { once: true });
    return () => {
      window.removeEventListener('click', handleFirstUserInteraction);
    };
  }, []);

  /**
   * Start Active Command Listening (Red pulsing recording mode)
   */
  const startListening = useCallback(async () => {
    setError(null);
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }

    // If permission not yet granted, request it via gesture
    if (micPermissionState !== 'granted') {
      const granted = await requestMicPermission();
      if (!granted && micPermissionState === 'denied') return;
    }

    safelyStopRecognition();

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false; // Stop when sentence finishes
      recognition.interimResults = true;
      recognition.maxAlternatives = 5;
      recognition.lang = getOptimalSpeechLang();

      accumulatedRef.current = '';
      interimRef.current = '';
      lastSpokenRef.current = '';
      setTranscript('');
      setInterimText('');

      recognition.onstart = () => {
        isRecognitionRunningRef.current = true;
        isListeningRef.current = true;
        isWakeStandbyRef.current = false;
        setIsListening(true);
        setIsWakeStandby(false);
      };

      recognition.onresult = (event) => {
        let interim = '';
        let finalized = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            finalized += res[0].transcript;
          } else {
            interim += res[0].transcript;
          }
        }

        if (finalized) {
          accumulatedRef.current = (accumulatedRef.current + ' ' + finalized).trim();
          interimRef.current = '';
          lastSpokenRef.current = accumulatedRef.current;
          setTranscript(accumulatedRef.current);
          setInterimText('');
        } else if (interim) {
          interimRef.current = interim;
          lastSpokenRef.current = (accumulatedRef.current + ' ' + interim).trim();
          setInterimText(interim);
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
          setMicPermissionState('denied');
          setError('Microphone permission denied. Click the lock icon in the browser address bar to allow.');
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('Speech recognition error:', event.error);
        }
        isListeningRef.current = false;
        setIsListening(false);
        isRecognitionRunningRef.current = false;
      };

      recognition.onend = () => {
        isRecognitionRunningRef.current = false;
        isListeningRef.current = false;
        setIsListening(false);

        let finalText = (accumulatedRef.current + ' ' + (interimRef.current || '')).trim() || lastSpokenRef.current.trim();

        // A wake-only phrase is an activation signal, not a chat message or
        // a reply to a pending meeting draft. Submit only words spoken after
        // the wake word.
        finalText = finalText.replace(/^(?:hey|hi|hello|ok|okay|yo)?\s*(?:aura|aurora|arora|ora|oura|ara|laura|haura|assistant)[,\s.:]*/i, '').trim();

        if (finalText && completeCallbackRef.current) {
          accumulatedRef.current = '';
          interimRef.current = '';
          lastSpokenRef.current = '';
          setTranscript('');
          setInterimText('');
          completeCallbackRef.current(finalText);
        }

        // Return to wake-word standby if enabled and assistant is not currently speaking
        if (wakeWordEnabledRef.current && !isAssistantSpeakingRef.current) {
          restartTimerRef.current = setTimeout(() => {
            startWakeWordStandby();
          }, 350);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start active speech recognition:', err);
      isListeningRef.current = false;
      setIsListening(false);
      isRecognitionRunningRef.current = false;
    }
  }, [micPermissionState, requestMicPermission, safelyStopRecognition]);

  /**
   * Start Background Standby Listening for "Hello AURA"
   */
  const startWakeWordStandby = useCallback(async () => {
    if (!wakeWordEnabledRef.current || isListeningRef.current || isAssistantSpeakingRef.current) {
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isRecognitionRunningRef.current) {
      return;
    }

    safelyStopRecognition();

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      // Quiet speech can be assigned a lower-ranked transcript by Chromium.
      // Checking several candidates gives the wake-word parser a fair chance
      // to match "Hello AURA" rather than only the first guess.
      recognition.maxAlternatives = 5;
      recognition.lang = getOptimalSpeechLang();

      recognition.onstart = () => {
        isRecognitionRunningRef.current = true;
        isWakeStandbyRef.current = true;
        setIsWakeStandby(true);
        setIsListening(false);
      };

      recognition.onresult = (event) => {
        // Echo suppression: Ignore any audio picked up while or immediately after assistant speaks
        if (isAssistantSpeakingRef.current || (Date.now() - lastAssistantSpeakingEndRef.current < 800)) {
          return;
        }

        let fullSpoken = '';
        for (let i = 0; i < event.results.length; ++i) {
          fullSpoken += ' ' + event.results[i][0].transcript;
        }
        fullSpoken = fullSpoken.trim();

        let spokenChunk = '';
        let isChunkFinal = false;
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          spokenChunk += event.results[i][0].transcript;
          if (event.results[i].isFinal) isChunkFinal = true;
        }
        const activeText = (spokenChunk.trim() || fullSpoken).trim();
        const wholeText = (fullSpoken || activeText).trim();

        // Update live heard indicator in visualizer
        const now = Date.now();
        if (wholeText && now - lastHeardThrottleRef.current > 250) {
          lastHeardThrottleRef.current = now;
          setLastHeard(wholeText || activeText);
        }

        // Parse every recognition alternative. With quiet speech, the correct
        // wake word is often present but not selected as the top hypothesis.
        const alternatives = [wholeText, activeText];
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          for (let j = 0; j < result.length; j++) {
            alternatives.push(result[j].transcript.trim());
          }
        }
        const parsed = alternatives
          .filter(Boolean)
          .map((candidate) => (
            parseWakeSpeech(candidate) || parseDirectCommand(candidate)
          ))
          .find(Boolean);

        if (parsed && parsed.hasWakeWord) {
          // CASE 1: Full command spoken with wake word or direct command
          // e.g. "Hello AURA, schedule a meeting of the next date at 3 PM"
          if (parsed.command && parsed.command.length >= 3) {
            // Cancel any pending wake-only trigger
            if (wakeWordTimerRef.current) {
              clearTimeout(wakeWordTimerRef.current);
              wakeWordTimerRef.current = null;
            }

            if (commandDebounceTimerRef.current) {
              clearTimeout(commandDebounceTimerRef.current);
              commandDebounceTimerRef.current = null;
            }

            const executeCommand = () => {
              const execTime = Date.now();
              const cmd = (parsed.command || '').trim();
              if (!cmd || cmd.length < 2) return;

              // Prevent double-execution within 2.5 seconds
              if (execTime - lastCommandExecutionTimeRef.current < 2500) {
                return;
              }
              // Prevent exact duplicate command within 5 seconds
              if (cmd.toLowerCase() === lastExecutedCommandTextRef.current.toLowerCase() && (execTime - lastCommandExecutionTimeRef.current < 5000)) {
                return;
              }

              lastCommandExecutionTimeRef.current = execTime;
              lastExecutedCommandTextRef.current = cmd;

              playWakeChime();
              setWakeTriggeredNotice(true);
              setTimeout(() => setWakeTriggeredNotice(false), 2500);

              safelyStopRecognition();
              isWakeStandbyRef.current = false;
              setIsWakeStandby(false);

              if (completeCallbackRef.current) {
                completeCallbackRef.current(cmd);
              }
            };

            // Always debounce command execution so user can finish their complete sentence
            commandDebounceTimerRef.current = setTimeout(executeCommand, isChunkFinal ? 450 : 850);
            return;
          }

          // CASE 2: User said just "Hello AURA" or "AURA" and paused
          // DO NOT abort immediately while interim! Wait for 950ms silence to see if command follows!
          if (!wakeWordTimerRef.current) {
            wakeWordTimerRef.current = setTimeout(() => {
              wakeWordTimerRef.current = null;
              playWakeChime();
              setWakeTriggeredNotice(true);
              setTimeout(() => setWakeTriggeredNotice(false), 2500);

              safelyStopRecognition();
              isWakeStandbyRef.current = false;
              setIsWakeStandby(false);

              if (wakeCallbackRef.current) {
                wakeCallbackRef.current();
              } else {
                startListening();
              }
            }, 950);
          }
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
          // If browser blocked unprompted start on load, leave state as prompt so user can click to activate
          if (micPermissionState === 'granted') {
            setMicPermissionState('denied');
            setError('Microphone permission denied. Click the lock icon in the browser address bar to allow.');
          }
          isWakeStandbyRef.current = false;
          setIsWakeStandby(false);
          isRecognitionRunningRef.current = false;
          return;
        }
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('Standby speech event:', event.error);
        }
      };

      recognition.onend = () => {
        isRecognitionRunningRef.current = false;

        // Resiliently reconnect silently when silence timeout occurs in Chromium
        if (wakeWordEnabledRef.current && !isListeningRef.current && !isAssistantSpeakingRef.current) {
          restartTimerRef.current = setTimeout(() => {
            startWakeWordStandby();
          }, 350);
        } else {
          isWakeStandbyRef.current = false;
          setIsWakeStandby(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Wake word standby start:', err?.message);
      isWakeStandbyRef.current = false;
      setIsWakeStandby(false);
      isRecognitionRunningRef.current = false;
    }
  }, [micPermissionState, safelyStopRecognition, startListening]);

  // Assistant speaking lifecycle: pause standby while speaking, resume with 800ms echo cooldown
  useEffect(() => {
    if (isAssistantSpeaking) {
      safelyStopRecognition();
    } else {
      lastAssistantSpeakingEndRef.current = Date.now();
      if (wakeWordEnabled && !isListeningRef.current && !isRecognitionRunningRef.current) {
        restartTimerRef.current = setTimeout(() => {
          startWakeWordStandby();
        }, 800); // 800ms room echo & reverb decay buffer
      }
    }

    return () => {
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }
    };
  }, [isAssistantSpeaking, wakeWordEnabled, safelyStopRecognition, startWakeWordStandby]);

  const toggleWakeWord = useCallback(() => {
    setWakeWordEnabled(prev => {
      const next = !prev;
      localStorage.setItem('aura_wake_word_enabled', String(next));
      wakeWordEnabledRef.current = next;
      if (!next) {
        safelyStopRecognition();
        isWakeStandbyRef.current = false;
        setIsWakeStandby(false);
      } else {
        setTimeout(() => startWakeWordStandby(), 200);
      }
      return next;
    });
  }, [safelyStopRecognition, startWakeWordStandby]);

  const stopListening = useCallback((shouldSubmit = true) => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    isListeningRef.current = false;
    setIsListening(false);

    let finalText = (accumulatedRef.current + ' ' + (interimRef.current || '')).trim() || lastSpokenRef.current.trim();
    finalText = finalText.replace(/^(?:hey|hi|hello|ok|okay|yo)?\s*(?:aura|aurora|arora|ora|oura|ara|laura|haura|assistant)[,\s.:]*/i, '').trim();

    if (shouldSubmit && finalText && completeCallbackRef.current) {
      accumulatedRef.current = '';
      interimRef.current = '';
      lastSpokenRef.current = '';
      setTranscript('');
      setInterimText('');
      completeCallbackRef.current(finalText);
    }

    if (wakeWordEnabledRef.current) {
      restartTimerRef.current = setTimeout(() => startWakeWordStandby(), 400);
    }
  }, [startWakeWordStandby]);

  const toggleListening = useCallback(async () => {
    if (isListeningRef.current) {
      stopListening(true);
    } else {
      await startListening();
    }
  }, [startListening, stopListening]);

  const abortListening = useCallback(() => {
    accumulatedRef.current = '';
    interimRef.current = '';
    lastSpokenRef.current = '';
    setTranscript('');
    setInterimText('');
    safelyStopRecognition();
    isListeningRef.current = false;
    setIsListening(false);
    if (wakeWordEnabledRef.current) {
      restartTimerRef.current = setTimeout(() => startWakeWordStandby(), 400);
    }
  }, [safelyStopRecognition, startWakeWordStandby]);

  /**
   * Explicitly activate wake-word standby with user gesture permission check
   */
  const enableAndStartWakeWord = useCallback(async () => {
    await requestMicPermission();
    setWakeWordEnabled(true);
    wakeWordEnabledRef.current = true;
    localStorage.setItem('aura_wake_word_enabled', 'true');
    setIsWakeStandby(true);
    isWakeStandbyRef.current = true;
    startWakeWordStandby();
  }, [requestMicPermission, startWakeWordStandby]);

  /**
   * Trigger test wake-word activation manually (for simulation & testing)
   */
  const triggerManualWake = useCallback(() => {
    playWakeChime();
    setWakeTriggeredNotice(true);
    setTimeout(() => setWakeTriggeredNotice(false), 2500);
    if (wakeCallbackRef.current) {
      wakeCallbackRef.current();
    } else {
      startListening();
    }
  }, [startListening]);

  return {
    isSupported,
    isListening,
    isWakeStandby,
    wakeWordEnabled,
    wakeTriggeredNotice,
    interimText,
    transcript,
    lastHeard,
    micPermissionState,
    microphoneName,
    error,
    startListening,
    stopListening,
    abortListening,
    safelyStopRecognition,
    startWakeWordStandby,
    toggleListening,
    toggleWakeWord,
    enableAndStartWakeWord,
    triggerManualWake
  };
}
