const express = require('express');
const router = express.Router();
const { db, seedSampleData, formatDate } = require('../db');

/**
 * GET /api/stats
 * Comprehensive metrics for the student productivity dashboard
 */
router.get('/', (req, res) => {
  try {
    const todayStr = formatDate(new Date());

    const totalMeetings = db.prepare('SELECT COUNT(*) as count FROM meetings').get().count;
    const todayMeetings = db.prepare('SELECT * FROM meetings WHERE date = ? ORDER BY start_time ASC').all(todayStr);
    const upcomingMeetings = db.prepare('SELECT * FROM meetings WHERE date >= ? ORDER BY date ASC, start_time ASC LIMIT 5').all(todayStr);

    const pendingReminders = db.prepare('SELECT * FROM reminders WHERE completed = 0 ORDER BY date ASC, time ASC').all();
    const completedReminders = db.prepare('SELECT COUNT(*) as count FROM reminders WHERE completed = 1').get().count;
    const todayReminders = db.prepare('SELECT * FROM reminders WHERE date = ? AND completed = 0 ORDER BY time ASC').all(todayStr);

    // Find next upcoming meeting
    const nextMeeting = upcomingMeetings.length > 0 ? upcomingMeetings[0] : null;

    res.json({
      success: true,
      data: {
        todayDate: todayStr,
        totalMeetings,
        todayMeetingsCount: todayMeetings.length,
        todayMeetings,
        upcomingMeetings,
        pendingRemindersCount: pendingReminders.length,
        completedRemindersCount: completedReminders,
        pendingReminders: pendingReminders.slice(0, 5),
        todayReminders,
        nextMeeting
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/stats/clear-all-data
 * Completely wipe all data for a pristine real-time slate
 */
router.post('/clear-all-data', (req, res) => {
  try {
    db.exec('DELETE FROM meetings;');
    db.exec('DELETE FROM reminders;');
    db.exec('DELETE FROM chat_history;');
    res.json({ success: true, message: 'All meetings, reminders, and chat history cleared successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/stats/reset-sample-data
 * Re-seed the sample records
 */
router.post('/reset-sample-data', (req, res) => {
  try {
    seedSampleData();
    res.json({ success: true, message: 'Database reset to initial sample college dataset successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
