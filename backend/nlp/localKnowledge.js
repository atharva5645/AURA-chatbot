/**
 * Local Knowledge & Question Answering Engine for AURA
 * Provides instant answers to general questions, calculations, time/date,
 * study tips, jokes, and encyclopedia lookups even when LLMs are offline.
 */

const JOKES = [
  "Why do programmers prefer dark mode? Because light attracts bugs! 🐛",
  "Why was the JavaScript developer sad? Because they didn't know how to 'null' their feelings! 😄",
  "There are 10 types of people in the world: those who understand binary, and those who don't! 💻",
  "Why do Java programmers wear glasses? Because they don't C#! 🤓",
  "A SQL query walks into a bar, walks up to two tables and asks: 'Can I join you?' 🍺",
  "Why did the web developer leave the restaurant? Because of the table layout! 🍽️"
];

const FACTS = [
  "Honey never spoils! Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still perfectly edible.",
  "The first computer bug was an actual real moth found trapped inside the Harvard Mark II computer in 1947 by Grace Hopper's team.",
  "Sound travels about 4.3 times faster in water (approx. 1,480 m/s) than in air (approx. 343 m/s).",
  "A single teaspoon of honey represents the life work of 12 bees.",
  "The Apollo 11 guidance computer had only about 4 kilobytes of RAM and a 32-kilobyte ROM."
];

const STUDY_TIPS = [
  "🧠 **Active Recall:** Instead of passively reading your notes, close the book and try to explain the concept in your own words.",
  "⏱️ **Pomodoro Technique:** Focus on a single task for 25 minutes, then take a 5-minute break. After four cycles, take a longer 20-minute break.",
  "🔁 **Spaced Repetition:** Review material after 1 day, then 3 days, then 1 week, and then 1 month to move information from short-term to long-term memory.",
  " Feynman Technique:** Learn a concept by explaining it in the simplest possible terms, as if teaching a middle-school student."
];

/**
 * Safely evaluates simple math expressions: e.g. "what is 25 * 4", "50 + 20", "15% of 200"
 */
function solveMathExpression(text) {
  const lower = text.toLowerCase().trim();

  // Percentage: e.g. "15% of 200", "what is 20 percent of 500"
  const percentMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(\d+(?:\.\d+)?)/i);
  if (percentMatch) {
    const p = parseFloat(percentMatch[1]);
    const total = parseFloat(percentMatch[2]);
    const ans = (p / 100) * total;
    return `${p}% of ${total} is **${ans}**.`;
  }

  // Basic arithmetic: "what is 25 * 4", "calculate 100 / 5", "50 + 35"
  const mathMatch = lower.match(/(?:what\s+is|calculate|evaluate|solve)?\s*(-?\d+(?:\.\d+)?)\s*([\+\-\*\/xX\^])\s*(-?\d+(?:\.\d+)?)/i);
  if (mathMatch) {
    const a = parseFloat(mathMatch[1]);
    let op = mathMatch[2];
    const b = parseFloat(mathMatch[3]);
    let result = 0;

    if (op === 'x' || op === 'X' || op === '*') {
      result = a * b;
      op = '×';
    } else if (op === '/') {
      if (b === 0) return "Division by zero is undefined.";
      result = a / b;
      op = '÷';
    } else if (op === '+') {
      result = a + b;
    } else if (op === '-') {
      result = a - b;
    } else if (op === '^') {
      result = Math.pow(a, b);
    }

    const formattedAns = Number.isInteger(result) ? result : parseFloat(result.toFixed(4));
    return `${a} ${op} ${b} = **${formattedAns}**.`;
  }

  return null;
}

/**
 * Fetch a factual summary from Wikipedia REST API with zero credentials
 */
async function fetchWikipediaSummary(query) {
  try {
    let cleanQuery = query
      .replace(/^(?:what\s+is|who\s+is|who\s+was|explain|tell\s+me\s+about|define|meaning\s+of)\s+/i, '')
      .replace(/[?!.]+$/, '')
      .trim();

    if (!cleanQuery || cleanQuery.length < 2) return null;

    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQuery.replace(/\s+/g, '_'))}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AURA-Assistant/1.0 (Atharva Assistant)'
      }
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    if (data.type === 'standard' && data.extract) {
      return {
        title: data.title,
        extract: data.extract,
        description: data.description || ''
      };
    }
  } catch (e) {
    // Fail silently to fall back
  }
  return null;
}

