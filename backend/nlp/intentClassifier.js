const fs = require('fs');
const path = require('path');
const NaiveBayesClassifier = require('../ml/naiveBayes');

const modelPath = path.join(__dirname, '..', 'ml', 'model.json');

// Singleton loaded ML classifier
let mlClassifier = null;
let mlModelMeta = null;

function loadMLModel() {
  try {
    if (fs.existsSync(modelPath)) {
      const data = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
      mlClassifier = new NaiveBayesClassifier();
      mlClassifier.fromJSON(data);
      mlModelMeta = data.evaluation || null;
      return true;
    }
  } catch (err) {
    console.warn('Failed to load ML model, falling back to rule-based NLP:', err.message);
  }
  return false;
}

// Initial load attempt
loadMLModel();

/**
 * Strict verification that user actually requested to schedule a meeting.
 * Ensures AURA ONLY schedules when explicitly asked.
 */
function hasExplicitSchedulingKeywords(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase().trim();

  // Strip leading wake words or conversational greetings
  const stripped = lower
    .replace(/^(?:(?:hey|hi|hello|ok|okay|yo|good\s+(?:morning|afternoon|evening))\s+)?(?:aura|aurora|arora|ora|assistant)[,\s.:]*/i, '')
    .trim();
  const workText = stripped.length > 1 ? stripped : lower;

  // Never match queries, slots, cancellations, or gratitude as scheduling requests
  if (
    /\b(?:what|show|list|view|check|tell\s+me|display|how\s+many|slots?|free\s+slots|available\s+slots)\b/i.test(workText) ||
    /\b(?:cancel|delete|remove|drop|discard|reschedule|move|postpone)\b/i.test(workText) ||
    /\b(?:thank\s+you|thanks|thank\s+u|thx|bye|goodbye|see\s+ya|cool|awesome|great|got\s+it)\b/i.test(workText)
  ) {
    return false;
  }

  // 1. Explicit scheduling action verbs:
  // "schedule a meeting", "schedule meeting", "schedule project review at 3 PM", "schedule it for tomorrow"
  if (/\b(?:schedule\s+(?:a|an|the|my|our|new|team|project)?\s*(?:meeting|appointment|call|session|sync|discussion|meet)|schedule\s+(?:it\s+)?(?:for|on|at|tomorrow|next|today|in|whenever|right\s+now)|schedule\s+meeting|schedule\b)/i.test(workText)) {
    return true;
  }

  // 2. Explicit booking verbs:
  // "book a meeting", "book an appointment", "book a slot for meeting", "book a session"
  if (/\b(?:book|arrange|set\s+up|plan|organize|fix)\s+(?:a|an|the|my|our|new)?\s*(?:meeting|appointment|slot|session|sync|call|discussion)\b/i.test(workText)) {
    return true;
  }

  // Spoken input often starts as an incomplete meeting statement, e.g.
  // "the project meeting is ... the timing is". Treat it as a scheduling
  // request so the assistant can collect the missing date and time.
  if (
    /\b(?:meeting|appointment|session|sync|discussion)\b/i.test(workText) &&
    /\b(?:time|timing)\b/i.test(workText)
  ) {
    return true;
  }

  // 3. Meeting noun paired with a clear time/date command:
  // e.g. "team meeting tomorrow at 3 PM", "project meeting at 4 PM"
  if (/\b(?:meeting|appointment|session|sync)\b/i.test(workText) &&
      /\b(?:tomorrow|today|next\s+date|at\s+\d{1,2}|from\s+\d{1,2}|\d{1,2}\s*(?:am|pm))\b/i.test(workText)) {
    return true;
  }

  return false;
}

/**
 * Rule-Based Intent Classifier (Deterministic Heuristic Engine)
 * High precision, zero dependencies, lightning-fast.
 */
