const express = require('express');
const router = express.Router();
const { db, checkMeetingConflict } = require('../db');

/**
 * GET /api/meetings
 * List meetings with optional date filtering
 */
router.get('/', (req, res) => {
  try {
    const { date, from, to } = req.query;
    let sql = 'SELECT * FROM meetings';
    const params = [];

    if (date) {
      sql += ' WHERE date = ?';
      params.push(date);
    } else if (from && to) {
      sql += ' WHERE date >= ? AND date <= ?';
      params.push(from, to);
    }

    sql += ' ORDER BY date ASC, start_time ASC';
    const meetings = db.prepare(sql).all(...params);
    res.json({ success: true, count: meetings.length, data: meetings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/meetings/:id
 */
router.get('/:id', (req, res) => {
  try {
    const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }
    res.json({ success: true, data: meeting });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/meetings
 * Create meeting with conflict checking
 */
router.post('/', (req, res) => {
  try {
    const { title, date, start_time, end_time, attendees, location, notes, force } = req.body;

    if (!title || !date || !start_time) {
      return res.status(400).json({
        success: false,
        error: 'Title, date, and start_time are required fields.'
      });
    }

    // Default end time to 1 hour after start
    let safeEndTime = end_time;
    if (!safeEndTime) {
      const [h, m] = start_time.split(':').map(Number);
      safeEndTime = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // Validate that end_time is after start_time
    if (safeEndTime <= start_time) {
      return res.status(400).json({
        success: false,
        error: 'End time must be later than start time.'
      });
    }

    // Check conflict
    if (!force) {
      const conflict = checkMeetingConflict(date, start_time, safeEndTime);
      if (conflict.hasConflict) {
        return res.status(409).json({
          success: false,
          error: `Time conflict with "${conflict.conflictingMeeting.title}" (${conflict.conflictingMeeting.start_time} - ${conflict.conflictingMeeting.end_time})`,
          conflict: conflict.conflictingMeeting,
          suggestedSlots: conflict.suggestedSlots
        });
      }
    }

    const stmt = db.prepare(`
      INSERT INTO meetings (title, date, start_time, end_time, attendees, location, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      title.trim(),
      date,
      start_time,
      safeEndTime,
      attendees || '',
      location || 'Campus / Online',
      notes || ''
    );

    const created = db.prepare('SELECT * FROM meetings WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/meetings/:id
 * Update/reschedule an existing meeting
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }

    const {
      title = existing.title,
      date = existing.date,
      start_time = existing.start_time,
      end_time = existing.end_time,
      attendees = existing.attendees,
      location = existing.location,
      notes = existing.notes,
      force = false
    } = req.body;

    // Check conflict excluding current meeting
    if (!force) {
      const conflict = checkMeetingConflict(date, start_time, end_time, id);
      if (conflict.hasConflict) {
        return res.status(409).json({
          success: false,
          error: `Time conflict with "${conflict.conflictingMeeting.title}" (${conflict.conflictingMeeting.start_time} - ${conflict.conflictingMeeting.end_time})`,
          conflict: conflict.conflictingMeeting,
          suggestedSlots: conflict.suggestedSlots
        });
      }
    }

    db.prepare(`
      UPDATE meetings
      SET title = ?, date = ?, start_time = ?, end_time = ?, attendees = ?, location = ?, notes = ?
      WHERE id = ?
    `).run(title, date, start_time, end_time, attendees, location, notes, id);

    const updated = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/meetings/:id
 * Cancel/delete a meeting
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }

    db.prepare('DELETE FROM meetings WHERE id = ?').run(id);
    res.json({ success: true, message: `Meeting "${existing.title}" cancelled successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
