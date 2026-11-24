const { parseDate, parseTime, formatTime12 } = require('./dateParser');

/**
 * Extracts entities (title, date, time, attendees, target query)
 * from natural language text for meetings and reminders.
 */
function extractEntities(text) {
  const original = text.trim();
  const lower = original.toLowerCase();

  // 1. Parse Date and Time
  const dateInfo = parseDate(original);
  const timeInfo = parseTime(original);

  // 2. Extract Attendees if present ("with John, Sarah", "with Prof. Sharma")
  let attendees = '';
  const attendeesMatch = original.match(/\bwith\s+([A-Za-z0-9\s,\.&]+?)(?=\s+(?:at|on|tomorrow|today|this|next|from|for|in|of|about)|$)/i);
  if (attendeesMatch) {
    attendees = attendeesMatch[1].trim().replace(/,\s*$/, '');
  }

  // 3. Extract Lead Time for Reminders (e.g. "30 minutes before", "1 hour before")
  let leadTimeMinutes = 15;
  const leadMatch = lower.match(/(\d+)\s*(?:min|minute|minutes|hr|hour|hours)\s*(?:before|prior|lead)/i);
  if (leadMatch) {
    const val = parseInt(leadMatch[1], 10);
    if (/hr|hour/i.test(leadMatch[0])) {
      leadTimeMinutes = val * 60;
    } else {
      leadTimeMinutes = val;
    }
  }

  // 4. Extract Title
  let title = '';

  // Clean away command trigger prefixes
  let cleaned = original;
  cleaned = cleaned.replace(/^(?:hey\s+|hi\s+|hello\s+)?(?:aura[,\s]*)?/i, '');
  cleaned = cleaned.replace(/^(?:please\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+|i\s+want\s+to\s+|i\s+need\s+to\s+)?/i, '');

  // Reminder patterns: "remind me to [title] at...", "set a reminder to [title]..."
  const reminderPrefix = /^(?:remind\s+me\s+to|set\s+(?:a\s+)?reminder\s+(?:to|for)|create\s+(?:a\s+)?reminder\s+(?:to|for)|remind\s+me\s+about)\s+/i;
  if (reminderPrefix.test(cleaned)) {
    cleaned = cleaned.replace(reminderPrefix, '');
  } else {
    // Meeting patterns: "schedule a [title] at...", "book a meeting for [title]..."
    const meetingPrefix = /^(?:schedule|book|create|set\s+up|arrange)\s+(?:a|an)?\s*(?:meeting\s+(?:for|about|with)?|appointment\s+(?:for|about)?|session\s+(?:for|about)?|sync\s+(?:with|for)?|discussion\s+(?:about)?|call\s+(?:with)?)?\s*/i;
    cleaned = cleaned.replace(meetingPrefix, '');
  }

  // Remove date and time snippets from the cleaned string to isolate title
  if (dateInfo && dateInfo.raw) {
    const rawDate = dateInfo.raw.trim();
    const dRegex = new RegExp(`(?:on\\s+|of\\s+|for\\s+)?${escapeRegex(rawDate)}`, 'gi');
    cleaned = cleaned.replace(dRegex, '');
  }
  if (timeInfo && timeInfo.raw) {
    const rawTime = timeInfo.raw.trim();
    const tRegex = new RegExp(`(?:at\\s+)?${escapeRegex(rawTime)}`, 'gi');
    cleaned = cleaned.replace(tRegex, '');
  }

  // Also clean up any general time or date residue
  cleaned = cleaned.replace(/p\.m\.?/gi, 'pm').replace(/a\.m\.?/gi, 'am');
  cleaned = cleaned.replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm|o['\s]?clock)?\b/gi, '');
  cleaned = cleaned.replace(/\b(?:at\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:am|pm|o['\s]?clock)?\b/gi, '');
  cleaned = cleaned.replace(/\b(?:in\s+the\s+(?:morning|evening|afternoon)|at\s+night|noon|midnight)\b/gi, '');
  cleaned = cleaned.replace(/\b(?:of\s+the\s+next\s+date|the\s+next\s+date|next\s+date|the\s+following\s+day|following\s+day|next\s+day|tomorrow|today)\b/gi, '');

  // Clean leading & trailing prepositions or filler words
  cleaned = cleaned.replace(/^(?:of|for|on|about|at|in|with|to)\s+/i, '');
  cleaned = cleaned.replace(/\b(?:at|on|for|from|to|by|around|of|about|with\s+[^]+)\s*$/i, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // If title is just a generic noun, time, or date phrase, treat as empty so smart fallback or follow-up triggers
  const genericWords = new Set([
    'meeting', 'appointment', 'reminder', 'session', 'sync', 'call', 'event', 'discussion',
    'a meeting', 'the meeting', 'next date', 'of the next date', 'the next date', 'next day',
    'tomorrow', 'today', 'the next day', '5 o clock', '5 o\'clock', 'four', 'three', 'five'
  ]);
  const isJustNumber = /^(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/i.test(cleaned);

  // If title is too long (> 5 words) or contains conversational rambles / speech artifacts, discard it
  const isConversationalRamble =
    cleaned.split(/\s+/).length > 5 ||
    /\b(?:is\s+basically|basically\s+for|better\s+waiting|and\s+also|timing\s+of|the\s+meeting\s+is|what\s+about|could\s+you|can\s+we|because|so\s+that|which\s+is|i\s+think)\b/i.test(cleaned);

  if (genericWords.has(cleaned.toLowerCase()) || cleaned.length < 2 || isJustNumber || isConversationalRamble) {
    title = '';
  } else {
    // Capitalize first letter
    title = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // 5. Extract target for Reschedule or Cancel
  // "move my project meeting to friday at 2 pm" -> target: "project meeting"
  // "cancel my 4 pm meeting" -> target: "4 pm"
  let targetQuery = '';
  const moveMatch = original.match(/(?:move|reschedule|postpone|shift|change)\s+(?:my\s+)?(.+?)\s+(?:to|at|for|on)/i);
  if (moveMatch) {
    targetQuery = moveMatch[1].replace(/^(?:the\s+|a\s+|meeting\s+called\s+|meeting\s+)/i, '').trim();
  }

  const cancelMatch = original.match(/(?:cancel|delete|remove|drop)\s+(?:my\s+)?(?:the\s+)?(.+?)(?:\s+meeting|\s+reminder|\s*$)/i);
  if (cancelMatch) {
    targetQuery = cancelMatch[1].trim();
  }

  // 6. Extract scope for listing
  let listScope = 'upcoming'; // 'today', 'tomorrow', 'week', 'all', 'upcoming'
  if (/\b(?:today|tonight)\b/i.test(lower)) {
    listScope = 'today';
  } else if (/\b(?:tomorrow|tmrw)\b/i.test(lower)) {
    listScope = 'tomorrow';
  } else if (/\b(?:this\s+week|week)\b/i.test(lower)) {
    listScope = 'week';
  } else if (/\b(?:all|everything)\b/i.test(lower)) {
    listScope = 'all';
  }

  return {
    raw: original,
    title,
    date: dateInfo ? dateInfo.date : null,
    dateDescription: dateInfo ? dateInfo.description : null,
    startTime: timeInfo ? timeInfo.startTime : null,
    endTime: timeInfo ? timeInfo.endTime : null,
    timeDescription: timeInfo ? `${formatTime12(timeInfo.startTime)} - ${formatTime12(timeInfo.endTime)}` : null,
    attendees,
    leadTimeMinutes,
    targetQuery,
    listScope
  };
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  extractEntities
};
