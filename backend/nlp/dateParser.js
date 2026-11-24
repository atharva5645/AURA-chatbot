/**
 * Local Date and Time Parser for AURA Chatbot
 * Zero external AI / zero cloud dependencies.
 * Converts natural student expressions:
 * - "tomorrow at 3 PM", "next Friday at 11 AM", "of the next date", "next date"
 * - "day after tomorrow", "in 2 days", "after 3 days", "next week"
 * - "on 25th", "25th Nov", "Nov 25", "25/11/2026", "at 5 o'clock", "4 in the evening"
 * into normalized YYYY-MM-DD and 24-hr HH:MM formats.
 */

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11
};

const WORD_NUMBERS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
};

function formatZero(n) {
  return String(n).padStart(2, '0');
}

function formatDateISO(d) {
  return `${d.getFullYear()}-${formatZero(d.getMonth() + 1)}-${formatZero(d.getDate())}`;
}

/**
 * Parse time from string
 * Supports:
 * - "at 3 PM", "3:30 pm", "3:00 p.m.", "3 p.m.", "three pm", "15:00", "at noon", "at 11:15 AM"
 * - "from 2 to 3 PM", "10 to 11:30 am", "from 10 am to 12 pm", "between 2 and 3 pm"
 * - "at 5 o'clock", "5 o clock", "five o clock", "5 oclock pm"
 * - "10 in the morning", "3 in the afternoon", "6 in the evening", "8 at night"
 * - Standalone numbers/words when prompted for time: "3", "three", "5", "five", "10:30", "at 4", "at four"
 */