function classifyRuleBased(text) {
  let t = text.toLowerCase().trim();

  // Gratitude & Courtesy (check first: "thank you", "thanks", "thanks a lot")
  if (/\b(?:thank\s+you|thanks|thank\s+u|thx|appreciate\s+it|grateful|good\s+job|well\s+done)\b/i.test(t)) {
    return { intent: 'gratitude', confidence: 0.98, method: 'rule-based' };
  }

  // Strip leading wake word or conversational greeting prefix if a command follows:
  // e.g. "hello aura schedule a meeting" -> "schedule a meeting"
  // e.g. "hey aura remind me to call mom" -> "remind me to call mom"
  const stripped = t
    .replace(/^(?:(?:hey|hi|hello|ok|okay|yo|good\s+(?:morning|afternoon|evening))\s+)?(?:aura|aurora|arora|ora|assistant)[,\s.:]*/i, '')
    .replace(/^(?:hey|hi|hello|yo)[,\s.:]+/i, '')
    .trim();

  // If there is actual content after stripping, prefer the stripped text for command detection
  const workText = stripped.length > 2 ? stripped : t;

  // Gratitude after stripping
  if (/\b(?:thank\s+you|thanks|thank\s+u|thx|appreciate\s+it|grateful)\b/i.test(workText)) {
    return { intent: 'gratitude', confidence: 0.98, method: 'rule-based' };
  }

  // Reschedule / Move (check before cancel and schedule)
  if (/\b(?:reschedule|move|postpone|shift|delay|change\s+(?:the\s+)?time|change\s+(?:the\s+)?date)\b/i.test(workText)) {
    return { intent: 'reschedule_meeting', confidence: 0.92, method: 'rule-based' };
  }

  // 1. Cancel / Delete
  if (/\b(?:cancel|delete|remove|drop|discard)\b/i.test(workText)) {
    return { intent: 'cancel_meeting', confidence: 0.95, method: 'rule-based' };
  }

  // 2. List / Show / Query schedule / Meeting slots / Reminders list / Scheduled Meeting Chart
  // (Checked BEFORE create_reminder so "what reminders do I have set" or "show reminders" is NOT treated as creating a reminder)
  if (
    /\b(?:show|list|view|tell\s+me|display|get|check|what\s+are|what\s+is|what)\s+(?:about\s+)?(?:all\s+|the\s+|my\s+|our\s+)?(?:upcoming\s+|scheduled\s+|set\s+)?(?:meetings?|appointments?|reminders?|remainders?|agenda|schedule|slots?|calendar|tasks?|events?|chart)\b/i.test(workText) ||
    /\b(?:meeting\s+slots?|available\s+slots?|free\s+slots?|meetings?\s+list|list\s+of\s+meetings?|my\s+meetings?|my\s+schedule|my\s+agenda|scheduled\s+meetings?|scheduled\s+meeting\s+chart|meeting\s+chart|schedule\s+chart|calendar\s+chart|chart\s+of\s+meetings?)\b/i.test(workText) ||
    /\b(?:reminders?\s+list|remainders?\s+list|list\s+of\s+reminders?|my\s+reminders?|my\s+remainders?|reminders?\s+i\s+have|remainders?\s+i\s+have|reminders?\s+(?:i\s+have\s+)?set|remainders?\s+(?:i\s+have\s+)?set|what\s+reminders?|what\s+remainders?)\b/i.test(workText) ||
    /\b(?:what\s+(?:is|are)?\s*(?:on\s+my\s+)?(?:schedule|calendar|agenda)|what's\s+on\s+my\s+(?:schedule|calendar|agenda)|do\s+i\s+have\s+any\s+(?:meetings?|reminders?|remainders?|events?))\b/i.test(workText) ||
    /\bshow\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?(?:scheduled\s+)?(?:meeting\s+)?chart\b/i.test(workText) ||
    /\bshow\s+(?:me\s+)?(?:what\s+)?(?:reminders?|remainders?)\b/i.test(workText)
  ) {
    return { intent: 'list_schedule', confidence: 0.95, method: 'rule-based' };
  }

  // 3. Reminders creation ("remind me to...", "set reminder", "create reminder", "alert me at...")
  if (
    /\b(?:remind\s+me|set\s+(?:a\s+)?(?:reminder|remainder)|create\s+(?:a\s+)?(?:reminder|remainder)|add\s+(?:a\s+)?(?:reminder|remainder)|alert\s+me\s+at)\b/i.test(workText) &&
    !/\b(?:what|show|list|view|check|tell\s+me|display)\b/i.test(workText)
  ) {
    return { intent: 'create_reminder', confidence: 0.94, method: 'rule-based' };
  }

  // Schedule / Book Meeting: ONLY IF user explicitly requested to schedule!
  if (hasExplicitSchedulingKeywords(workText)) {
    return { intent: 'schedule_meeting', confidence: 0.95, method: 'rule-based' };
  }

  // Greetings & Farewells (only if pure greeting/farewell and no other command)
  if (/^(?:hi|hello|hey|good\s+morning|good\s+afternoon|good\s+evening|sup|yo|bye|goodbye|see\s+you|cya)\s*(?:there|aura|assistant|atharva)?$/i.test(t) ||
      /\b(?:who\s+are\s+you|what\s+is\s+your\s+name|introduce\s+yourself)\b/i.test(t)) {
    return { intent: 'greeting', confidence: 0.98, method: 'rule-based' };
  }

  // Help & Capabilities
  if (/^(?:help|\?|commands)\b/i.test(t) ||
      /\b(?:what\s+can\s+you\s+do|how\s+do\s+i|how\s+to\s+use|instructions|show\s+help|guide)\b/i.test(t)) {
    return { intent: 'help', confidence: 0.95, method: 'rule-based' };
  }

  // Default fallback
  return { intent: 'unknown', confidence: 0.3, method: 'rule-based' };
}

/**
 * Predict intent using the local trained ML model (Naive Bayes)
 * With strict safety guards against false positive schedule_meeting predictions.
 */
function classifyML(text) {
  if (!mlClassifier || !mlClassifier.isTrained) {
    const loaded = loadMLModel();
    if (!loaded) {
      const fallback = classifyRuleBased(text);
      fallback.note = 'ML model not trained yet. Used rule-based fallback.';
      return fallback;
    }
  }

  // 1. High-confidence deterministic rule check
  const ruleResult = classifyRuleBased(text);
  if (ruleResult.intent !== 'unknown') {
    return {
      ...ruleResult,
      method: 'rule-based-override'
    };
  }

  const result = mlClassifier.classify(text);

  // 2. SAFETY GUARD: If ML classified as schedule_meeting, but text has NO scheduling keywords, override to unknown!
  if (result.intent === 'schedule_meeting' && !hasExplicitSchedulingKeywords(text)) {
    return {
      intent: 'unknown',
      confidence: 0.2,
      method: 'safety-guard',
      mlScores: result.scores
    };
  }

  // 3. If ML confidence is low, return unknown
  if (result.confidence < 0.40) {
    return {
      intent: 'unknown',
      confidence: result.confidence,
      method: 'low-confidence-fallback',
      mlScores: result.scores
    };
  }

  return {
    intent: result.intent,
    confidence: result.confidence,
    method: 'naive-bayes-ml',
    scores: result.scores,
    evaluation: mlModelMeta
  };
}

/**
 * Unified Classifier: supports 'rule_based' or 'ml'
 */
function classifyIntent(text, mode = 'rule_based') {
  if (mode === 'ml') {
    return classifyML(text);
  }
  return classifyRuleBased(text);
}

module.exports = {
  classifyIntent,
  classifyRuleBased,
  classifyML,
  hasExplicitSchedulingKeywords,
  loadMLModel,
  getMLModelMeta: () => mlModelMeta
};
