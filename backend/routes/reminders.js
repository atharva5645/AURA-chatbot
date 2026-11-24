const express = require('express');
const router = express.Router();
const { db } = require('../db');

/**
 * GET /api/reminders
 * List reminders with optional completed status filter
 */
router.get('/', (req, res) => {
  try {
    const { completed, date } = req.query;
    let sql = 'SELECT * FROM reminders';
    const params = [];
    const conditions = [];

    if (completed !== undefined) {
      conditions.push('completed = ?');
      params.push(Number(completed));
    }

    if (date) {
      conditions.push('date = ?');
      params.push(date);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY completed ASC, date ASC, time ASC';
    const reminders = db.prepare(sql).all(...params);
    res.json({ success: true, count: reminders.length, data: reminders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/reminders/:id
 */
router.get('/:id', (req, res) => {
  try {
    const reminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(req.params.id);
    if (!reminder) {
      return res.status(404).json({ success: false, error: 'Reminder not found' });
    }
    res.json({ success: true, data: reminder });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/reminders
 * Create a new reminder
 */
router.post('/', (req, res) => {
  try {
    const { title, date, time, lead_time_minutes = 15, priority = 'medium', notes = '' } = req.body;

    if (!title || !date || !time) {
      return res.status(400).json({
        success: false,
        error: 'Title, date, and time are required fields.'
      });
    }

    const stmt = db.prepare(`
      INSERT INTO reminders (title, date, time, lead_time_minutes, completed, priority, notes)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `);

    const result = stmt.run(
      title.trim(),
      date,
      time,
      Number(lead_time_minutes) || 15,
      priority,
      notes || ''
    );

    const created = db.prepare('SELECT * FROM reminders WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/reminders/:id
 * Update an existing reminder
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Reminder not found' });
    }

    const {
      title = existing.title,
      date = existing.date,
      time = existing.time,
      lead_time_minutes = existing.lead_time_minutes,
      completed = existing.completed,
      priority = existing.priority,
      notes = existing.notes
    } = req.body;

    db.prepare(`
      UPDATE reminders
      SET title = ?, date = ?, time = ?, lead_time_minutes = ?, completed = ?, priority = ?, notes = ?
      WHERE id = ?
    `).run(title, date, time, lead_time_minutes, completed, priority, notes, id);

    const updated = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/reminders/:id/toggle
 * Toggle completed state (0 <-> 1)
 */
router.patch('/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Reminder not found' });
    }

    const newStatus = existing.completed === 1 ? 0 : 1;
    db.prepare('UPDATE reminders SET completed = ? WHERE id = ?').run(newStatus, id);

    const updated = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/reminders/:id
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Reminder not found' });
    }

    db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
    res.json({ success: true, message: `Reminder "${existing.title}" deleted successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