function parseTime(text) {
  if (!text) return null;
  let lower = text.toLowerCase().trim();

  // Normalize Chrome speech recognition artifacts: p.m. -> pm, a.m. -> am
  lower = lower.replace(/p\.m\.?/gi, 'pm').replace(/a\.m\.?/gi, 'am');

  // Strip conversational wrappers: "make it 3 pm", "set it to 4 pm", "schedule at 5 pm", "time is 2 pm", "how about 3 pm"
  lower = lower.replace(/^(?:make\s+it|set\s+(?:it\s+)?(?:to|for|at)|time\s+is|it(?:'s|\s+is)|schedule\s+(?:it\s+)?(?:at|for)|how\s+about|around)\s+/i, 'at ');

  // Replace spoken word numbers with digits: "three pm" -> "3 pm", "at four" -> "at 4", "five o clock" -> "5 o clock"
  for (const [word, num] of Object.entries(WORD_NUMBERS)) {
    const r = new RegExp('\\b' + word + '\\b', 'gi');
    lower = lower.replace(r, num);
  }

  // 1. Range detection: "from 3 pm to 4:30 pm" or "3 pm to 4 pm" or "10 to 11 am" or "between 2 and 3 pm"
  const rangeRegex = /(?:from|between)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-|until|and)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;
  const rangeMatch = lower.match(rangeRegex);
  if (rangeMatch) {
    const startStr = rangeMatch[1].trim();
    const endStr = rangeMatch[2].trim();

    let startHasAmPm = /am|pm/i.test(startStr);
    let endHasAmPm = /am|pm/i.test(endStr);
    let endIsPm = /pm/i.test(endStr);

    let parsedStart = parseSingleTime(startStr, endHasAmPm && !startHasAmPm ? (endIsPm ? 'pm' : 'am') : null);
    let parsedEnd = parseSingleTime(endStr);

    if (parsedStart) {
      if (!parsedEnd) {
        parsedEnd = addHours(parsedStart, 1);
      }
      return {
        startTime: parsedStart,
        endTime: parsedEnd,
        raw: rangeMatch[0]
      };
    }
  }

  // 2. Named times
  if (/\b(?:at\s+)?noon\b/i.test(lower)) {
    return { startTime: '12:00', endTime: '13:00', raw: 'noon' };
  }
  if (/\b(?:at\s+)?midnight\b/i.test(lower)) {
    return { startTime: '00:00', endTime: '01:00', raw: 'midnight' };
  }

  // 3. O'clock notation: "at 5 o'clock", "5 o clock pm", "5 oclock in the evening"
  const oclockMatch = lower.match(/(?:at\s+|around\s+|by\s+)?(\d{1,2})\s*(?:o'?\s*clock)\s*(am|pm|in the morning|in the evening|in the afternoon|at night)?\b/i);
  if (oclockMatch) {
    let h = parseInt(oclockMatch[1], 10);
    const period = (oclockMatch[2] || '').toLowerCase();
    if (period.includes('pm') || period.includes('evening') || period.includes('afternoon') || period.includes('night')) {
      if (h < 12) h += 12;
    } else if (period.includes('am') || period.includes('morning')) {
      if (h === 12) h = 0;
    } else if (h >= 1 && h <= 6) {
      h += 12; // student default afternoon
    }
    const startTime = `${formatZero(h)}:00`;
    return {
      startTime,
      endTime: addHours(startTime, 1),
      raw: oclockMatch[0]
    };
  }

  // 4. Time with natural period: "10 in the morning", "4 in the evening", "2 in the afternoon", "9 at night"
  const naturalPeriodMatch = lower.match(/(?:at\s+|around\s+|by\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:in\s+the\s+(morning|afternoon|evening)|at\s+(night))\b/i);
  if (naturalPeriodMatch) {
    let h = parseInt(naturalPeriodMatch[1], 10);
    const m = naturalPeriodMatch[2] || '00';
    const period = naturalPeriodMatch[3] || naturalPeriodMatch[4];
    if (period === 'afternoon' || period === 'evening' || period === 'night') {
      if (h < 12) h += 12;
    } else if (period === 'morning') {
      if (h === 12) h = 0;
    }
    const startTime = `${formatZero(h)}:${m}`;
    return {
      startTime,
      endTime: addHours(startTime, 1),
      raw: naturalPeriodMatch[0]
    };
  }

  // 5. Explicit or Contextual single time: "at 3 PM", "at 3:30 pm", "3pm", "14:00", "at 4", "4:00"
  const contextualRegex = /(?:at|by|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b|(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b|(\d{1,2})\s*(am|pm)\b/i;
  const match = lower.match(contextualRegex);
  if (match) {
    const raw = match[0];
    const hour = match[1] || match[4] || match[7];
    const min = match[2] || match[5] || '00';
    const ampm = (match[3] || match[6] || match[8] || '').toLowerCase();

    let h = parseInt(hour, 10);
    const m = parseInt(min, 10);

    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;

    // Student day heuristic: "at 2" -> 14:00, "at 10" -> 10:00
    if (!ampm) {
      if (h >= 1 && h <= 6) h += 12;
    }

    const startTime = `${formatZero(h)}:${formatZero(m)}`;
    return {
      startTime,
      endTime: addHours(startTime, 1),
      raw
    };
  }

  // 6. Direct numeric time when string is just a time reply (e.g. "3", "3:30", "15:00", "at 4")
  const directMatch = lower.match(/^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (directMatch) {
    let h = parseInt(directMatch[1], 10);
    const m = directMatch[2] || '00';
    const ampm = (directMatch[3] || '').toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (!ampm && h >= 1 && h <= 6) h += 12;
    const startTime = `${formatZero(h)}:${m}`;
    return {
      startTime,
      endTime: addHours(startTime, 1),
      raw: lower
    };
  }

  return null;
}

function parseSingleTime(str, defaultMeridiem = null) {
  let s = str.toLowerCase().trim().replace(/p\.m\.?/gi, 'pm').replace(/a\.m\.?/gi, 'am');
  for (const [word, num] of Object.entries(WORD_NUMBERS)) {
    const r = new RegExp('\\b' + word + '\\b', 'gi');
    s = s.replace(r, num);
  }
  const match = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let h = parseInt(match[1], 10);
  const m = parseInt(match[2] || '00', 10);
  const ampm = (match[3] || defaultMeridiem || '').toLowerCase();

  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (!ampm && h >= 1 && h <= 6) h += 12;

  return `${formatZero(h)}:${formatZero(m)}`;
}

function addHours(timeStr, hours) {
  const [h, m] = timeStr.split(':').map(Number);
  const newH = (h + hours) % 24;
  return `${formatZero(newH)}:${formatZero(m)}`;
}

/**
 * Parse Date from string
 * Handles:
 * - "today", "tonight"
 * - "tomorrow", "tmrw", "next date", "the next date", "of the next date", "next day", "the next day", "following day"
 * - "day after tomorrow", "in 2 days", "after 2 days"
 * - "in X days", "after X days"
 * - "next week", "in a week"
 * - "this Friday", "next Monday", "coming Friday"
 * - "on 25th", "on the 25th", "25th", "28th"
 * - "Nov 25", "25 Nov", "25 November", "25th November", "2026-11-25", "25/11/2026", "25-11-2026"
 */
function parseDate(text, baseDate = new Date()) {
  if (!text) return null;
  let lower = text.toLowerCase().trim();

  // Normalize spoken word numbers: "in three days" -> "in 3 days"
  for (const [word, num] of Object.entries(WORD_NUMBERS)) {
    const r = new RegExp('\\b' + word + '\\b', 'gi');
    lower = lower.replace(r, num);
  }

  const d = new Date(baseDate);

  // 1. Today
  if (/\b(?:today|tonight|this evening|this morning)\b/i.test(lower)) {
    return {
      date: formatDateISO(d),
      description: 'Today',
      raw: 'today'
    };
  }

  // 2. Day after tomorrow / in 2 days
  if (/\b(?:day\s+after\s+tomorrow|in\s+2\s+days|after\s+2\s+days)\b/i.test(lower)) {
    d.setDate(d.getDate() + 2);
    return {
      date: formatDateISO(d),
      description: `Day After Tomorrow (${DAYS[d.getDay()]})`,
      raw: 'day after tomorrow'
    };
  }

  // 3. Tomorrow / Next Date / Next Day / Of the next date
  const tomorrowMatch = lower.match(/\b(?:tomorrow|tmrw|(?:of\s+)?(?:the\s+)?next\s+(?:date|day)|following\s+(?:date|day))\b/i);
  if (tomorrowMatch) {
    d.setDate(d.getDate() + 1);
    return {
      date: formatDateISO(d),
      description: `Tomorrow (${DAYS[d.getDay()]})`,
      raw: tomorrowMatch[0]
    };
  }

  // 4. Relative days: "in 3 days", "after 4 days", "in 5 days"
  const inDaysMatch = lower.match(/\b(?:in|after)\s+(\d+)\s+days?\b/i);
  if (inDaysMatch) {
    const daysToAdd = parseInt(inDaysMatch[1], 10);
    d.setDate(d.getDate() + daysToAdd);
    return {
      date: formatDateISO(d),
      description: `In ${daysToAdd} days (${DAYS[d.getDay()]})`,
      raw: inDaysMatch[0]
    };
  }

  // 5. Next week / In a week
  if (/\b(?:next\s+week|in\s+(?:a|1)\s+week)\b/i.test(lower)) {
    d.setDate(d.getDate() + 7);
    return {
      date: formatDateISO(d),
      description: `Next Week (${DAYS[d.getDay()]})`,
      raw: 'next week'
    };
  }

  // 6. Day of the week: e.g. "on friday", "this friday", "next monday", "coming tuesday"
  for (let i = 0; i < DAYS.length; i++) {
    const dayName = DAYS[i];
    const regex = new RegExp(`\\b(?:on\\s+|this\\s+|next\\s+|coming\\s+|upcoming\\s+)?(${dayName})\\b`, 'i');
    const match = lower.match(regex);
    if (match) {
      const isNext = /\b(?:next|coming|upcoming)\s+/i.test(match[0]);
      const currentDay = d.getDay();
      let diff = i - currentDay;

      if (diff <= 0) {
        diff += 7; // Next occurrence
      }
      if (isNext && diff < 7) {
        diff += 7; // Next week's occurrence
      }

      d.setDate(d.getDate() + diff);
      const capName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      return {
        date: formatDateISO(d),
        description: isNext ? `Next ${capName}` : capName,
        raw: match[0]
      };
    }
  }

  // 7. Explicit ISO: "2026-11-25"
  const isoMatch = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return {
      date: isoMatch[0],
      description: isoMatch[0],
      raw: isoMatch[0]
    };
  }

  // 8. DD/MM/YYYY or DD-MM-YYYY or MM/DD/YYYY
  const slashMatch = lower.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (slashMatch) {
    let day = parseInt(slashMatch[1], 10);
    let month = parseInt(slashMatch[2], 10) - 1; // 0-indexed
    let year = slashMatch[3] ? parseInt(slashMatch[3], 10) : d.getFullYear();
    if (year < 100) year += 2000;

    // If day > 12, it's definitely DD/MM. If month > 12, swap
    if (day <= 12 && month > 11) {
      const tmp = day;
      day = month + 1;
      month = tmp - 1;
    }

    const targetDate = new Date(year, month, day);
    return {
      date: formatDateISO(targetDate),
      description: targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      raw: slashMatch[0]
    };
  }

  // 9. Month and Day: "Nov 25", "25 Nov", "25th November", "November 25th"
  const monthNames = Object.keys(MONTHS).join('|');
  const monthDayRegex = new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');
  const dayMonthRegex = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthNames})\\b`, 'i');

  let mMatch = lower.match(monthDayRegex);
  if (mMatch) {
    const month = MONTHS[mMatch[1].toLowerCase()];
    const day = parseInt(mMatch[2], 10);
    const targetDate = new Date(d.getFullYear(), month, day);
    if (targetDate < d && (d.getMonth() - month) > 6) {
      targetDate.setFullYear(targetDate.getFullYear() + 1);
    }
    return {
      date: formatDateISO(targetDate),
      description: targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      raw: mMatch[0]
    };
  }

  mMatch = lower.match(dayMonthRegex);
  if (mMatch) {
    const day = parseInt(mMatch[1], 10);
    const month = MONTHS[mMatch[2].toLowerCase()];
    const targetDate = new Date(d.getFullYear(), month, day);
    return {
      date: formatDateISO(targetDate),
      description: targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      raw: mMatch[0]
    };
  }

  // 10. Standalone Ordinal Day: "on 25th", "on the 25th", "25th", "28th of this month", "5th of next month"
  const ordinalMatch = lower.match(/\b(?:on\s+(?:the\s+)?)?(\d{1,2})(?:st|nd|rd|th)\b(?:\s+of\s+(this|next)\s+month)?/i);
  if (ordinalMatch) {
    const targetDay = parseInt(ordinalMatch[1], 10);
    const monthMod = ordinalMatch[2] ? (ordinalMatch[2].toLowerCase() === 'next' ? 1 : 0) : null;

    if (targetDay >= 1 && targetDay <= 31) {
      let targetMonth = d.getMonth();
      let targetYear = d.getFullYear();

      if (monthMod !== null) {
        targetMonth += monthMod;
      } else {
        // If the day has already passed this month, schedule for next month
        if (targetDay < d.getDate()) {
          targetMonth += 1;
        }
      }

      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear += 1;
      }

      const targetDate = new Date(targetYear, targetMonth, targetDay);
      return {
        date: formatDateISO(targetDate),
        description: targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        raw: ordinalMatch[0]
      };
    }
  }

  return null;
}

/**
 * Format 24-hr time into 12-hr readable string (e.g. 15:30 -> 3:30 PM)
 */
function formatTime12(time24) {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

module.exports = {
  parseDate,
  parseTime,
  formatDateISO,
  formatTime12,
  DAYS
};
