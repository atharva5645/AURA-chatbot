const express = require('express');
const router = express.Router();
const { db } = require('../db');
const {
  processUserMessage,
  executePendingAction,
  getSession,
  clearSessionPending
} = require('../conversationManager');

/**
 * POST /api/chat
 * Primary conversational endpoint for text and voice transcripts
 */
router.post('/', async (req, res) => {
  try {
    const { message, sessionId = 'default', classifierMode = 'rule_based' } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'A message string is required.' });
    }

    // Save user message to chat history
    db.prepare(`
      INSERT INTO chat_history (session_id, sender, text)
      VALUES (?, 'user', ?)
    `).run(sessionId, message.trim());

    // Process via local conversation state machine (or Groq AI if key provided)
    const botResponse = await processUserMessage(message.trim(), sessionId, classifierMode);

    // Save bot reply to chat history
    db.prepare(`
      INSERT INTO chat_history (session_id, sender, text, card_data)
      VALUES (?, 'assistant', ?, ?)
    `).run(
      sessionId,
      botResponse.reply,
      botResponse.card ? JSON.stringify(botResponse.card) : null
    );

    const session = getSession(sessionId);

    res.json({
      success: true,
      reply: botResponse.reply,
      speechText: botResponse.speechText || botResponse.reply,
      card: botResponse.card || null,
      hasPendingAction: !!session.pendingAction,
      pendingAction: session.pendingAction
    });
  } catch (err) {
    console.error('Chat endpoint error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/chat/confirm
 * Direct confirmation/cancel click from interactive UI cards
 */
router.post('/confirm', (req, res) => {
  try {
    const { sessionId = 'default', confirmed = true } = req.body;
    const session = getSession(sessionId);

    if (!session.pendingAction) {
      return res.json({
        success: false,
        reply: "No pending action found to confirm or cancel."
      });
    }

    if (!confirmed) {
      clearSessionPending(sessionId);
      const reply = "Action cancelled. Let me know what you would like to do next!";
      db.prepare(`
        INSERT INTO chat_history (session_id, sender, text)
        VALUES (?, 'assistant', ?)
      `).run(sessionId, reply);

      return res.json({
        success: true,
        reply,
        speechText: "Action cancelled.",
        card: null,
        hasPendingAction: false
      });
    }

    // Execute the action
    const executionResult = executePendingAction(session);

    db.prepare(`
      INSERT INTO chat_history (session_id, sender, text, card_data)
      VALUES (?, 'assistant', ?, ?)
    `).run(
      sessionId,
      executionResult.reply,
      executionResult.card ? JSON.stringify(executionResult.card) : null
    );

    res.json({
      success: true,
      reply: executionResult.reply,
      speechText: executionResult.speechText || executionResult.reply,
      card: executionResult.card || null,
      hasPendingAction: false
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/chat/history
 * Retrieve session history
 */
router.get('/history', (req, res) => {
  try {
    const { sessionId = 'default', limit = 50 } = req.query;
    const rows = db.prepare(`
      SELECT * FROM chat_history
      WHERE session_id = ?
      ORDER BY id ASC
      LIMIT ?
    `).all(sessionId, Number(limit));

    const history = rows.map(r => ({
      id: r.id,
      sender: r.sender,
      text: r.text,
      card: r.card_data ? JSON.parse(r.card_data) : null,
      createdAt: r.created_at
    }));

    res.json({ success: true, count: history.length, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/chat/history
 * Clear chat history
 */
router.delete('/history', (req, res) => {
  try {
    const { sessionId = 'default' } = req.query;
    db.prepare('DELETE FROM chat_history WHERE session_id = ?').run(sessionId);
    clearSessionPending(sessionId);
    res.json({ success: true, message: 'Chat history cleared.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
