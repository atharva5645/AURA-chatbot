const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config);
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'API request failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  // Stats
  getStats: () => request('/stats'),
  clearAllData: () => request('/stats/clear-all-data', { method: 'POST' }),
  resetSampleData: () => request('/stats/reset-sample-data', { method: 'POST' }),

  // Meetings
  getMeetings: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/meetings${query ? `?${query}` : ''}`);
  },
  getMeeting: (id) => request(`/meetings/${id}`),
  createMeeting: (data) => request('/meetings', { method: 'POST', body: data }),
  updateMeeting: (id, data) => request(`/meetings/${id}`, { method: 'PUT', body: data }),
  deleteMeeting: (id) => request(`/meetings/${id}`, { method: 'DELETE' }),

  // Reminders
  getReminders: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reminders${query ? `?${query}` : ''}`);
  },
  getReminder: (id) => request(`/reminders/${id}`),
  createReminder: (data) => request('/reminders', { method: 'POST', body: data }),
  updateReminder: (id, data) => request(`/reminders/${id}`, { method: 'PUT', body: data }),
  toggleReminder: (id) => request(`/reminders/${id}/toggle`, { method: 'PATCH' }),
  deleteReminder: (id) => request(`/reminders/${id}`, { method: 'DELETE' }),

  // Chat
  sendChatMessage: (message, sessionId = 'default', classifierMode = 'rule_based') =>
    request('/chat', {
      method: 'POST',
      body: { message, sessionId, classifierMode }
    }),
  confirmChatAction: (sessionId = 'default', confirmed = true) =>
    request('/chat/confirm', {
      method: 'POST',
      body: { sessionId, confirmed }
    }),
  getChatHistory: (sessionId = 'default') =>
    request(`/chat/history?sessionId=${encodeURIComponent(sessionId)}`),
  clearChatHistory: (sessionId = 'default') =>
    request(`/chat/history?sessionId=${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),

  // Groq AI Integration (Whisper Large v3 + Llama 3.3 70B)
  getGroqStatus: () => request('/groq/status'),
  configureGroq: (apiKey) =>
    request('/groq/configure', {
      method: 'POST',
      body: { apiKey }
    }),
  transcribeAudioWithGroq: (audioBase64, mimeType = 'audio/webm') =>
    request('/groq/transcribe', {
      method: 'POST',
      body: { audio: audioBase64, mimeType }
    }),

  // Voice Training & Calibration
  getVoiceProfile: () => request('/voice/profile'),
  saveVoiceProfile: (profileData) =>
    request('/voice/profile', {
      method: 'POST',
      body: profileData
    }),

  // Classifier
  getClassifierStatus: () => request('/classifier/status'),
  trainClassifier: () => request('/classifier/train', { method: 'POST' }),
  predictIntent: (text, mode = 'rule_based') =>
    request('/classifier/predict', { method: 'POST', body: { text, mode } })
};
