const { db, checkMeetingConflict, formatDate } = require('./db');
const { parseDate, parseTime, formatTime12, formatDateISO } = require('./nlp/dateParser');
const { extractEntities } = require('./nlp/entityExtractor');
const { classifyIntent, hasExplicitSchedulingKeywords } = require('./nlp/intentClassifier');
const { isGroqConfigured, processChatMessageWithGroq } = require('./nlp/groqClient');
const { answerGeneralQuestion } = require('./nlp/localKnowledge');

// In-memory conversation state per session
const sessions = new Map();

function getSession(sessionId = 'default') {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      pendingAction: null,
      history: []
    });
  }
  return sessions.get(sessionId);
}

function clearSessionPending(sessionId = 'default') {
  const session = getSession(sessionId);
  session.pendingAction = null;
}

/**
 * Checks if input is a general inquiry, factual question, or conversation prompt
 */
function isGeneralQuestionOrChat(text) {
  const lower = text.toLowerCase().trim();
  if (/\b(?:thank\s+you|thanks|thank\s+u|thx|appreciate\s+it|good\s+job|well\s+done)\b/i.test(lower)) {
    return true;
  }
  const questionWords = /^(?:what|who|where|when|why|how|which|whose|whom|is|are|am|was|were|do|does|did|can|could|will|would|should|tell\s+me|explain|define|calculate|solve|give\s+me|show\s+me\s+how)\b/i;
  if (questionWords.test(lower)) {
    if (/\b(?:schedule|calendar|agenda|meetings?|reminders?|appointments?)\b/i.test(lower)) {
      return false;
    }
    return true;
  }
  if (/\b(?:tell\s+me\s+a\s+joke|joke|fun\s+fact|who\s+are\s+you|who\s+made\s+you|how\s+are\s+you|what\s+can\s+you\s+do|study\s+tips)\b/i.test(lower)) {
    return true;
  }
  return false;
}

/**
 * Main Chat Processing Function (supports Groq AI with automatic local NLP fallback)
 */
