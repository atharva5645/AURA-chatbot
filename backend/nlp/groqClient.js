/**
 * Groq AI Client for AURA
 * Powers Whisper Large v3 (Speech-to-Text) and Llama 3.3 70B (Conversational Intelligence)
 * Zero external dependencies — uses Node 24 native fetch, FormData, and Blob.
 */

function getGroqApiKey() {
  return process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : '';
}

function isGroqConfigured() {
  const key = getGroqApiKey();
  return Boolean(key && key.startsWith('gsk_') && key.length > 15);
}

/**
 * Transcribe Audio via Groq Whisper Large v3
 * @param {string} base64Data - Base64 audio string
 * @param {string} mimeType - e.g. 'audio/webm' or 'audio/wav'
 * @param {string} customPrompt - Personalized training keywords for user's voice
 */
async function transcribeAudioWithGroq(base64Data, mimeType = 'audio/webm', customPrompt = null) {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured in backend/.env');
  }

  // Convert base64 to binary buffer
  const cleanBase64 = base64Data.replace(/^data:audio\/\w+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  
  // Determine file extension
  let extension = 'webm';
  if (mimeType.includes('wav')) extension = 'wav';
  else if (mimeType.includes('ogg')) extension = 'ogg';
  else if (mimeType.includes('mp4') || mimeType.includes('m4a')) extension = 'm4a';

  const blob = new Blob([buffer], { type: mimeType });
  const formData = new FormData();
  formData.append('file', blob, `speech.${extension}`);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('temperature', '0.0');
  formData.append('response_format', 'json');

  let promptText = 'AURA, Atharva, Hello AURA, meeting, schedule, reminder, tomorrow, of the next date, 3 PM';
  if (customPrompt) {
    promptText += `, ${customPrompt}`;
  }
  formData.append('prompt', promptText);

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Groq Whisper Transcription error:', response.status, errorText);
    throw new Error(`Groq Whisper error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return (data.text || '').trim();
}

/**
 * Conversational Reasoning via Groq Llama 3.3 70B
 * Extracts intents, relative dates ("of the next date", "tomorrow", "Friday"), times ("3 PM", "4 in evening"),
 * resolves conflicts, and generates natural assistant replies.
 */
async function processChatMessageWithGroq({
  userMessage,
  history = [],
  currentDateStr,
  currentScheduleSummary = []
}) {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured in backend/.env');
  }

  const systemPrompt = `You are AURA, Atharva's brilliant, warm, and highly capable AI companion — combining the conversational depth, intelligence, and natural dialogue of ChatGPT and Gemini with real-time meeting and reminder management.

Today's Date: ${currentDateStr} (Reference for "today", "tomorrow", "next date", "next Monday", etc.)
Current Time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (Live real-time reference)
Upcoming Calendar Events:
${JSON.stringify(currentScheduleSummary, null, 2)}

You can converse effortlessly and intelligently about ANY topic, exactly like ChatGPT or Gemini:
- Responding warmly to greetings ("hii", "hello", "how are you", "what's up", "hey")
- Explaining complex concepts in computer science, engineering, physics, math, history, and biology
- Writing, debugging, or reviewing code with clean syntax
- Brainstorming college projects, career guidance, study roadmaps, and interview preparation
- Engaging in creative writing, storytelling, humor, and casual everyday banter
- Managing calendar meetings and reminders when explicitly requested

Your output must ALWAYS be a valid JSON object matching this schema:
{
  "intent": "schedule_meeting" | "create_reminder" | "list_schedule" | "reschedule_meeting" | "cancel_meeting" | "greeting" | "help" | "general_chat",
  "title": "<Only for schedule/reminder: brief title 1-4 words, otherwise empty string>",
  "date": "YYYY-MM-DD or null",
  "startTime": "HH:MM (24-hr format) or null",
  "endTime": "HH:MM (24-hr format) or null (default to startTime + 1 hour)",
  "attendees": "<Names of attendees or empty string>",
  "targetQuery": "<For reschedule/cancel: name or time of event to change>",
  "needsFollowUp": true | false,
  "followUpQuestion": "<If missing date or time for a requested meeting, polite concise follow-up>",
  "reply": "<Your full, beautifully formatted Markdown response to Atharva (like ChatGPT/Gemini)>",
  "speechText": "<Natural, conversational spoken version for TTS (clean, concise, no markdown symbols)>"
}

CRITICAL RULES:
1. CHATGPT/GEMINI CONVERSATIONAL STYLE:
   - When Atharva says "hii", "hello", "hey", "how are you", or checks in, respond warmly, naturally, and engagingly!
   - For any question, thought, explanation, coding task, or discussion, provide a rich, articulate, and helpful response in "reply" with Markdown formatting (bullet points, bold text, code blocks when appropriate).
   - Never be cold, rigid, or repetitive. Be a delightful, supportive AI assistant!
2. STRICT SCHEDULING ENFORCEMENT:
   - ONLY classify intent as "schedule_meeting" if Atharva EXPLICITLY asks to schedule, book, or set up a meeting (e.g. "Schedule project review tomorrow at 3 PM", "Book a meeting of the next date at 4 PM").
   - NEVER classify casual remarks, thank-you messages, greetings ("hii", "hello", "hey"), or general conversation as "schedule_meeting"!
   - For all non-calendar messages, classify as "general_chat" or "greeting".
3. REAL-TIME CALENDAR RULES:
   - "next date", "of the next date", "next day", "tomorrow" ALWAYS resolve to the date immediately after ${currentDateStr}.
   - If time is given (e.g. "3 PM", "15:00", "4 in evening"), parse into 24-hr startTime (e.g. "15:00", "16:00") and default endTime to 1 hour later.
   - "title" must ALWAYS be a clean 1-4 word title (e.g. "Dog Meeting", "Project Review", "Team Sync").
4. LIST SCHEDULE & SLOTS & REMINDERS:
   - If Atharva asks about meetings, agenda, scheduled meetings, charts, or set reminders ("can you tell me the meeting slots", "show the meetings list which i have scheduled", "what meetings do i have", "show me all the scheduled meetings", "show the scheduled meeting chart", "what reminder i have set", "show me what remainder i have set", "show my reminders", "list my reminders", "what reminders do i have"), classify intent as "list_schedule".
5. CANCEL & DELETE:
   - If Atharva asks to cancel or delete ("delete the meeting", "cancel my 4 PM meeting"), classify intent as "cancel_meeting".
6. Return ONLY raw JSON without markdown code fences or backticks.`;

  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // Include recent conversation history (last 8 turns for rich ChatGPT/Gemini context memory)
  if (Array.isArray(history)) {
    const recent = history.slice(-8);
    for (const msg of recent) {
      if (msg.role && msg.content) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  messages.push({ role: 'user', content: userMessage });

function extractJsonFromLlm(text) {
  if (!text) return {};
  let cleaned = text.trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {}

  // Match isolated JSON blocks if multiple were concatenated by the LLM
  const matches = cleaned.match(/\{[\s\S]*?\}(?=\s*\{|\s*$)/g);
  if (matches && matches.length > 0) {
    for (let i = matches.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(matches[i]);
      } catch (err) {}
    }
  }

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (err) {}
  }
  return {};
}

  let response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages,
      temperature: 0.5
    })
  });

  // If primary model hits rate limit (429) or temporary error, fall back to ultra-fast 20B model
  if (!response.ok && response.status === 429) {
    console.warn('Groq 120B model rate-limited. Falling back to openai/gpt-oss-20b...');
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages,
        temperature: 0.5
      })
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Groq Chat Completion error:', response.status, errorText);
    throw new Error(`Groq Chat error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || '{}';

  try {
    return extractJsonFromLlm(rawContent);
  } catch (err) {
    console.error('Failed to parse Groq JSON response:', rawContent);
    throw err;
  }
}

module.exports = {
  isGroqConfigured,
  transcribeAudioWithGroq,
  processChatMessageWithGroq
};
