import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { VoiceWaveVisualizer } from './VoiceWaveVisualizer';
import { AuraOrbAvatar } from './AuraOrbAvatar';
import { VoiceTrainingModal } from './VoiceTrainingModal';
import { ScheduledMeetingChart } from './ScheduledMeetingChart';
import { formatTime12 } from '../utils/dateUtils';
import { playChime, playWakeChime } from '../utils/sound';
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  User,
  Clock,
  Radio,
  Zap,
  Calendar,
  CalendarDays,
  Bell,
  ShieldAlert,
  Cpu,
  Key,
  ExternalLink,
  X
} from 'lucide-react';

export function ChatAssistantView() {
  const {
    refreshData,
    setCurrentView,
    classifierMode,
    tts,
    handsFreeMode,
    toggleHandsFree,
    openMeetingModal,
    openReminderModal
  } = useApp();

  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'assistant',
      text: "Hello Atharva! I'm AURA, your Intelligent Reminder, Scheduling & Knowledge Assistant.\n\n⚡ **Say \"Hello AURA\" aloud anytime to activate me**, or tap my glowing orb or the microphone below!\n\nYou can ask me to **schedule meetings**, **set reminders**, or ask **any general questions** (e.g. *\"What is photosynthesis?\"*, *\"What time is it?\"*, *\"Tell me a joke\"*).",
      card: null,
      time: 'Just now'
    }
  ]);

  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesScrollRef = useRef(null);
  const lastSentRef = useRef({ text: '', time: 0 });

  // Groq AI Integration State
  const [groqStatus, setGroqStatus] = useState({ configured: false });
  const [groqModalOpen, setGroqModalOpen] = useState(false);
  const [groqKeyInput, setGroqKeyInput] = useState('');
  const [groqSaving, setGroqSaving] = useState(false);
  const [groqError, setGroqError] = useState('');
  const [isWhisperRecording, setIsWhisperRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Voice Profile & Training State
  const [voiceTrainingOpen, setVoiceTrainingOpen] = useState(false);
  const [voiceProfile, setVoiceProfile] = useState({ trained: false });

  // Fetch Groq & Voice Profile Status on mount
  useEffect(() => {
    api.getGroqStatus()
      .then(status => setGroqStatus(status))
      .catch(err => console.warn('Could not fetch Groq status:', err.message));

    api.getVoiceProfile()
      .then(res => {
        if (res.profile) setVoiceProfile(res.profile);
      })
      .catch(() => { });
  }, []);

  // Localized, smooth container scroll (never scrolls the outer page or header)
  const scrollToBottom = useCallback(() => {
    if (messagesScrollRef.current) {
      messagesScrollRef.current.scrollTo({
        top: messagesScrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, loading, scrollToBottom]);

  // Handle sending message
  const handleSendMessage = useCallback(async (customText = null) => {
    const textToSend = (customText !== null ? customText : inputVal).trim();
    if (!textToSend || loading) return;

    setInputVal('');

    // Append user message
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await api.sendChatMessage(textToSend, 'default', classifierMode);

      const botMsg = {
        id: `bot-${Date.now()}`,
        sender: 'assistant',
        text: res.reply,
        card: res.card,
        speechText: res.speechText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, botMsg]);

      // If action executed or items changed, refresh database stats and calendar
      if (
        res.card?.type === 'success_badge' ||
        res.card?.type === 'schedule_chart' ||
        res.card?.type === 'schedule_list' ||
        textToSend.toLowerCase().includes('yes') ||
        textToSend.toLowerCase().includes('delete') ||
        textToSend.toLowerCase().includes('cancel') ||
        textToSend.toLowerCase().includes('schedule')
      ) {
        refreshData();
      }

      // Read reply aloud if TTS not muted
      const textToSpeak = res.speechText || res.reply;
      if (textToSpeak && !tts.isMuted) {
        tts.speak(textToSpeak, () => {
          // If Hands-Free Mode is enabled and there is a pending confirmation or question, auto-listen!
          if (handsFreeMode && (res.hasPendingAction || res.reply.includes('?'))) {
            setTimeout(() => {
              playChime();
              speechRec.startListening();
            }, 300);
          }
        });
      }
    } catch (err) {
      console.error('Chat error:', err);
      const errorMsg = {
        id: `bot-err-${Date.now()}`,
        sender: 'assistant',
        text: `⚠️ Error contacting assistant server: ${err.message}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [inputVal, loading, classifierMode, tts, handsFreeMode, refreshData]);

  // Groq API Key Configuration
  const handleSaveGroqKey = async () => {
    if (!groqKeyInput.trim().startsWith('gsk_')) {
      setGroqError('Invalid key format. Groq API keys start with gsk_');
      return;
    }
    setGroqSaving(true);
    setGroqError('');
    try {
      await api.configureGroq(groqKeyInput.trim());
      setGroqStatus({ configured: true, modelSTT: 'whisper-large-v3-turbo', modelLLM: 'llama-3.3-70b-versatile' });
      setGroqModalOpen(false);
      setGroqKeyInput('');
      const successMsg = {
        id: `groq-conf-${Date.now()}`,
        sender: 'assistant',
        text: '🚀 **Groq AI Activated!** AURA is now powered by **Groq Whisper Large v3** (ultra-fast speech recognition) and **Llama 3.3 70B** (conversational intelligence). Try speaking any request!',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, successMsg]);
    } catch (err) {
      setGroqError(err.message || 'Failed to save Groq API key');
    } finally {
      setGroqSaving(false);
    }
  };

  // Speech Recognition Hook & Ref for bidirectional access
  const speechRecRef = useRef(null);

  // Direct Audio Recording via MediaRecorder for Groq Whisper
  const startWhisperRecording = useCallback(async () => {
    try {
      // Pause background Web Speech API standby to avoid microphone device lock contention
      if (speechRecRef.current?.safelyStopRecognition) {
        speechRecRef.current.safelyStopRecognition();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Data = reader.result;
          setLoading(true);
          try {
            const promptKeywords = voiceProfile?.customPromptKeywords || null;
            const res = await api.transcribeAudioWithGroq(base64Data, 'audio/webm', promptKeywords);
            if (res.text && res.text.trim()) {
              handleSendMessage(res.text.trim());
            }
          } catch (err) {
            console.error('Groq Whisper error:', err);
          } finally {
            setLoading(false);
            // Resume wake-word standby if enabled
            if (speechRecRef.current?.wakeWordEnabled) {
              setTimeout(() => {
                if (speechRecRef.current?.startWakeWordStandby) {
                  speechRecRef.current.startWakeWordStandby();
                }
              }, 400);
            }
          }
        };
      };

      mediaRecorder.start();
      setIsWhisperRecording(true);
      playWakeChime();
    } catch (err) {
      console.error('Failed to start Whisper recording:', err);
    }
  }, [handleSendMessage, voiceProfile]);

  const stopWhisperRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsWhisperRecording(false);
  }, []);

  // Cancel must discard a Groq recording rather than sending its transcript.
  const cancelWhisperRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
      recorder.stream?.getTracks().forEach((track) => track.stop());
    }
    audioChunksRef.current = [];
    setIsWhisperRecording(false);
  }, []);

  // Speech Recognition Hook
  const speechRec = useSpeechRecognition({
    isAssistantSpeaking: tts.isSpeaking,
    onSpeechComplete: (spokenText) => {
      if (spokenText && spokenText.trim()) {
        handleSendMessage(spokenText.trim());
      }
    },
    onWakeWordDetected: () => {
      // User said "Hello AURA" aloud!
      const wakeMsg = {
        id: `wake-${Date.now()}`,
        sender: 'assistant',
        text: `⚡ **"Hello AURA" detected!** I'm listening... Speak your request!`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, wakeMsg]);

      // If Groq is active, use Whisper recording; otherwise use active listening
      if (groqStatus.configured) {
        startWhisperRecording();
      } else {
        speechRec.startListening();
      }
    }
  });

  speechRecRef.current = speechRec;

  // Assistant status
  const getAssistantStatus = () => {
    if (isWhisperRecording || speechRec.isListening) return 'listening';
    if (loading) return 'thinking';
    if (tts.isSpeaking) return 'speaking';
    if (speechRec.isWakeStandby) return 'wake_standby';
    return 'idle';
  };

  const status = getAssistantStatus();

  // Card confirmation handler
  const handleCardConfirm = async (confirmed) => {
    setLoading(true);
    try {
      const res = await api.confirmChatAction('default', confirmed);

      const botMsg = {
        id: `bot-conf-${Date.now()}`,
        sender: 'assistant',
        text: res.reply,
        card: res.card,
        speechText: res.speechText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, botMsg]);

      const textToSpeak = res.speechText || res.reply;
      if (textToSpeak && !tts.isMuted) {
        tts.speak(textToSpeak);
      }

      if (confirmed) {
        refreshData();
      }
    } catch (err) {
      console.error('Confirm error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = async () => {
    try {
      await api.clearChatHistory('default');
      setMessages([
        {
          id: 'welcome-reset',
          sender: 'assistant',
          text: "Chat history cleared. Say **\"Hello AURA\"** or tap the microphone to make a request!",
          time: 'Just now'
        }
      ]);
    } catch (err) {
      console.error('Clear chat error:', err);
    }
  };

  const renderFormattedText = (raw) => {
    if (!raw) return null;
    const lines = raw.split('\n');

    return lines.map((line, lIdx) => {
      const parts = line.split(/(\*\*.*?\*\*)/g);
      return (
        <React.Fragment key={lIdx}>
          {parts.map((p, pIdx) => {
            if (p.startsWith('**') && p.endsWith('**')) {
              return <strong key={pIdx}>{p.slice(2, -2)}</strong>;
            }
            return p;
          })}
          {lIdx < lines.length - 1 && <br />}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="fullscreen-chat-wrapper">
      {/* 1. Voice Topbar Controls */}
      <div className="voice-chat-topbar">
        <div className="topbar-left">
          <div className={`status-orb-indicator ${status}`}>
            <span className="orb-center" />
            <span className="orb-glow-ring" />
          </div>
          <div>
            <h3 className="voice-brand-title">AURA Voice Assistant</h3>
            <span className="voice-status-subtitle">
              {status === 'listening' && 'Listening to your command...'}
              {status === 'thinking' && 'Processing request...'}
              {status === 'speaking' && 'Speaking response...'}
              {status === 'wake_standby' && 'Listening for "Hello AURA"...'}
              {status === 'idle' && (
                speechRec.micPermissionState === 'denied'
                  ? 'Microphone blocked in URL bar'
                  : 'Ready • Say "Hello AURA"'
              )}
            </span>
          </div>
        </div>

        <div className="topbar-right">
          <div className="chat-voice-selector">
            <Volume2 size={15} aria-hidden="true" />
            <label htmlFor="chat-voice-select">Voice</label>
            <select
              id="chat-voice-select"
              value={tts.selectedVoice?.name || ''}
              disabled={tts.voices.length === 0}
              onChange={(e) => {
                const voice = tts.voices.find((item) => item.name === e.target.value);
                if (voice) tts.setSelectedVoice(voice);
              }}
            >
              {tts.voices.length === 0 ? (
                <option>Loading voices…</option>
              ) : (
                tts.voices.map((voice) => (
                  <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                    {voice.name} ({voice.lang})
                  </option>
                ))
              )}
            </select>
          </div>
          {/* Train Voice Button */}
          <button
            type="button"
            className={`btn-feature-pill ${voiceProfile.trained ? 'wake-active' : ''}`}
            onClick={() => setVoiceTrainingOpen(true)}
            title="Train AURA to recognize your voice, accent, and wake word"
            style={voiceProfile.trained ? { borderColor: '#10b981', color: '#047857', fontWeight: 600 } : {}}
          >
            <Sparkles size={14} />
            <span>{voiceProfile.trained ? 'Voice Profile ✓' : 'Train Voice 🎙️'}</span>
          </button>

          {/* Groq AI Button */}
          <button
            type="button"
            className={`btn-feature-pill ${groqStatus.configured ? 'wake-active' : ''}`}
            onClick={() => setGroqModalOpen(true)}
            title={groqStatus.configured ? 'Groq AI is ACTIVE: Whisper Large v3 + Llama 3.3 70B' : 'Connect free Groq API for Whisper STT and Llama 3.3'}
            style={groqStatus.configured ? { borderColor: '#ea580c', color: '#ea580c', fontWeight: 600 } : {}}
          >
            <Cpu size={14} className={groqStatus.configured ? 'pulse-icon' : ''} />
            <span>{groqStatus.configured ? 'Groq AI Active' : 'Connect Groq (Free)'}</span>
          </button>

          {/* Wake Word "Hello AURA" Toggle */}
          <button
            type="button"
            className={`btn-feature-pill ${speechRec.wakeWordEnabled ? 'wake-active' : ''}`}
            onClick={speechRec.toggleWakeWord}
            title={speechRec.wakeWordEnabled ? 'Wake word is ON: Say "Hello AURA" anytime' : 'Wake word is OFF (Click to enable)'}
          >
            <Zap size={14} className={speechRec.isWakeStandby ? 'pulse-icon' : ''} />
            <span>Wake Word {speechRec.wakeWordEnabled ? 'ON' : 'OFF'}</span>
          </button>

          {/* Test Wake Word Button */}
          <button
            type="button"
            className="btn-feature-pill test-wake-btn"
            onClick={speechRec.triggerManualWake}
            title="Simulate saying 'Hello AURA'"
          >
            <Sparkles size={14} />
            <span>Test "Hello AURA"</span>
          </button>

          {/* Hands-Free Mode Toggle */}
          <button
            type="button"
            className={`btn-feature-pill ${handsFreeMode ? 'active' : ''}`}
            onClick={toggleHandsFree}
            title={handsFreeMode ? 'Continuous voice mode ACTIVE (Auto-listens for answers)' : 'Hands-Free continuous voice mode OFF'}
          >
            <Radio size={14} className={handsFreeMode ? 'pulse-icon' : ''} />
            <span>Hands-Free {handsFreeMode ? 'ON' : 'OFF'}</span>
          </button>

          {/* TTS Audio Voice Output Toggle */}
          <button
            type="button"
            className={`btn-feature-pill ${!tts.isMuted ? 'active-voice' : 'muted'}`}
            onClick={tts.toggleMute}
            title={tts.isMuted ? 'Voice output is MUTED (Click to activate voice replies)' : 'Voice output is SPEAKING'}
          >
            {tts.isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span>{tts.isMuted ? 'Muted' : 'Voice Aloud'}</span>
          </button>

          {/* Quick Schedule Navigation Buttons */}
          <button
            type="button"
            className="btn-feature-pill"
            onClick={() => openMeetingModal('create')}
            title="Open Meeting Scheduler Modal"
          >
            <CalendarDays size={14} />
            <span>Schedule</span>
          </button>

          <button
            type="button"
            className="btn-feature-pill"
            onClick={() => openReminderModal('create')}
            title="Open Reminder Modal"
          >
            <Bell size={14} />
            <span>Reminder</span>
          </button>

          {/* Clear Chat */}
          <button
            type="button"
            className="btn-icon-ghost"
            onClick={handleClearChat}
            title="Clear Chat History"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* 2. Pinned Interactive AURA Companion Stage (Always Visible!) */}
      <div className="chat-companion-fixed-top">
        <AuraOrbAvatar
          status={status}
          wakeTriggered={speechRec.wakeTriggeredNotice}
          onClick={
            groqStatus.configured
              ? (isWhisperRecording ? stopWhisperRecording : startWhisperRecording)
              : speechRec.toggleListening
          }
          currentMessage={messages[messages.length - 1]?.text}
        />

        {/* Wake-Word Standby Status & Trigger Controls */}
        <div className="companion-status-controls">
          {speechRec.micPermissionState === 'denied' ? (
            <div className="wake-permission-denied-badge">
              <ShieldAlert size={15} />
              <span>Microphone blocked. Click the lock 🔒 icon in your browser address bar and select "Allow".</span>
            </div>
          ) : !speechRec.isWakeStandby && !speechRec.isListening ? (
            <div className="companion-actions-row">
              <button
                type="button"
                className="btn-activate-wake"
                onClick={speechRec.enableAndStartWakeWord}
              >
                <Zap size={14} />
                <span>Click to enable "Hello AURA" wake word</span>
              </button>
              <button
                type="button"
                className="btn-activate-wake-test"
                onClick={speechRec.triggerManualWake}
                title="Test activation immediately"
              >
                <Sparkles size={13} />
                <span>Test "Hello AURA"</span>
              </button>
            </div>
          ) : speechRec.isWakeStandby ? (
            <div className="companion-actions-row">
              <div className="wake-active-status-bar">
                <span className="live-pulse-green" />
                <span>Microphone Active • Say <strong>"Hello AURA"</strong> aloud anytime</span>
                <span className="wake-input-source">Input: {speechRec.microphoneName}</span>
                {speechRec.lastHeard && (
                  <span className="wake-live-heard">
                    (Heard: "{speechRec.lastHeard}")
                  </span>
                )}
              </div>
              <button
                type="button"
                className="btn-test-wake-mini"
                onClick={speechRec.triggerManualWake}
                title="Simulate saying 'Hello AURA'"
              >
                <Sparkles size={11} />
                <span>Test Wake</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* 3. Contained Messages Stream (Scrolls smoothly without moving the page!) */}
      <div className="fullscreen-messages-scroll" ref={messagesScrollRef}>
        <div className="messages-inner-container">
          {messages.map((msg) => (
            <div key={msg.id} className={`message-row ${msg.sender}`}>
              <div className="message-avatar">
                {msg.sender === 'assistant' ? (
                  <div className="mini-orb-avatar" />
                ) : (
                  <User size={18} />
                )}
              </div>

              <div className="message-content-wrapper">
                <div className="message-bubble">
                  <div className="message-text">
                    {renderFormattedText(msg.text)}
                  </div>

                  {/* Interactive Confirmation Card */}
                  {msg.card?.type === 'confirmation_card' && (
                    <div className="chat-confirmation-card">
                      <div className="conf-card-header">
                        <Clock size={16} style={{ color: 'var(--accent-teal)' }} />
                        <span>Ready to Save: {msg.card.title}</span>
                      </div>
                      <div className="conf-card-details">
                        <div><strong>Date:</strong> {msg.card.date}</div>
                        <div><strong>Time:</strong> {msg.card.time}</div>
                        {msg.card.attendees && <div><strong>Attendees:</strong> {msg.card.attendees}</div>}
                      </div>
                      <div className="conf-card-buttons">
                        <button
                          type="button"
                          className="btn-conf-save"
                          onClick={() => handleCardConfirm(true)}
                          disabled={loading}
                        >
                          ✓ Confirm & Save
                        </button>
                        <button
                          type="button"
                          className="btn-conf-cancel"
                          onClick={() => handleCardConfirm(false)}
                          disabled={loading}
                        >
                          ✕ Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Interactive Conflict Warning */}
                  {msg.card?.type === 'conflict_options' && (
                    <div className="chat-conflict-card">
                      <div className="conflict-card-title">
                        <AlertTriangle size={16} />
                        <span>Conflict Detected with {msg.card.conflictWith}</span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#78350f' }}>
                        Click an alternative slot to schedule without overlap:
                      </p>
                      <div className="conflict-slots-list">
                        {msg.card.suggestedSlots.map((slot, sIdx) => (
                          <button
                            key={sIdx}
                            type="button"
                            className="slot-choice-btn"
                            onClick={() => handleSendMessage(`use ${slot.startTime}`)}
                            disabled={loading}
                          >
                            Use {slot.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Interactive Scheduled Meetings Chart & Timeline */}
                  {(msg.card?.type === 'schedule_chart' || msg.card?.type === 'schedule_list') && (
                    <ScheduledMeetingChart
                      meetings={msg.card.meetings || []}
                      reminders={msg.card.reminders || []}
                      focus={msg.card.focus || null}
                    />
                  )}

                  {/* Available Slot Picker */}
                  {msg.card?.type === 'slot_list' && msg.card.availableSlots && (
                    <div className="chat-conflict-card" style={{ borderColor: 'var(--accent-teal)' }}>
                      <div className="conflict-card-title" style={{ color: 'var(--accent-teal)' }}>
                        <Clock size={16} />
                        <span>Available Meeting Slots</span>
                      </div>
                      <div className="conflict-slots-list">
                        {msg.card.availableSlots.map((slot, sIdx) => (
                          <button
                            key={sIdx}
                            type="button"
                            className="slot-choice-btn"
                            onClick={() => handleSendMessage(`Schedule meeting at ${slot}`)}
                            disabled={loading}
                          >
                            Book {slot}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Success Indicator */}
                  {msg.card?.type === 'success_badge' && (
                    <div className="chat-success-badge">
                      <CheckCircle size={15} />
                      <span>{msg.card.action === 'cancelled' ? 'Deleted from SQLite Database' : 'Saved to SQLite Database'}</span>
                    </div>
                  )}

                  {/* Audio Replay Button */}
                  {msg.sender === 'assistant' && msg.text && (
                    <button
                      type="button"
                      className="tts-replay-btn"
                      onClick={() => tts.speak(msg.speechText || msg.text)}
                      title="Read this message aloud"
                    >
                      <Volume2 size={12} />
                      <span>Speak</span>
                    </button>
                  )}
                </div>
                <span className="message-timestamp">{msg.time}</span>
              </div>
            </div>
          ))}

          {messages.length === 1 && !loading && (
            <section className="chat-welcome-workspace" aria-label="Quick actions">
              <div className="welcome-workspace-heading">
                <span>Quick actions</span>
                <small>Start with a task, schedule, or your agenda</small>
              </div>
              <div className="welcome-action-grid">
                <button type="button" className="welcome-action-card" onClick={() => openMeetingModal('create')}>
                  <CalendarDays size={18} />
                  <span><strong>Schedule a meeting</strong><small>Add a time, people, and location</small></span>
                </button>
                <button type="button" className="welcome-action-card" onClick={() => openReminderModal('create')}>
                  <Bell size={18} />
                  <span><strong>Set a reminder</strong><small>Get notified at the right time</small></span>
                </button>
                <button type="button" className="welcome-action-card" onClick={() => handleSendMessage('Show my scheduled meetings and reminders')}>
                  <Calendar size={18} />
                  <span><strong>View my agenda</strong><small>See meetings and active reminders</small></span>
                </button>
              </div>
            </section>
          )}

          {loading && (
            <div className="message-row assistant">
              <div className="message-avatar">
                <div className="mini-orb-avatar" />
              </div>
              <div className="message-bubble thinking-bubble">
                <span className="dot-pulse" />
                <span>AURA is understanding your request...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="chat-composer-area">
      {/* 4. Dynamic Voice Waveform Visualizer */}
      {(speechRec.isListening || isWhisperRecording || speechRec.interimText || speechRec.transcript) && (
        <VoiceWaveVisualizer
          status={status}
          transcript={speechRec.transcript}
          interimText={speechRec.interimText}
          lastHeard={speechRec.lastHeard}
          microphoneName={speechRec.microphoneName}
          wakeTriggered={speechRec.wakeTriggeredNotice}
          onStop={() => isWhisperRecording ? stopWhisperRecording() : speechRec.stopListening(true)}
          onCancel={() => isWhisperRecording ? cancelWhisperRecording() : speechRec.abortListening()}
        />
      )}

      {/* 5. Bottom Voice & Text Input Dock */}
      <div className="voice-input-dock">
        {/* Prominent Voice Microphone Button */}
        <button
          type="button"
          className={`hero-mic-button ${(isWhisperRecording || speechRec.isListening)
            ? 'active-listening'
            : speechRec.isWakeStandby
              ? 'standby-pulse'
              : ''
            }`}
          onClick={
            groqStatus.configured
              ? (isWhisperRecording ? stopWhisperRecording : startWhisperRecording)
              : speechRec.toggleListening
          }
          title={
            isWhisperRecording
              ? 'Groq Whisper recording... Click to finish and send'
              : groqStatus.configured
                ? 'Click to speak (Powered by Groq Whisper STT)'
                : speechRec.isListening
                  ? 'Listening... Click to send now'
                  : speechRec.isWakeStandby
                    ? 'Standing by: Say "Hello AURA" or tap to talk'
                    : 'Tap to speak to AURA'
          }
        >
          {isWhisperRecording || speechRec.isListening ? (
            <div className="mic-listening-graphic">
              <MicOff size={24} />
              <div className="mic-pulse-ring-1" />
              <div className="mic-pulse-ring-2" />
            </div>
          ) : (
            <Mic size={24} />
          )}
        </button>

        {/* Text Input for Typing */}
        <div className="voice-text-box">
          <input
            type="text"
            className="voice-text-field"
            placeholder={
              isWhisperRecording
                ? '🎙️ Groq Whisper is recording... Click mic when done speaking!'
                : speechRec.isListening
                  ? '🎙️ Listening to your command... Speak now...'
                  : groqStatus.configured
                    ? '⚡ Groq AI Active • Tap mic or ask any scheduling or general question...'
                    : speechRec.isWakeStandby
                      ? '🟢 Say "Hello AURA" aloud anytime, or ask any question...'
                      : 'Say "Hello AURA" or ask any question...'
            }
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendMessage();
            }}
            disabled={loading}
          />
          <button
            type="button"
            className="btn-send-message"
            onClick={() => handleSendMessage()}
            disabled={!inputVal.trim() || loading}
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
      </div>

      {/* Groq API Configuration Modal */}
      {groqModalOpen && (
        <div className="modal-backdrop" onClick={() => setGroqModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <Cpu size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18 }}>Connect Groq API (Free)</h3>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Whisper Large v3 (STT) + Llama 3.3 70B (AI Brain)</span>
                </div>
              </div>
              <button type="button" className="btn-icon-ghost" onClick={() => setGroqModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16 }}>
                Groq provides <strong>free, ultra-fast AI inference</strong> with zero credit card required. Connecting your free Groq key upgrades AURA with:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 600, color: '#c2410c', fontSize: 13, marginBottom: 2 }}>🎙️ Whisper Large v3</div>
                  <div style={{ fontSize: 12, color: '#7c2d12' }}>Gold-standard speech recognition. Never misses accents or words.</div>
                </div>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 600, color: '#15803d', fontSize: 13, marginBottom: 2 }}>🧠 Llama 3.3 70B</div>
                  <div style={{ fontSize: 12, color: '#14532d' }}>True conversational AI brain for scheduling & reminders.</div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>How to get your free key in 30 seconds:</div>
                <ol style={{ margin: 0, paddingLeft: 18, color: '#475569', lineHeight: 1.6 }}>
                  <li>Go to <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: '#ea580c', fontWeight: 600 }}>console.groq.com/keys <ExternalLink size={12} style={{ display: 'inline' }} /></a></li>
                  <li>Sign in with your Google or GitHub account</li>
                  <li>Click <strong>"Create API Key"</strong> and copy it</li>
                </ol>
              </div>

              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Paste Groq API Key:
              </label>
              <input
                type="password"
                className="form-input"
                placeholder="gsk_..."
                value={groqKeyInput}
                onChange={e => setGroqKeyInput(e.target.value)}
                style={{ width: '100%', fontFamily: 'monospace' }}
              />
              {groqError && (
                <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{groqError}</div>
              )}
            </div>

            <div className="modal-footer" style={{ padding: '12px 24px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn-secondary" onClick={() => setGroqModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveGroqKey} disabled={groqSaving || !groqKeyInput.trim()}>
                {groqSaving ? 'Connecting...' : 'Save & Activate Groq AI'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Voice Training & Calibration Wizard */}
      <VoiceTrainingModal
        isOpen={voiceTrainingOpen}
        onClose={() => setVoiceTrainingOpen(false)}
        onComplete={(profile) => {
          setVoiceProfile(profile);
          const doneMsg = {
            id: `voice-trained-${Date.now()}`,
            sender: 'assistant',
            text: '🎉 **Voice Profile Calibrated!** AURA has learned your voice, accent, and speech cadence. Wake word and scheduling are now tuned specifically to you. Try speaking any request!',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setMessages(prev => [...prev, doneMsg]);
        }}
      />
    </div>
  );
}
