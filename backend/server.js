require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./db');

const meetingsRoutes = require('./routes/meetings');
const remindersRoutes = require('./routes/reminders');
const chatRoutes = require('./routes/chat');
const classifierRoutes = require('./routes/classifier');
const statsRoutes = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 5000;

const { isGroqConfigured, transcribeAudioWithGroq } = require('./nlp/groqClient');
const fs = require('fs');
const path = require('path');

// Middleware
app.use(cors({
  origin: '*', // Allow frontend development server
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '25mb' }));

// Initialize SQLite Database schema & initial seeds
initDatabase();

// Mount API routes
app.use('/api/meetings', meetingsRoutes);
app.use('/api/reminders', remindersRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/classifier', classifierRoutes);
app.use('/api/stats', statsRoutes);

// Persistent Voice Profile Storage
const voiceProfileFile = path.join(__dirname, 'data', 'voice_profile.json');
let voiceProfile = {
  trained: false,
  userName: 'Atharva',
  calibratedAt: null,
  customPromptKeywords: 'Atharva, AURA, Hello AURA, schedule, meeting, of the next date, tomorrow, 3 PM',
  micSensitivity: 1.0,
  samplesCount: 0
};

if (fs.existsSync(voiceProfileFile)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(voiceProfileFile, 'utf8'));
    voiceProfile = { ...voiceProfile, ...loaded };
  } catch (e) {
    console.warn('Could not read voice_profile.json:', e.message);
  }
}

// Groq Whisper & Llama API Routes
app.post('/api/groq/transcribe', async (req, res) => {
  try {
    const { audio, mimeType, customPrompt } = req.body;
    if (!audio) {
      return res.status(400).json({ success: false, error: 'audio base64 payload is required' });
    }
    const promptToUse = customPrompt || voiceProfile.customPromptKeywords;
    const text = await transcribeAudioWithGroq(audio, mimeType || 'audio/webm', promptToUse);
    res.json({ success: true, text });
  } catch (err) {
    console.error('Groq transcription error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/voice/profile', (req, res) => {
  res.json({ success: true, profile: voiceProfile });
});

app.post('/api/voice/profile', (req, res) => {
  try {
    const { userName, customKeywords, micSensitivity, samplesCount } = req.body;
    voiceProfile = {
      trained: true,
      userName: userName || 'Atharva',
      calibratedAt: new Date().toISOString(),
      customPromptKeywords: customKeywords || voiceProfile.customPromptKeywords,
      micSensitivity: micSensitivity || 1.0,
      samplesCount: samplesCount || 4
    };

    // Persist to disk
    try {
      fs.writeFileSync(voiceProfileFile, JSON.stringify(voiceProfile, null, 2), 'utf8');
    } catch (fsErr) {
      console.warn('Failed to persist voice_profile.json:', fsErr.message);
    }

    res.json({ success: true, profile: voiceProfile, message: 'Voice profile trained and calibrated!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/groq/status', (req, res) => {
  res.json({
    configured: isGroqConfigured(),
    modelSTT: 'whisper-large-v3-turbo',
    modelLLM: 'llama-3.3-70b-versatile'
  });
});

app.post('/api/groq/configure', (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey || !apiKey.trim().startsWith('gsk_')) {
      return res.status(400).json({ success: false, error: 'Invalid Groq API key format. Key should start with gsk_' });
    }
    process.env.GROQ_API_KEY = apiKey.trim();

    // Persist to .env file
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (envContent.includes('GROQ_API_KEY=')) {
      envContent = envContent.replace(/GROQ_API_KEY=.*/, `GROQ_API_KEY=${apiKey.trim()}`);
    } else {
      envContent += `\nGROQ_API_KEY=${apiKey.trim()}\n`;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');

    res.json({ success: true, message: 'Groq API key configured successfully! Whisper and Llama 3.3 are now active.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// System health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    app: 'AURA - Atharva\'s Intelligent Reminder Assistant',
    database: 'SQLite (node:sqlite)',
    groqConfigured: isGroqConfigured(),
    timestamp: new Date().toISOString()
  });
});

// Global 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'API endpoint not found' });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Start Express server
const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 AURA Backend Server running on http://localhost:${PORT}`);
  console.log(`📂 SQLite database initialized at backend/data/aura.db`);
  console.log(`🤖 Local NLP Engine: Rule-Based + Naive Bayes ML ready`);
  console.log(`=======================================================`);
});

module.exports = { app, server };