async function processUserMessage(rawMessage, sessionId = 'default', classifierMode = 'rule_based') {
  const session = getSession(sessionId);
  const text = rawMessage.trim();
  const lower = text.toLowerCase();

  // Track conversation history (capped at 12 recent entries)
  session.history = session.history || [];
  session.history.push({ role: 'user', content: text });
  if (session.history.length > 12) session.history = session.history.slice(-12);

  // If user is in the middle of a pending action, but gives a new command, asks about schedule/slots, or asks a general question:
  if (session.pendingAction) {
    const parsedD = parseDate(text);
    const parsedT = parseTime(text);
    const isAffirmative = /^(?:yes|yep|yeah|sure|confirm|proceed|ok|okay|do it|save it|looks good|go ahead)\b/i.test(lower);
    const isCancelCommand = /^(?:no|cancel|abort|stop|never mind|nevermind|dont|don't|discard)\b/i.test(lower);
    // A wake-only greeting starts a fresh conversation. It must never be
    // interpreted as the missing date/time for an old schedule draft.
    const isWakeOnlyGreeting = /^(?:hey|hi|hello|ok|okay|yo)\s+(?:aura|aurora|arora|ora|oura|ara|laura|haura|assistant)\s*[!.?]*$/i.test(text);
    const isNewIntent =
      /\b(?:show|list|tell\s+me|check|view|display)\s+(?:all\s+|the\s+|my\s+)?(?:meetings?|schedule|slots?|reminders?|agenda|calendar)\b/i.test(lower) ||
      /\b(?:meeting\s+slots?|available\s+slots?|free\s+slots?)\b/i.test(lower) ||
      /\b(?:delete|cancel|remove)\s+(?:the\s+|a\s+|my\s+)?(?:meeting|reminder)\b/i.test(lower) ||
      isWakeOnlyGreeting ||
      isGeneralQuestionOrChat(text) ||
      (text.endsWith('?') && !parsedD && !parsedT);

    if (session.pendingAction.type === 'await_cancel_selection') {
      // Kept intact to be processed in pendingAction section below
    } else if (isNewIntent && !isAffirmative && !isCancelCommand && !parsedD && !parsedT) {
      console.log('Clearing stale pendingAction due to new user command / inquiry:', text);
      session.pendingAction = null;
    }
  }

  // 1. Check if user is confirming or cancelling an active pending action
  if (session.pendingAction) {
    const { type, step, draft, conflictData } = session.pendingAction;

    // Handle interactive selection when deleting one of multiple meetings
    if (type === 'await_cancel_selection') {
      const meetings = session.pendingAction.meetings || [];
      const lowerTrim = lower.trim();

      if (/^(?:no|abort|stop|never mind|nevermind|keep|keep\s+them)\b/i.test(lowerTrim)) {
        session.pendingAction = null;
        return {
          reply: "Okay, I kept all your scheduled meetings.",
          speechText: "Okay, I kept all your scheduled meetings.",
          card: null
        };
      }

      if (/^(?:all|both|every|delete\s+all|remove\s+all)\b/i.test(lowerTrim)) {
        db.prepare('DELETE FROM meetings').run();
        session.pendingAction = null;
        return {
          reply: "🗑️ **All scheduled meetings have been deleted** from your calendar.",
          speechText: "All scheduled meetings have been deleted.",
          card: null
        };
      }

      let selectedMeeting = null;
      if (/^(?:1|first|the\s+first(?:\s+one)?|number\s*1)\b/i.test(lowerTrim) && meetings[0]) {
        selectedMeeting = meetings[0];
      } else if (/^(?:2|second|the\s+second(?:\s+one)?|number\s*2)\b/i.test(lowerTrim) && meetings[1]) {
        selectedMeeting = meetings[1];
      } else if (/^(?:3|third|the\s+third(?:\s+one)?|number\s*3)\b/i.test(lowerTrim) && meetings[2]) {
        selectedMeeting = meetings[2];
      } else {
        selectedMeeting = meetings.find(m => lowerTrim.includes(m.title.toLowerCase()) || (m.start_time && lowerTrim.includes(m.start_time)));
      }

      if (selectedMeeting) {
        db.prepare('DELETE FROM meetings WHERE id = ?').run(selectedMeeting.id);
        session.pendingAction = null;
        return {
          reply: `🗑️ **Meeting Deleted in Real-Time:**\n\n` +
            `📅 **"${selectedMeeting.title}"** on ${selectedMeeting.date} at ${formatTime12(selectedMeeting.start_time)} has been deleted from your calendar.`,
          speechText: `${selectedMeeting.title} has been deleted from your calendar.`,
          card: {
            type: 'success_badge',
            title: selectedMeeting.title,
            action: 'cancelled'
          }
        };
      }
    }

    // Direct affirmative
    if (/^(?:yes|yep|yeah|sure|confirm|proceed|ok|okay|do it|save it|looks good|go ahead)\b/i.test(lower)) {
      if (step === 'confirm') {
        return executePendingAction(session);
      }
    }

    // Direct cancellation
    if (/^(?:no|cancel|abort|stop|never mind|nevermind|dont|don't|discard)\b/i.test(lower)) {
      session.pendingAction = null;
      return {
        reply: "Action cancelled. Let me know if you need help with anything else!",
        card: null,
        speechText: "Action cancelled."
      };
    }

    // Handling follow-ups when awaiting specific entities
    if (step === 'await_title') {
      // The whole message is likely the title
      draft.title = text.replace(/^(?:the\s+title\s+is|it's|call\s+it)\s+/i, '').trim();
      if (type === 'create_reminder') {
        try {
          const result = db.prepare(`
            INSERT INTO reminders (title, date, time, lead_time_minutes, completed, priority, notes)
            VALUES (?, ?, ?, ?, 0, ?, ?)
          `).run(
            draft.title,
            draft.date,
            draft.time,
            draft.leadTimeMinutes || 15,
            draft.priority || 'medium',
            draft.notes || ''
          );
          session.pendingAction = null;
          return {
            reply: `Reminder set for **${draft.title}** on ${draft.date} at ${formatTime12(draft.time)}.`,
            speechText: `Reminder set for ${draft.title} at ${formatTime12(draft.time)}.`,
            card: { type: 'success_badge', reminderId: result.lastInsertRowid, title: draft.title }
          };
        } catch (err) {
          return { reply: `Failed to save reminder: ${err.message}`, speechText: 'There was an error saving your reminder.', card: null };
        }
      }
      return evaluateSchedulingReadiness(session);
    }

    if (step === 'await_date_time' || step === 'await_date' || step === 'await_time') {
      const entities = extractEntities(text);
      const parsedD = parseDate(text);
      const parsedT = parseTime(text);

      if (parsedD) draft.date = parsedD.date;
      else if (entities.date) draft.date = entities.date;

      if (parsedT) {
        draft.startTime = parsedT.startTime;
        draft.endTime = parsedT.endTime;
        draft.time = parsedT.startTime;
      } else if (entities.startTime) {
        draft.startTime = entities.startTime;
        draft.endTime = entities.endTime;
        draft.time = entities.startTime;
      }

      // If local regex didn't catch the date or time and Groq is active, use Groq extraction
      if ((!draft.date || !draft.startTime) && isGroqConfigured()) {
        try {
          const quickRes = await processChatMessageWithGroq({
            userMessage: text,
            currentDateStr: formatDateISO(new Date()),
            currentScheduleSummary: []
          });
          if (quickRes.date && !draft.date) draft.date = quickRes.date;
          if (quickRes.startTime && !draft.startTime) {
            draft.startTime = quickRes.startTime;
            draft.endTime = quickRes.endTime;
            draft.time = quickRes.startTime;
          }
        } catch (e) { }
      }

      // Only update title if not in await_time mode (answering a time follow-up shouldn't overwrite the title)
      if (step !== 'await_time' && entities.title && !['meeting', 'project meeting'].includes(entities.title.toLowerCase())) {
        draft.title = entities.title;
      }
      if (entities.attendees) {
        draft.attendees = entities.attendees;
      }

      return evaluateSchedulingReadiness(session);
    }

    if (step === 'resolve_conflict') {
      // User might select one of the suggested slots or state a new time
      // E.g. "slot 1", "use 4 PM", "at 4", "change to 2 PM"
      const parsedT = parseTime(text);
      if (parsedT) {
        draft.startTime = parsedT.startTime;
        draft.endTime = parsedT.endTime;
        return evaluateSchedulingReadiness(session);
      }

      if (/slot\s*1|first/i.test(lower) && conflictData?.suggestedSlots?.[0]) {
        draft.startTime = conflictData.suggestedSlots[0].start_time;
        draft.endTime = conflictData.suggestedSlots[0].end_time;
        return evaluateSchedulingReadiness(session);
      }

      if (/slot\s*2|second/i.test(lower) && conflictData?.suggestedSlots?.[1]) {
        draft.startTime = conflictData.suggestedSlots[1].start_time;
        draft.endTime = conflictData.suggestedSlots[1].end_time;
        return evaluateSchedulingReadiness(session);
      }
    }
  }

  // Deterministic reminder commands must preserve the locally parsed time.
  // Do this before the optional LLM path, whose incomplete responses can fall
  // back to a default time despite an explicit time in the user's message.
  const localClassification = classifyIntent(text, classifierMode);
  if (localClassification.intent === 'create_reminder') {
    return handleCreateReminderIntent(session, extractEntities(text), localClassification);
  }

  // 1.5. Groq Llama 3.3 AI Reasoning (if API key configured)
  if (isGroqConfigured()) {
    try {
      const todayStr = formatDateISO(new Date());
      const upcomingMeetings = db.prepare(`
        SELECT title, date, start_time, end_time, attendees
        FROM meetings
        WHERE date >= ?
        ORDER BY date ASC, start_time ASC
        LIMIT 5
      `).all(todayStr);

      const groqResult = await processChatMessageWithGroq({
        userMessage: text,
        history: session.history || [],
        currentDateStr: todayStr,
        currentScheduleSummary: upcomingMeetings
      });

      console.log('🤖 Groq AI Analysis:', groqResult);

      if (groqResult && groqResult.intent) {
        if (groqResult.intent === 'schedule_meeting') {
          // STRICT SAFETY GUARD: Only schedule if user explicitly uttered scheduling commands
          if (!hasExplicitSchedulingKeywords(text)) {
            console.log('🛡️ Blocked false positive schedule_meeting intent on non-scheduling input:', text);
            const generalReply = {
              reply: groqResult.reply || "You're very welcome, Atharva! Let me know if you need to schedule a meeting, set a reminder, or ask a question.",
              speechText: groqResult.speechText || "You're very welcome! Let me know if you need anything else.",
              card: null
            };
            session.history.push({ role: 'assistant', content: generalReply.reply });
            return generalReply;
          }

          session.pendingAction = {
            type: 'create_meeting',
            step: 'confirm',
            draft: {
              title: groqResult.title || 'Project Meeting',
              date: groqResult.date,
              startTime: groqResult.startTime,
              endTime: groqResult.endTime,
              attendees: groqResult.attendees || '',
              description: 'Scheduled via AURA AI'
            }
          };
          return evaluateSchedulingReadiness(session);
        }

        if (groqResult.intent === 'create_reminder') {
          const remTitle = groqResult.title || 'Reminder';
          const remDate = groqResult.date || todayStr;
          const remTime = groqResult.startTime || groqResult.time || '18:00';
          try {
            const stmt = db.prepare(`
              INSERT INTO reminders (title, date, time, lead_time_minutes, completed, priority, notes)
              VALUES (?, ?, ?, 15, 0, 'medium', '')
            `);
            const res = stmt.run(remTitle, remDate, remTime);
            session.pendingAction = null;
            const timeFormatted = formatTime12(remTime);

            return {
              reply: `🔔 **Reminder Set in Real-Time!**\n\n` +
                `📝 **Task:** ${remTitle}\n` +
                `📆 **Date:** ${remDate}\n` +
                `⏰ **Time:** ${timeFormatted}\n\n` +
                `Your reminder is saved and active!`,
              speechText: `Reminder set for ${remTitle} at ${timeFormatted} on ${remDate}.`,
              card: {
                type: 'success_badge',
                reminderId: res.lastInsertRowid,
                title: remTitle,
                date: remDate,
                time: timeFormatted
              }
            };
          } catch (err) {
            console.error('Groq reminder insert failed:', err);
          }
        }

        if (groqResult.intent === 'list_schedule') {
          return handleListScheduleIntent(session, { listScope: 'all' }, text.toLowerCase());
        }

        if (groqResult.intent === 'reschedule_meeting') {
          const entities = extractEntities(text);
          if (groqResult.targetQuery) entities.targetQuery = groqResult.targetQuery;
          if (groqResult.date) entities.newDate = groqResult.date;
          if (groqResult.startTime) entities.newTime = groqResult.startTime;
          return handleRescheduleIntent(session, entities);
        }

        if (groqResult.intent === 'cancel_meeting') {
          const entities = extractEntities(text);
          if (groqResult.targetQuery) entities.targetQuery = groqResult.targetQuery;
          if (groqResult.startTime) entities.targetTime = groqResult.startTime;
          return handleCancelIntent(session, entities);
        }

        const generalReply = {
          reply: groqResult.reply || "I'm ready to help! What's on your mind?",
          speechText: groqResult.speechText || groqResult.reply,
          card: null
        };
        session.history.push({ role: 'assistant', content: generalReply.reply });
        return generalReply;
      }
    } catch (groqErr) {
      console.warn('Groq AI processing failed, falling back to local NLP engine:', groqErr.message);
    }
  }

  // 2. Classify the request before using the general-knowledge fallback. This
  // preserves commands such as "tell me the meeting slots", which otherwise
  // look like an open-ended chat request.
  const classification = localClassification;
  const entities = extractEntities(text);
  const intent = classification.intent;

  // 3. Dispatch to handler based on intent
  switch (intent) {
    case 'gratitude':
      return {
        reply: "You're very welcome, Atharva! 😊 Let me know anytime you want to schedule a meeting, set a reminder, or ask a question.",
        speechText: "You're very welcome! Let me know if you need anything else.",
        card: null
      };

    case 'schedule_meeting':
      // Safety guard: Ensure user actually requested to schedule a meeting
      if (!hasExplicitSchedulingKeywords(text)) {
        const fallbackQA = await answerGeneralQuestion(text);
        if (fallbackQA) {
          session.history.push({ role: 'assistant', content: fallbackQA.reply });
          return fallbackQA;
        }
        return {
          reply: "I'm here! If you'd like to schedule a meeting, say **'Schedule a meeting [title] at [time]'**. You can also ask me questions or check your calendar.",
          speechText: "I'm here! If you want to schedule a meeting, please say 'schedule a meeting' along with the time.",
          card: null
        };
      }
      return handleScheduleMeetingIntent(session, entities, classification);

    case 'create_reminder':
      return handleCreateReminderIntent(session, entities, classification);

    case 'list_schedule':
      return handleListScheduleIntent(session, entities, lower);

    case 'reschedule_meeting':
      return handleRescheduleIntent(session, entities);

    case 'cancel_meeting':
      return handleCancelIntent(session, entities);

    case 'greeting':
      return {
        reply: "Hello Atharva! I'm AURA, your Intelligent Reminder and Scheduling Assistant. How can I help you today? You can ask me to schedule meetings, set reminders, or check your upcoming schedule.",
        speechText: "Hello Atharva! I'm AURA, your intelligent reminder assistant. How can I help you today?",
        card: {
          type: 'help_chips',
          title: 'Quick Suggestions',
          chips: [
            'Schedule project meeting tomorrow at 3 PM',
            'Remind me to submit assignment at 6 PM',
            'What meetings do I have this week?',
            'List all my reminders'
          ]
        }
      };

    case 'help':
      return {
        reply: "Here is what I can do for you:\n" +
          "• **Schedule meetings**: e.g., 'Schedule project review tomorrow at 3 PM with Neha'\n" +
          "• **Set reminders**: e.g., 'Remind me to submit assignment at 6 PM'\n" +
          "• **Check agenda**: e.g., 'What meetings do I have this week?' or 'Show my reminders'\n" +
          "• **Reschedule**: e.g., 'Move my project meeting to Friday at 2 PM'\n" +
          "• **Cancel**: e.g., 'Cancel my 4 PM meeting'\n\n" +
          "You can also use the microphone button to speak naturally, and I will read replies aloud!",
        speechText: "I can help you schedule meetings, set reminders, check your agenda, or reschedule and cancel events. Try asking me to schedule a meeting or set a reminder.",
        card: {
          type: 'help_chips',
          title: 'Try these commands',
          chips: [
            'Schedule a meeting tomorrow at 3 PM',
            'Remind me to study at 8 PM',
            'What meetings do I have today?',
            'Cancel my 4 PM meeting'
          ]
        }
      };

    default: {
      const fallbackQA = await answerGeneralQuestion(text);
      if (fallbackQA) {
        session.history.push({ role: 'assistant', content: fallbackQA.reply });
        return fallbackQA;
      }
      return {
        reply: `👋 I'm here, Atharva! As your AI assistant, you can chat with me about anything — explanations, code, ideas, or managing your calendar and reminders.\n\nWhat would you like to explore or work on?`,
        speechText: "I'm here, Atharva! What would you like to explore or work on today?",
        card: {
          type: 'help_chips',
          title: 'You can ask me:',
          chips: [
            'What is machine learning?',
            'How to prepare for an interview?',
            'Can you tell me the meeting slots?',
            'Schedule project meeting tomorrow at 3 PM'
          ]
        }
      };
    }
  }
}

/**
 * Handle Schedule Meeting Intent
 */
function handleScheduleMeetingIntent(session, entities, classification) {
  session.pendingAction = {
    type: 'create_meeting',
    step: 'init',
    draft: {
      title: entities.title || '',
      date: entities.date || null,
      startTime: entities.startTime || null,
      endTime: entities.endTime || null,
      attendees: entities.attendees || '',
      location: 'Campus / Online',
      notes: ''
    },
    meta: classification
  };

  return evaluateSchedulingReadiness(session);
}

/**
 * Checks if draft meeting has all necessary fields, checks conflicts, and asks follow-ups or confirmation
 */
function evaluateSchedulingReadiness(session) {
  const { draft } = session.pendingAction;

  // Sync time and startTime if one is set
  if (!draft.startTime && draft.time) {
    draft.startTime = draft.time;
  }
  if (!draft.time && draft.startTime) {
    draft.time = draft.startTime;
  }

  // Default title if omitted by user or if conversational clutter was transcribed
  const isBadTitle = !draft.title ||
    draft.title.trim().length === 0 ||
    draft.title.split(/\s+/).length > 5 ||
    /\b(?:is\s+basically|basically\s+for|better\s+waiting|and\s+also|timing\s+of|the\s+meeting\s+is|what\s+about|could\s+you)\b/i.test(draft.title) ||
    (draft.attendees && draft.title.toLowerCase() === draft.attendees.toLowerCase());

  if (isBadTitle) {
    if (draft.attendees) {
      draft.title = `Meeting with ${draft.attendees}`;
    } else {
      draft.title = 'Project Meeting';
    }
  }

  // Check 1: Missing Date
  if (!draft.date) {
    session.pendingAction.step = 'await_date_time';
    // Do not make the user repeat a time that was already understood.
    const timeAlreadyCaptured = draft.startTime
      ? `I have the time as ${formatTime12(draft.startTime)}. What date should I schedule "${draft.title}" for? (e.g. 'tomorrow' or 'next Friday')`
      : `What date and time would you like to schedule "${draft.title}" for? (e.g. 'tomorrow at 3 PM' or 'next date at 4 PM')`;
    return {
      reply: timeAlreadyCaptured,
      speechText: draft.startTime
        ? `I have the time as ${formatTime12(draft.startTime)}. What date should I schedule ${draft.title} for?`
        : `What date and time would you like to schedule ${draft.title} for?`,
      card: null
    };
  }

  // Check 2: Missing Start Time
  if (!draft.startTime) {
    session.pendingAction.step = 'await_time';
    return {
      reply: `Date set for ${draft.date}. At what time should I schedule "${draft.title}"? (e.g., '3 PM', '10:30 AM', or 'from 2 to 3 PM')`,
      speechText: `At what time should I schedule the meeting on ${draft.date}?`,
      card: null
    };
  }

  // Ensure end time exists (default to 1 hour after start time)
  if (!draft.endTime) {
    const [h, m] = draft.startTime.split(':').map(Number);
    draft.endTime = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Check 4: Time Conflict Detection
  const conflict = checkMeetingConflict(draft.date, draft.startTime, draft.endTime);
  if (conflict.hasConflict) {
    session.pendingAction.step = 'resolve_conflict';
    session.pendingAction.conflictData = conflict;

    const confTitle = conflict.conflictingMeeting.title;
    const confStart = formatTime12(conflict.conflictingMeeting.start_time);
    const confEnd = formatTime12(conflict.conflictingMeeting.end_time);

    let alternativesText = '';
    const suggestedSlots = conflict.suggestedSlots || [];
    if (suggestedSlots.length > 0) {
      alternativesText = suggestedSlots.map((s, idx) =>
        `• Slot ${idx + 1}: **${formatTime12(s.start_time)} - ${formatTime12(s.end_time)}**`
      ).join('\n');
    }

    return {
      reply: `⚠️ **Time Conflict Warning:** You already have **"${confTitle}"** scheduled on ${draft.date} from ${confStart} to ${confEnd}.\n\n` +
        (alternativesText
          ? `Here are alternative available slots on ${draft.date}:\n${alternativesText}\n\nWould you like to move to one of these slots or pick a different time?`
          : `Please choose another time or date to avoid overlap.`),
      speechText: `Time conflict detected with ${confTitle}. Would you like to pick an alternative slot?`,
      card: {
        type: 'conflict_options',
        title: 'Conflict Detected',
        conflictWith: confTitle,
        suggestedSlots: suggestedSlots.map(s => ({
          label: `${formatTime12(s.start_time)} - ${formatTime12(s.end_time)}`,
          startTime: s.start_time,
          endTime: s.end_time
        }))
      }
    };
  }

  // Automatically schedule and save the meeting in real-time
  try {
    const stmt = db.prepare(`
      INSERT INTO meetings (title, date, start_time, end_time, attendees, location, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      draft.title,
      draft.date,
      draft.startTime,
      draft.endTime,
      draft.attendees || '',
      draft.location || 'Campus / Online',
      draft.notes || 'Scheduled in real-time via AURA'
    );
    const meetingId = res.lastInsertRowid;
    session.pendingAction = null; // Successfully executed

    const timeFormatted = `${formatTime12(draft.startTime)} - ${formatTime12(draft.endTime)}`;

    return {
      reply: `✅ **Successfully Scheduled in Real-Time!**\n\n` +
        `📅 **Title:** ${draft.title}\n` +
        `📆 **Date:** ${draft.date}\n` +
        `⏰ **Time:** ${timeFormatted}\n` +
        (draft.attendees ? `👥 **Attendees:** ${draft.attendees}\n\n` : '\n') +
        `Your meeting is confirmed and stored in your live calendar!`,
      speechText: `I have scheduled ${draft.title} on ${draft.date} from ${formatTime12(draft.startTime)} to ${formatTime12(draft.endTime)}.`,
      card: {
        type: 'success_badge',
        meetingId,
        title: draft.title,
        date: draft.date,
        time: timeFormatted,
        startTime: draft.startTime,
        endTime: draft.endTime,
        attendees: draft.attendees
      }
    };
  } catch (err) {
    console.error('Failed to insert meeting in real-time:', err);
    return {
      reply: `❌ Failed to save meeting: ${err.message}`,
      speechText: "There was an error saving your meeting.",
      card: null
    };
  }
}

/**
 * Handle Create Reminder Intent
 */
function handleCreateReminderIntent(session, entities, classification) {
  const now = new Date();
  const defaultDate = formatDate(now);

  const title = entities.title || '';
  const date = entities.date || defaultDate;
  const time = entities.startTime || '18:00'; // Default evening reminder if unspecified

  if (!title || title.trim().length === 0) {
    session.pendingAction = {
      type: 'create_reminder',
      step: 'await_title',
      draft: {
        date,
        time,
        leadTimeMinutes: entities.leadTimeMinutes || 15,
        priority: 'medium'
      }
    };
    return {
      reply: `What would you like me to remind you about? I will set it for ${date} at ${formatTime12(time)}.`,
      speechText: `What would you like me to remind you about? I will set it for ${formatTime12(time)}.`,
      card: null
    };
  }

  // Automatically save reminder in real-time
  try {
    const leadTime = entities.leadTimeMinutes || 15;
    const stmt = db.prepare(`
      INSERT INTO reminders (title, date, time, lead_time_minutes, completed, priority, notes)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `);
    const res = stmt.run(title, date, time, leadTime, 'medium', '');
    session.pendingAction = null;

    const timeFormatted = formatTime12(time);

    return {
      reply: `🔔 **Reminder Set in Real-Time!**\n\n` +
        `📝 **Task:** ${title}\n` +
        `📆 **Date:** ${date}\n` +
        `⏰ **Time:** ${timeFormatted}\n` +
        `⏳ **Alert:** ${leadTime} mins prior\n\n` +
        `Your reminder is saved and active!`,
      speechText: `Reminder set for ${title} at ${timeFormatted} on ${date}.`,
      card: {
        type: 'success_badge',
        reminderId: res.lastInsertRowid,
        title,
        date,
        time: timeFormatted,
        leadTimeMinutes: leadTime
      }
    };
  } catch (err) {
    console.error('Failed to insert reminder in real-time:', err);
    return {
      reply: `❌ Failed to save reminder: ${err.message}`,
      speechText: "There was an error saving your reminder.",
      card: null
    };
  }
}

/**
 * Handle List Schedule Intent
 */
function handleListScheduleIntent(session, entities, lowerText) {
  const now = new Date();
  const todayStr = formatDate(now);

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatDate(tomorrow);

  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  const endOfWeekStr = formatDate(endOfWeek);

  const isReminderQuery = /reminder|remainder|task|alert/i.test(lowerText) && !/meeting|slot|chart/i.test(lowerText);
  const isMeetingQuery = /meeting|appointment|sync|event|slot|chart/i.test(lowerText) && !/reminder|remainder/i.test(lowerText);
  const isSlotQuery = /\bslots?\b/i.test(lowerText);
  const isAllQuery = /\b(?:all|which\s+i\s+(?:have\s+)?scheduled|i\s+(?:have\s+)?scheduled|everything|full\s+list|chart|scheduled\s+meetings?)\b/i.test(lowerText) || entities.listScope === 'all';

  // Filter meetings
  let meetingSql = 'SELECT * FROM meetings WHERE date >= ? ORDER BY date ASC, start_time ASC LIMIT 25';
  let meetingParams = [todayStr];

  if (isAllQuery) {
    meetingSql = 'SELECT * FROM meetings ORDER BY date ASC, start_time ASC LIMIT 50';
    meetingParams = [];
  } else if (entities.listScope === 'today') {
    meetingSql = 'SELECT * FROM meetings WHERE date = ? ORDER BY start_time ASC';
    meetingParams = [todayStr];
  } else if (entities.listScope === 'tomorrow') {
    meetingSql = 'SELECT * FROM meetings WHERE date = ? ORDER BY start_time ASC';
    meetingParams = [tomorrowStr];
  } else if (entities.listScope === 'week') {
    meetingSql = 'SELECT * FROM meetings WHERE date >= ? AND date <= ? ORDER BY date ASC, start_time ASC';
    meetingParams = [todayStr, endOfWeekStr];
  }

  const meetings = isReminderQuery ? [] : db.prepare(meetingSql).all(...meetingParams);

  // Filter reminders
  let reminderSql = 'SELECT * FROM reminders WHERE completed = 0 ORDER BY date ASC, time ASC LIMIT 20';
  let reminderParams = [];

  if (isAllQuery || isReminderQuery || /\b(?:set|i\s+have|all)\b/i.test(lowerText)) {
    reminderSql = 'SELECT * FROM reminders ORDER BY completed ASC, date ASC, time ASC LIMIT 40';
    reminderParams = [];
  } else if (entities.listScope === 'today') {
    reminderSql = 'SELECT * FROM reminders WHERE date = ? AND completed = 0 ORDER BY time ASC';
    reminderParams = [todayStr];
  } else if (entities.listScope === 'tomorrow') {
    reminderSql = 'SELECT * FROM reminders WHERE date = ? AND completed = 0 ORDER BY time ASC';
    reminderParams = [tomorrowStr];
  }

  const reminders = isMeetingQuery ? [] : db.prepare(reminderSql).all(...reminderParams);

  // Handle specific "meeting slots" query
  if (isSlotQuery) {
    const standardSlots = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    const bookedTimes = new Set(meetings.map(m => m.start_time));
    const availableSlots = standardSlots.filter(s => !bookedTimes.has(s)).map(s => formatTime12(s));

    if (meetings.length === 0) {
      return {
        reply: `⏰ **Available Meeting Slots:**\n\n` +
          `You currently have no meetings scheduled. All standard slots are open today:\n` +
          `• **Morning:** 9:00 AM, 10:00 AM, 11:00 AM\n` +
          `• **Afternoon:** 1:00 PM, 2:00 PM, 3:00 PM, 4:00 PM, 5:00 PM\n\n` +
          `Would you like to schedule a meeting for any of these times?`,
        speechText: "You have no meetings scheduled. All slots are open from 9 AM to 5 PM today. Would you like to book one?",
        card: {
          type: 'slot_list',
          availableSlots
        }
      };
    } else {
      const bookedList = meetings.map(m => `• **${m.title}** at ${formatTime12(m.start_time)} (${m.date})`).join('\n');
      return {
        reply: `📅 **Your Booked Meetings (${meetings.length}):**\n${bookedList}\n\n` +
          `⏰ **Remaining Available Slots:**\n${availableSlots.join(', ')}\n\n` +
          `Would you like to schedule another meeting in one of the open slots?`,
        speechText: `You have ${meetings.length} meeting scheduled. Remaining open slots are ${availableSlots.slice(0, 4).join(', ')}, and more.`,
        card: {
          type: 'slot_list',
          meetings,
          availableSlots
        }
      };
    }
  }

  if (meetings.length === 0 && reminders.length === 0) {
    return {
      reply: `You currently have no scheduled meetings or pending reminders. Your calendar is clear! Would you like me to schedule a meeting for you?`,
      speechText: "You have no scheduled meetings or reminders right now. Would you like to schedule one?",
      card: {
        type: 'schedule_chart',
        meetings: [],
        reminders: []
      }
    };
  }

  let textParts = [];
  if (meetings.length > 0) {
    textParts.push(`📅 **Scheduled Meetings (${meetings.length}):**`);
    for (const m of meetings) {
      textParts.push(`• **${m.title}** on ${m.date} at ${formatTime12(m.start_time)} (${m.location || 'College'})`);
    }
  }

  if (reminders.length > 0) {
    if (textParts.length > 0) textParts.push('');
    textParts.push(`🔔 **Pending Reminders (${reminders.length}):**`);
    for (const r of reminders) {
      textParts.push(`• **${r.title}** at ${formatTime12(r.time)} (${r.date})`);
    }
  }

  const speechSummary = meetings.length > 0 && reminders.length === 0
    ? `You have ${meetings.length} scheduled meeting${meetings.length === 1 ? '' : 's'}: ${meetings.map(m => m.title + ' at ' + formatTime12(m.start_time)).join(', ')}.`
    : `You have ${meetings.length} meeting${meetings.length === 1 ? '' : 's'} and ${reminders.length} reminder${reminders.length === 1 ? '' : 's'}.`;

  return {
    reply: textParts.join('\n'),
    speechText: speechSummary,
    card: {
      type: 'schedule_chart',
      meetings,
      reminders,
      focus: isReminderQuery ? 'reminders' : 'meetings'
    }
  };
}

/**
 * Handle Reschedule Intent (Real-Time Calendar Update)
 * E.g., "Move my 3 PM meeting to 5 PM" or "Reschedule project meeting to Friday at 2 PM"
 */
function handleRescheduleIntent(session, entities) {
  const query = (entities.targetQuery || entities.title || '').toLowerCase();
  const searchTime = entities.targetTime || entities.startTime;
  const newDate = entities.newDate || entities.date;
  // Entity extraction intentionally uses the first time as the meeting to
  // find. For "move my 3 PM meeting to 5 PM", extract the destination time
  // separately instead of accidentally reusing 3 PM.
  const destinationTimeMatch = entities.raw?.match(
    /\b(?:to|at)\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\b/i
  );
  const destinationTime = destinationTimeMatch
    ? parseTime(destinationTimeMatch[1])?.startTime
    : null;
  const newTime = entities.newTime || destinationTime || (entities.targetTime ? entities.startTime : null);

  const allMeetings = db.prepare('SELECT * FROM meetings ORDER BY date ASC, start_time ASC').all();
  let match = null;

  // 1. Search by start time if targeted (e.g. "Move my 3 PM meeting")
  if (searchTime) {
    match = allMeetings.find(m => m.start_time === searchTime);
  }

  // 2. Search by title
  if (!match && query) {
    match = allMeetings.find(m => m.title.toLowerCase().includes(query));
  }

  if (!match) {
    if (allMeetings.length > 0) {
      match = allMeetings[0];
    } else {
      return {
        reply: "I couldn't find any meeting in your calendar to reschedule.",
        speechText: "I couldn't find any meeting to reschedule.",
        card: null
      };
    }
  }

  const targetDate = newDate || match.date;
  const targetStartTime = newTime || match.start_time;
  const [h, m] = targetStartTime.split(':').map(Number);
  const targetEndTime = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  // Check conflicts excluding this meeting
  const conflict = checkMeetingConflict(targetDate, targetStartTime, targetEndTime, match.id);
  if (conflict.hasConflict) {
    return {
      reply: `⚠️ Cannot reschedule to that time because it conflicts with **"${conflict.conflictingMeeting.title}"** (${formatTime12(conflict.conflictingMeeting.start_time)}). Please choose another time.`,
      speechText: `Cannot reschedule because of a conflict with ${conflict.conflictingMeeting.title}.`,
      card: null
    };
  }

  // Real-time update in SQLite
  db.prepare(`
    UPDATE meetings
    SET date = ?, start_time = ?, end_time = ?
    WHERE id = ?
  `).run(targetDate, targetStartTime, targetEndTime, match.id);

  session.pendingAction = null;

  return {
    reply: `✅ **Meeting Successfully Rescheduled in Real-Time!**\n\n` +
      `📅 **Meeting:** ${match.title}\n` +
      `🔄 **Previous Time:** ${match.date} at ${formatTime12(match.start_time)}\n` +
      `⏰ **New Time:** ${targetDate} from ${formatTime12(targetStartTime)} to ${formatTime12(targetEndTime)}\n\n` +
      `Your live calendar has been updated!`,
    speechText: `I have rescheduled ${match.title} to ${targetDate} at ${formatTime12(targetStartTime)}.`,
    card: {
      type: 'success_badge',
      meetingId: match.id,
      title: match.title,
      date: targetDate,
      time: `${formatTime12(targetStartTime)} - ${formatTime12(targetEndTime)}`
    }
  };
}

/**
 * Handle Cancel Intent (Real-Time Calendar Deletion)
 * E.g., "Cancel my 4 PM meeting", "Delete the meeting", "Delete dog meeting"
 */
function handleCancelIntent(session, entities) {
  const rawQuery = (entities.targetQuery || entities.title || '').trim();
  const lowerQuery = rawQuery.toLowerCase();
  const searchTime = entities.targetTime || entities.startTime;
  const allMeetings = db.prepare('SELECT * FROM meetings ORDER BY date ASC, start_time ASC').all();
  const allReminders = db.prepare('SELECT * FROM reminders WHERE completed = 0 ORDER BY date ASC, time ASC').all();

  // An explicit bulk request should not be treated as a title search for
  // "all meetings". The command itself already establishes clear intent.
  const isDeleteAllMeetings = /\b(?:all|every)\b/i.test(lowerQuery) &&
    /\b(?:meetings?|appointments?|events?)\b/i.test(lowerQuery);
  if (isDeleteAllMeetings) {
    if (allMeetings.length === 0) {
      return {
        reply: "You don't have any scheduled meetings to cancel.",
        speechText: "You don't have any scheduled meetings to cancel.",
        card: null
      };
    }

    const result = db.prepare('DELETE FROM meetings').run();
    session.pendingAction = null;
    return {
      reply: `âœ… Cancelled **${result.changes}** scheduled ${result.changes === 1 ? 'meeting' : 'meetings'} from your calendar.`,
      speechText: `Cancelled ${result.changes} scheduled ${result.changes === 1 ? 'meeting' : 'meetings'} from your calendar.`,
      card: {
        type: 'success_badge',
        action: 'cancelled_all_meetings',
        count: result.changes
      }
    };
  }

  // Check if generic "the meeting", "a meeting", "my meeting", "meeting", "the scheduled meeting"
  const isGenericMeeting =
    !rawQuery ||
    /^(?:the\s+|a\s+|my\s+|our\s+|this\s+)?meetings?(?:\s+which\s+i\s+(?:have\s+)?scheduled|\s+that\s+i\s+(?:have\s+)?scheduled)?$/i.test(lowerQuery);

  if (isGenericMeeting && !searchTime) {
    if (allMeetings.length === 0) {
      return {
        reply: "You don't have any scheduled meetings in your calendar to delete.",
        speechText: "You don't have any scheduled meetings to delete.",
        card: null
      };
    }

    if (allMeetings.length === 1) {
      // Exactly 1 meeting exists -> delete it immediately in real-time
      const target = allMeetings[0];
      db.prepare('DELETE FROM meetings WHERE id = ?').run(target.id);
      session.pendingAction = null;

      return {
        reply: `🗑️ **Meeting Deleted in Real-Time:**\n\n` +
          `📅 **"${target.title}"** on ${target.date} at ${formatTime12(target.start_time)} has been permanently deleted from your calendar.`,
        speechText: `"${target.title}" has been deleted from your calendar.`,
        card: {
          type: 'success_badge',
          title: target.title,
          action: 'cancelled'
        }
      };
    }

    // Multiple meetings exist -> ask user which one to delete
    session.pendingAction = {
      type: 'await_cancel_selection',
      meetings: allMeetings
    };

    const meetingList = allMeetings.map((m, idx) => `${idx + 1}. **${m.title}** on ${m.date} at ${formatTime12(m.start_time)}`).join('\n');

    return {
      reply: `You have **${allMeetings.length} scheduled meetings**:\n\n${meetingList}\n\nWhich meeting would you like to delete? (Say **1**, **2**, or the meeting name)`,
      speechText: `You have ${allMeetings.length} meetings. Which one would you like to delete? Say 1, 2, or the meeting name.`,
      card: {
        type: 'schedule_chart',
        meetings: allMeetings
      }
    };
  }

  // Not generic: user specified a time or title
  let targetMeeting = null;

  // Check by number: e.g. "delete meeting 1" or "cancel 2"
  const numMatch = lowerQuery.match(/(?:meeting\s+|number\s+|#)?([1-9]\d*)\b/);
  if (numMatch && !searchTime) {
    const idx = parseInt(numMatch[1], 10) - 1;
    if (allMeetings[idx]) {
      targetMeeting = allMeetings[idx];
    }
  }

  // Check by start time
  if (!targetMeeting && searchTime) {
    targetMeeting = allMeetings.find(m => m.start_time === searchTime);
  }

  // Check by title search
  if (!targetMeeting && rawQuery) {
    const cleanWord = lowerQuery
      .replace(/^(?:the\s+|a\s+|my\s+|meeting\s+called\s+|meeting\s+)/i, '')
      .replace(/\s+meeting$/i, '')
      .trim();
    if (cleanWord.length > 0) {
      targetMeeting = allMeetings.find(m => m.title.toLowerCase().includes(cleanWord));
    }
  }

  if (targetMeeting) {
    db.prepare('DELETE FROM meetings WHERE id = ?').run(targetMeeting.id);
    session.pendingAction = null;

    return {
      reply: `🗑️ **Meeting Deleted in Real-Time:**\n\n` +
        `📅 **"${targetMeeting.title}"** on ${targetMeeting.date} at ${formatTime12(targetMeeting.start_time)} has been deleted from your calendar.`,
      speechText: `${targetMeeting.title} has been deleted from your calendar.`,
      card: {
        type: 'success_badge',
        title: targetMeeting.title,
        action: 'cancelled'
      }
    };
  }

  // Check reminders if no meeting matched
  let targetReminder = null;
  if (searchTime) {
    targetReminder = allReminders.find(r => r.time === searchTime);
  }
  if (!targetReminder && rawQuery) {
    const cleanRem = lowerQuery.replace(/^(?:the\s+|a\s+|my\s+|reminder\s+)/i, '').trim();
    targetReminder = allReminders.find(r => r.title.toLowerCase().includes(cleanRem));
  }

  if (targetReminder) {
    db.prepare('DELETE FROM reminders WHERE id = ?').run(targetReminder.id);
    session.pendingAction = null;

    return {
      reply: `🗑️ **Reminder Deleted in Real-Time:**\n\n` +
        `🔔 **"${targetReminder.title}"** at ${formatTime12(targetReminder.time)} has been removed.`,
      speechText: `Reminder for ${targetReminder.title} has been removed.`,
      card: {
        type: 'success_badge',
        title: targetReminder.title,
        action: 'cancelled'
      }
    };
  }

  return {
    reply: `I couldn't find a matching meeting or reminder to delete for "${rawQuery}". You can see your list by asking "Show my scheduled meetings".`,
    speechText: "I couldn't find a matching item to delete.",
    card: null
  };
}

/**
 * Execute the pending action once user confirms
 */
function executePendingAction(session) {
  const { type, draft } = session.pendingAction;
  session.pendingAction = null;

  try {
    if (type === 'create_meeting') {
      const stmt = db.prepare(`
        INSERT INTO meetings (title, date, start_time, end_time, attendees, location, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const res = stmt.run(
        draft.title,
        draft.date,
        draft.startTime,
        draft.endTime,
        draft.attendees || '',
        draft.location || 'Campus',
        draft.notes || ''
      );

      const savedMeeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(res.lastInsertRowid);

      return {
        reply: `✅ Successfully scheduled: **"${draft.title}"** on ${draft.date} from ${formatTime12(draft.startTime)} to ${formatTime12(draft.endTime)}.`,
        speechText: `Meeting ${draft.title} has been scheduled successfully.`,
        card: {
          type: 'success_badge',
          item: savedMeeting
        }
      };
    }

    if (type === 'create_reminder') {
      const stmt = db.prepare(`
        INSERT INTO reminders (title, date, time, lead_time_minutes, completed, priority, notes)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `);
      const res = stmt.run(
        draft.title,
        draft.date,
        draft.time,
        draft.leadTimeMinutes || 15,
        draft.priority || 'medium',
        draft.notes || ''
      );

      const savedReminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(res.lastInsertRowid);

      return {
        reply: `✅ Reminder saved: **"${draft.title}"** for ${draft.date} at ${formatTime12(draft.time)}.`,
        speechText: `Reminder for ${draft.title} saved successfully.`,
        card: {
          type: 'success_badge',
          item: savedReminder
        }
      };
    }

    if (type === 'reschedule_meeting') {
      db.prepare(`
        UPDATE meetings SET date = ?, start_time = ?, end_time = ? WHERE id = ?
      `).run(draft.date, draft.startTime, draft.endTime, draft.id);

      return {
        reply: `✅ Meeting **"${draft.title}"** has been rescheduled to ${draft.date} at ${formatTime12(draft.startTime)}.`,
        speechText: `Meeting ${draft.title} rescheduled successfully.`,
        card: null
      };
    }

    if (type === 'cancel_meeting') {
      db.prepare('DELETE FROM meetings WHERE id = ?').run(draft.id);

      return {
        reply: `🗑️ Meeting **"${draft.title}"** has been cancelled and removed from your calendar.`,
        speechText: `Meeting ${draft.title} has been cancelled.`,
        card: null
      };
    }

    if (type === 'cancel_reminder') {
      db.prepare('DELETE FROM reminders WHERE id = ?').run(draft.id);

      return {
        reply: `🗑️ Reminder **"${draft.title}"** has been deleted.`,
        speechText: `Reminder ${draft.title} has been deleted.`,
        card: null
      };
    }
  } catch (err) {
    console.error('Error executing pending action:', err);
    return {
      reply: `❌ Failed to save changes: ${err.message}`,
      speechText: "An error occurred while saving changes.",
      card: null
    };
  }

  return {
    reply: "Done!",
    speechText: "Done!",
    card: null
  };
}

module.exports = {
  processUserMessage,
  executePendingAction,
  getSession,
  clearSessionPending
};
