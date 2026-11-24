const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Tests can point at an isolated database without touching a user's saved
// meetings and reminders. Production continues to use backend/data/aura.db.
const dbPath = process.env.AURA_DB_PATH
  ? path.resolve(process.env.AURA_DB_PATH)
  : path.join(dataDir, 'aura.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for performance
db.exec('PRAGMA journal_mode = WAL;');

/**
 * Initialize database tables
 */
function initDatabase() {
  // Meetings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      attendees TEXT DEFAULT '',
      location TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Reminders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      lead_time_minutes INTEGER DEFAULT 15,
      completed INTEGER DEFAULT 0,
      priority TEXT DEFAULT 'medium',
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Chat message history table (for persistence across reloads)
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      text TEXT NOT NULL,
      card_data TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Start clean with zero dummy data - only real-time user records are stored
}

/**
 * Format Date to YYYY-MM-DD
 */
function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Seed initial realistic student data relative to current date
 */
function seedSampleData() {
  const now = new Date();
  
  const todayStr = formatDate(now);

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatDate(tomorrow);

  const dayAfter = new Date(now);
  dayAfter.setDate(dayAfter.getDate() + 2);
  const dayAfterStr = formatDate(dayAfter);

  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 5);
  const nextWeekStr = formatDate(nextWeek);

  // Clear existing
  db.exec('DELETE FROM meetings;');
  db.exec('DELETE FROM reminders;');

  // Insert sample meetings
  const insertMeeting = db.prepare(`
    INSERT INTO meetings (title, date, start_time, end_time, attendees, location, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertMeeting.run(
    'Atharva & Capstone Team Sync',
    todayStr,
    '14:00',
    '15:00',
    'Atharva, Neha, Rohan',
    'Project Lab 301 / Google Meet',
    'Sprint review: discuss local NLP pipeline and speech interface'
  );

  insertMeeting.run(
    'AI Project Review with Prof. Sharma',
    tomorrowStr,
    '11:00',
    '12:00',
    'Prof. Sharma, Atharva',
    'Cabin 402, CS Dept',
    'Present architecture diagram, dataset statistics, and intent classification demo'
  );

  insertMeeting.run(
    'Web Engineering Workshop',
    dayAfterStr,
    '15:30',
    '17:00',
    'Batch A Students, Guest Speaker',
    'Auditorium 2',
    'Hands-on session on React state management and component lifecycle'
  );

  insertMeeting.run(
    'Campus Placement Drive Orientation',
    nextWeekStr,
    '10:00',
    '11:30',
    'TPO Officers, Final Year Students',
    'Main Seminar Hall',
    'Important guidelines regarding technical interview rounds and portfolio links'
  );

  // Insert sample reminders
  const insertReminder = db.prepare(`
    INSERT INTO reminders (title, date, time, lead_time_minutes, completed, priority, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertReminder.run(
    'Submit Computer Networks Lab Assignment',
    todayStr,
    '18:00',
    30,
    0,
    'high',
    'Upload Wireshark packet capture analysis PDF to college portal'
  );

  insertReminder.run(
    'Return Discrete Mathematics book to Central Library',
    tomorrowStr,
    '13:30',
    15,
    0,
    'medium',
    'Book due date approaching, renew online if reading pending'
  );

  insertReminder.run(
    'Pay Semester Examination Fee',
    dayAfterStr,
    '16:00',
    60,
    0,
    'high',
    'Netbanking receipt must be downloaded for student section verification'
  );

  insertReminder.run(
    'Prepare 10-minute Seminar PPT on Naive Bayes Classifier',
    nextWeekStr,
    '09:00',
    15,
    0,
    'low',
    'Highlight difference between Rule-Based NLP and statistical learning'
  );

  console.log('Sample college data seeded successfully for AURA.');
}

/**
 * Check if a new or updated meeting overlaps with existing meetings
 * @param {string} date - 'YYYY-MM-DD'
 * @param {string} startTime - 'HH:MM'
 * @param {string} endTime - 'HH:MM'
 * @param {number|null} excludeId - meeting ID to exclude (e.g. when editing)
 * @returns {object} { hasConflict: boolean, conflictingMeeting: object|null, suggestedSlots: string[] }
 */
function checkMeetingConflict(date, startTime, endTime, excludeId = null) {
  let query = 'SELECT * FROM meetings WHERE date = ?';
  const params = [date];
  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }
  query += ' ORDER BY start_time ASC';

  const dayMeetings = db.prepare(query).all(...params);

  // Check overlap: (StartA < EndB) and (EndA > StartB)
  let conflictingMeeting = null;
  for (const m of dayMeetings) {
    if (startTime < m.end_time && endTime > m.start_time) {
      conflictingMeeting = m;
      break;
    }
  }

  if (!conflictingMeeting) {
    return { hasConflict: false, conflictingMeeting: null, suggestedSlots: [] };
  }

  // Suggest alternative available 1-hour slots on the same date
  const candidateTimes = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
  const suggestedSlots = [];

  // Duration in hours
  const startParts = startTime.split(':').map(Number);
  const endParts = endTime.split(':').map(Number);
  const durationMins = (endParts[0] * 60 + endParts[1]) - (startParts[0] * 60 + startParts[1]);
  const durationSafe = durationMins > 0 ? durationMins : 60;

  for (const cTime of candidateTimes) {
    const cParts = cTime.split(':').map(Number);
    const cEndMins = cParts[0] * 60 + cParts[1] + durationSafe;
    const cEndHours = Math.floor(cEndMins / 60);
    const cEndRemaining = cEndMins % 60;
    if (cEndHours > 18) continue; // After college hours

    const cEndTime = `${String(cEndHours).padStart(2, '0')}:${String(cEndRemaining).padStart(2, '0')}`;

    // Test candidate against all day meetings
    let hasCandidateConflict = false;
    for (const m of dayMeetings) {
      if (cTime < m.end_time && cEndTime > m.start_time) {
        hasCandidateConflict = true;
        break;
      }
    }

    if (!hasCandidateConflict && cTime !== startTime) {
      suggestedSlots.push({
        start_time: cTime,
        end_time: cEndTime
      });
      if (suggestedSlots.length >= 3) break;
    }
  }

  return {
    hasConflict: true,
    conflictingMeeting,
    suggestedSlots
  };
}

module.exports = {
  db,
  initDatabase,
  seedSampleData,
  checkMeetingConflict,
  formatDate
};
