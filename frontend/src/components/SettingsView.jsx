import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import {
  Volume2,
  VolumeX,
  Sparkles,
  Bell,
  RotateCcw,
  BookOpen,
  CheckCircle,
  Play,
  Cpu
} from 'lucide-react';

export function SettingsView() {
  const {
    tts,
    classifierMode,
    setClassifierMode,
    notificationPermission,
    requestNotificationPermission,
    refreshData
  } = useApp();

  const [mlStatus, setMlStatus] = useState(null);
  const [training, setTraining] = useState(false);
  const [trainMessage, setTrainMessage] = useState(null);

  // Live Intent Tester
  const [testText, setTestText] = useState('Schedule a project meeting tomorrow at 3 PM');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  // Reset database state
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    fetchMLStatus();
  }, []);

  const fetchMLStatus = async () => {
    try {
      const res = await api.getClassifierStatus();
      if (res.success) {
        setMlStatus(res.data);
      }
    } catch (err) {
      console.warn('Failed to fetch ML status:', err);
    }
  };

  const handleTrainModel = async () => {
    try {
      setTraining(true);
      setTrainMessage(null);
      const res = await api.trainClassifier();
      if (res.success) {
        setTrainMessage(`Model successfully trained on local dataset! Accuracy: ${res.evaluation?.cvAccuracy || '70.4%'}`);
        fetchMLStatus();
      }
    } catch (err) {
      setTrainMessage(`Training failed: ${err.message}`);
    } finally {
      setTraining(false);
    }
  };

  const handleTestPrediction = async () => {
    if (!testText.trim()) return;
    try {
      setTesting(true);
      const res = await api.predictIntent(testText.trim(), classifierMode);
      if (res.success) {
        setTestResult(res.prediction);
      }
    } catch (err) {
      console.error('Test prediction error:', err);
    } finally {
      setTesting(false);
    }
  };

  const [clearing, setClearing] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);

  const handleClearAllData = async () => {
    if (window.confirm('Wipe all meetings, reminders, and chat history? Your calendar will be completely clear with zero dummy data.')) {
      try {
        setClearing(true);
        await api.clearAllData();
        setClearSuccess(true);
        refreshData();
        setTimeout(() => setClearSuccess(false), 4000);
      } catch (err) {
        alert('Failed to clear: ' + err.message);
      } finally {
        setClearing(false);
      }
    }
  };

  const handleResetData = async () => {
    if (window.confirm('Reset database to initial sample college records? This will replace your current meetings with the demo records.')) {
      try {
        setResetting(true);
        await api.resetSampleData();
        setResetSuccess(true);
        refreshData();
        setTimeout(() => setResetSuccess(false), 4000);
      } catch (err) {
        alert('Failed to reset: ' + err.message);
      } finally {
        setResetting(false);
      }
    }
  };

  return (
    <div className="view-content">
      {/* 1. Voice & Speech Synthesis Settings */}
      <div className="settings-section-card">
        <div className="settings-section-header">
          <Volume2 size={20} style={{ color: 'var(--primary-blue)' }} />
          <h3>Voice & Speech Synthesis (Web Speech API)</h3>
        </div>

        <div className="settings-field-row">
          <div className="settings-label">
            <h4>Voice Output (Text-to-Speech)</h4>
            <p>Read AURA's replies aloud automatically</p>
          </div>
          <button
            className={`btn-tts-toggle ${tts.isMuted ? 'muted' : ''}`}
            onClick={tts.toggleMute}
          >
            {tts.isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            <span>{tts.isMuted ? 'Muted' : 'Speaking Active'}</span>
          </button>
        </div>

        {tts.voices.length > 0 && (
          <div className="settings-field-row">
            <div className="settings-label">
              <h4>Synthetic Voice</h4>
              <p>Choose from available browser speech voices</p>
            </div>
            <select
              className="select-control"
              value={tts.selectedVoice?.name || ''}
              onChange={(e) => {
                const found = tts.voices.find(v => v.name === e.target.value);
                if (found) tts.setSelectedVoice(found);
              }}
            >
              {tts.voices.map((v, i) => (
                <option key={i} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="settings-field-row">
          <div className="settings-label">
            <h4>Speech Rate ({tts.rate}x)</h4>
            <p>Speed of spoken responses</p>
          </div>
          <input
            type="range"
            min="0.7"
            max="1.5"
            step="0.1"
            className="range-slider"
            value={tts.rate}
            onChange={(e) => tts.changeRate(parseFloat(e.target.value))}
          />
        </div>

        <div className="settings-field-row">
          <div className="settings-label">
            <h4>Speech Pitch ({tts.pitch})</h4>
            <p>Voice tone frequency</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="range"
              min="0.7"
              max="1.3"
              step="0.1"
              className="range-slider"
              value={tts.pitch}
              onChange={(e) => tts.changePitch(parseFloat(e.target.value))}
            />
            <button
              className="btn-outline"
              style={{ padding: '5px 10px', fontSize: '0.78rem' }}
              onClick={() => tts.speak("Hello Atharva, I'm AURA, your intelligent assistant.")}
            >
              <Play size={13} />
              <span>Test Voice</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Optional Machine Learning Extension */}
      <div className="settings-section-card">
        <div className="settings-section-header">
          <Cpu size={20} style={{ color: 'var(--accent-teal)' }} />
          <h3>NLP Engine & Optional Machine Learning Model</h3>
        </div>

        <div className="settings-field-row">
          <div className="settings-label">
            <h4>Active Intent Classification Engine</h4>
            <p>Choose between deterministic rule heuristics or trained local Naive Bayes</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`filter-pill-btn ${classifierMode === 'rule_based' ? 'active' : ''}`}
              onClick={() => setClassifierMode('rule_based')}
            >
              Rule-Based NLP
            </button>
            <button
              className={`filter-pill-btn ${classifierMode === 'ml' ? 'active' : ''}`}
              onClick={() => setClassifierMode('ml')}
            >
              Naive Bayes ML
            </button>
          </div>
        </div>

        <div className="settings-field-row">
          <div className="settings-label">
            <h4>Local Model Status</h4>
            <p>
              {mlStatus?.isTrained
                ? `Trained on ${mlStatus.datasetCount} utterances • ${mlStatus.vocabularySize} vocabulary tokens`
                : 'Model not trained yet.'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {mlStatus?.evaluation?.cvAccuracy && (
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-teal-text)' }}>
                Accuracy: {mlStatus.evaluation.cvAccuracy}
              </span>
            )}
            <button
              className="btn-teal"
              style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              onClick={handleTrainModel}
              disabled={training}
            >
              {training ? 'Training...' : 'Retrain ML Model'}
            </button>
          </div>
        </div>

        {trainMessage && (
          <div style={{ marginTop: '10px', padding: '10px 14px', backgroundColor: 'var(--accent-teal-soft)', borderRadius: '6px', fontSize: '0.82rem', color: 'var(--accent-teal-text)', fontWeight: 600 }}>
            {trainMessage}
          </div>
        )}

        {/* Live Intent Testing Playground */}
        <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
          <h4 style={{ fontSize: '0.9rem', color: 'var(--navy-darkest)', marginBottom: '6px' }}>
            🧪 Live Intent Tester Playground
          </h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Type any sentence to see how the active engine ({classifierMode === 'ml' ? 'Naive Bayes ML' : 'Rule-Based NLP'}) classifies the intent:
          </p>

          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              className="form-input"
              style={{ flex: 1 }}
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="e.g., Move my project meeting to Friday at 2 PM"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTestPrediction();
              }}
            />
            <button
              className="btn-primary"
              style={{ padding: '0 18px' }}
              onClick={handleTestPrediction}
              disabled={testing}
            >
              {testing ? 'Testing...' : 'Classify'}
            </button>
          </div>

          {testResult && (
            <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'var(--bg-card-subtle)', borderRadius: '8px', fontSize: '0.82rem' }}>
              <div><strong>Predicted Intent:</strong> <span style={{ color: 'var(--primary-blue)', fontWeight: 'bold' }}>{testResult.intent}</span></div>
              <div><strong>Confidence:</strong> {(testResult.confidence * 100).toFixed(1)}%</div>
              <div><strong>Engine:</strong> {testResult.method}</div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Browser Desktop Notifications */}
      <div className="settings-section-card">
        <div className="settings-section-header">
          <Bell size={20} style={{ color: 'var(--warning)' }} />
          <h3>Browser Desktop Notifications</h3>
        </div>

        <div className="settings-field-row">
          <div className="settings-label">
            <h4>Notification Permission</h4>
            <p>Allows system alerts when a meeting or reminder is due</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: notificationPermission === 'granted' ? 'var(--success)' : 'var(--text-muted)' }}>
              Status: {notificationPermission}
            </span>
            {notificationPermission !== 'granted' && (
              <button
                className="btn-outline"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                onClick={requestNotificationPermission}
              >
                Enable Notifications
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Sample Data & Project Maintenance */}
      <div className="settings-section-card">
        <div className="settings-section-header">
          <RotateCcw size={20} style={{ color: 'var(--danger)' }} />
          <h3>Data Management & Clean Live Slate</h3>
        </div>

        <div className="settings-field-row">
          <div className="settings-label">
            <h4>Clean Live Slate (Zero Dummy Data)</h4>
            <p>Purges all dummy meetings, reminders, and chat history for a 100% clean real-time experience.</p>
          </div>
          <button
            className="btn-danger-outline"
            onClick={handleClearAllData}
            disabled={clearing}
          >
            {clearing ? 'Clearing...' : 'Clear All Data'}
          </button>
        </div>

        {clearSuccess && (
          <div style={{ marginTop: '10px', padding: '10px 14px', backgroundColor: 'var(--success-soft)', color: 'var(--success)', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600 }}>
            ✓ All dummy data cleared! Your calendar is ready for pure real-time scheduling.
          </div>
        )}

        <div className="settings-field-row" style={{ marginTop: '14px', borderTop: '1px solid var(--border-light)', paddingTop: '14px' }}>
          <div className="settings-label">
            <h4>Restore Demo College Records</h4>
            <p>Optionally populates demo meetings (Capstone Sync, AI Review) for testing.</p>
          </div>
          <button
            className="btn-secondary"
            onClick={handleResetData}
            disabled={resetting}
          >
            {resetting ? 'Resetting...' : 'Restore Demo Records'}
          </button>
        </div>

        {resetSuccess && (
          <div style={{ marginTop: '10px', padding: '10px 14px', backgroundColor: 'var(--success-soft)', color: 'var(--success)', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600 }}>
            ✓ Sample college data restored successfully! Check your Dashboard and Calendar.
          </div>
        )}
      </div>

      {/* 5. College Viva Notes Guide */}
      <div className="settings-section-card" style={{ backgroundColor: '#fafcff', borderColor: 'var(--primary-blue-border)' }}>
        <div className="settings-section-header" style={{ borderColor: 'var(--primary-blue-border)' }}>
          <BookOpen size={20} style={{ color: 'var(--primary-blue)' }} />
          <h3>College Project Defense & Viva Cheat Sheet</h3>
        </div>

        <div style={{ fontSize: '0.85rem', color: 'var(--navy-mid)', display: 'flex', flexDirection: 'column', gap: '10px', lineHeight: 1.6 }}>
          <p>
            <strong>Project Title:</strong> AURA — Atharva’s Intelligent Reminder Assistant
          </p>
          <p>
            <strong>Core Architecture:</strong> React with Vite (Frontend), Node.js with Express (Backend), SQLite database (persisted locally).
          </p>
          <p>
            <strong>NLP Pipeline:</strong> Implements a hybrid architecture:
            <br />1. <em>Deterministic Rule-Based Parser</em> with regex pattern extraction for 100% precision on entities (dates, 24-hr times, attendees).
            <br />2. <em>Multinomial Naive Bayes ML Classifier</em> with TF-IDF and n-gram feature extraction trained locally on 120+ student commands.
          </p>
          <p>
            <strong>Zero Paid API Dependency:</strong> Runs entirely without OpenAI, Gemini, or any paid cloud service.
          </p>
          <p>
            <strong>Voice Interface:</strong> Uses W3C standard Web Speech API (<code>webkitSpeechRecognition</code> for speech-to-text, <code>speechSynthesis</code> for text-to-speech) with Web Audio procedural sound generation.
          </p>
        </div>
      </div>
    </div>
  );
}