/**
 * Answer general questions, facts, calculations, time/date, and conversational queries
 */
async function answerGeneralQuestion(text) {
  const lower = text.toLowerCase().trim();

  // 0. Greetings & Friendly Openers ("hii", "hello", "hey", "what's up", "yo")
  if (/^(?:hi|hii|hiii|hello|hey|heyy|heyyy|sup|yo|greetings|good\s+(?:morning|afternoon|evening))\b/i.test(lower)) {
    const greetings = [
      "👋 **Hello Atharva!** Great to see you! How is your day going? Feel free to ask me anything, brainstorm ideas, or let me know if you need to schedule a meeting! 😊",
      "✨ **Hey there!** I'm AURA, your AI assistant. Whether you want to discuss coding, ask questions, or manage your schedule, I'm here for you! What's on your mind?",
      "👋 **Hi Atharva!** Hope you're having an awesome day. How can I help you today? Ask me any question or tell me what you'd like to work on!"
    ];
    const picked = greetings[Math.floor(Math.random() * greetings.length)];
    return {
      reply: picked,
      speechText: "Hello Atharva! How can I help you today?"
    };
  }

  // 1. Live Time Query
  if (/\b(?:what\s+time\s+is\s+it|what's\s+the\s+time|current\s+time|tell\s+me\s+the\s+time)\b/i.test(lower)) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return {
      reply: `⏰ It is currently **${timeStr}**.`,
      speechText: `It is currently ${timeStr}.`
    };
  }

  // 2. Live Date Query
  if (/\b(?:what\s+is\s+today's\s+date|what's\s+the\s+date|today's\s+date|what\s+date\s+is\s+today|what\s+day\s+is\s+today|current\s+date)\b/i.test(lower)) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return {
      reply: `📅 Today is **${dateStr}**.`,
      speechText: `Today is ${dateStr}.`
    };
  }

  // 3. Math Expression Solving
  const mathAnswer = solveMathExpression(text);
  if (mathAnswer) {
    return {
      reply: `🧮 ${mathAnswer}`,
      speechText: mathAnswer.replace(/[*#]/g, '')
    };
  }

  // 4. Jokes
  if (/\b(?:tell\s+me\s+a\s+joke|make\s+me\s+laugh|say\s+something\s+funny|joke)\b/i.test(lower)) {
    const joke = JOKES[Math.floor(Math.random() * JOKES.length)];
    return {
      reply: `🎭 Here's one for you:\n\n${joke}`,
      speechText: joke.replace(/[🐛😄💻🤓🍺🍽️]/g, '')
    };
  }

  // 5. Fun Facts
  if (/\b(?:tell\s+me\s+a\s+fun\s+fact|fun\s+fact|interesting\s+fact|did\s+you\s+know)\b/i.test(lower)) {
    const fact = FACTS[Math.floor(Math.random() * FACTS.length)];
    return {
      reply: `💡 **Fun Fact:**\n\n${fact}`,
      speechText: `Did you know? ${fact}`
    };
  }

  // 6. Study Tips & Advice
  if (/\b(?:how\s+to\s+study|study\s+tips|tips\s+for\s+studying|how\s+to\s+prepare\s+for\s+exams|how\s+to\s+focus|time\s+management\s+tips)\b/i.test(lower)) {
    const tips = STUDY_TIPS.join('\n\n');
    return {
      reply: `📚 **High-Impact Study Strategies for College:**\n\n${tips}`,
      speechText: "Here are high impact study strategies: Use active recall by explaining concepts in your own words, try the Pomodoro technique with 25 minute focus sessions, and space your reviews over several days."
    };
  }

  // 7. Identity & Creator
  if (/\b(?:who\s+are\s+you|what\s+is\s+your\s+name|who\s+made\s+you|who\s+created\s+you)\b/i.test(lower)) {
    return {
      reply: `👋 I am **AURA** (Atharva's Intelligent Reminder & Scheduling Assistant), an AI voice companion designed to manage your schedule, set reminders, and answer your questions naturally in real-time!`,
      speechText: "I am AURA, Atharva's intelligent reminder and scheduling assistant. I can schedule your meetings, set reminders, and answer your questions anytime."
    };
  }

  if (/\b(?:who\s+is\s+atharva|who's\s+atharva)\b/i.test(lower)) {
    return {
      reply: `👤 **Atharva** is my creator and user! I am tailored to help Atharva organize college classes, meetings, project reviews, and daily study reminders seamlessly.`,
      speechText: "Atharva is my creator and user. I am designed to assist Atharva with scheduling, college tasks, and reminders."
    };
  }

  // 8. Chit-Chat / Well-Being
  if (/^(?:how\s+are\s+you|how\s+are\s+things|how's\s+it\s+going|are\s+you\s+there)\b/i.test(lower)) {
    return {
      reply: `😊 I'm doing great and ready to help! What's on your mind today? You can ask me any question or tell me to schedule a meeting.`,
      speechText: "I'm doing great and ready to help! What's on your mind today?"
    };
  }

  if (/\b(?:thank\s+you|thanks\s+aura|thanks)\b/i.test(lower)) {
    return {
      reply: `You're very welcome! Let me know whenever you need help with anything else. 😊`,
      speechText: "You are very welcome! Let me know whenever you need anything else."
    };
  }

  // 9. Factual Encyclopedia Lookup via Wikipedia
  const isFactualQuery = /^(?:what\s+is|who\s+is|who\s+was|explain|tell\s+me\s+about|define)\s+/i.test(lower);
  if (isFactualQuery) {
    const wiki = await fetchWikipediaSummary(text);
    if (wiki) {
      return {
        reply: `📖 **${wiki.title}**${wiki.description ? ` *(${wiki.description})*` : ''}\n\n${wiki.extract}`,
        speechText: wiki.extract.split('. ').slice(0, 2).join('. ') + '.'
      };
    }

    // Keep essential questions useful when the optional Wikipedia lookup is
    // unavailable (for example, while running fully offline).
    const offlineFacts = [
      {
        pattern: /\bphotosynthesis\b/i,
        reply: 'Photosynthesis is the process by which plants, algae, and some bacteria use light energy to convert water and carbon dioxide into glucose, releasing oxygen.'
      },
      {
        pattern: /\bspeed\s+of\s+light\b/i,
        reply: 'The speed of light in a vacuum is exactly 299,792,458 metres per second (about 300,000 kilometres per second).'
      }
    ];
    const offlineFact = offlineFacts.find(({ pattern }) => pattern.test(lower));
    if (offlineFact) {
      return {
        reply: `ðŸ“– ${offlineFact.reply}`,
        speechText: offlineFact.reply
      };
    }
  }

  // 10. Open-ended conversational guidance (like ChatGPT/Gemini)
  if (/\b(?:help\s+me|can\s+you|what\s+do\s+you\s+think|tell\s+me|i\s+need|i\s+want|how\s+do\s+i|opinion|advice|suggest|idea|thoughts)\b/i.test(lower)) {
    return {
      reply: `💡 I'd love to help you with that! As your AI assistant, I can explain concepts, write code, brainstorm project ideas, or help plan your calendar.\n\nCould you tell me a bit more detail about what you have in mind?`,
      speechText: "I'd love to help with that! Tell me a bit more about what you have in mind."
    };
  }

  // 11. General entity lookup for non-prefixed topics
  if (text.trim().split(/\s+/).length <= 4 && text.length > 2) {
    const wiki = await fetchWikipediaSummary(text);
    if (wiki) {
      return {
        reply: `📖 **${wiki.title}**${wiki.description ? ` *(${wiki.description})*` : ''}\n\n${wiki.extract}`,
        speechText: wiki.extract.split('. ').slice(0, 2).join('. ') + '.'
      };
    }
  }

  return null;
}

module.exports = {
  answerGeneralQuestion,
  solveMathExpression,
  fetchWikipediaSummary
};
