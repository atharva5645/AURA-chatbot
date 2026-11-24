# AURA — Atharva’s Intelligent Reminder Assistant

> **A Voice-Enabled Full-Stack Student Productivity & Scheduling Assistant**  
> Built with React + Vite, Node.js + Express, SQLite, and Web Speech API.  
> **100% Local Intelligence — Zero Gemini / Paid AI APIs required.**

---

## 📌 Project Overview

**AURA** (*Atharva’s Intelligent Reminder Assistant*) is an autonomous, voice-enabled assistant designed specifically for college students to effortlessly organize their daily schedules, classes, meetings, and deadlines. 

Unlike conventional chatbots that rely on expensive or opaque cloud APIs (like OpenAI or Google Gemini), AURA runs a **100% private, local NLP pipeline** coupled with browser-native Web Speech recognition and synthesis. Students can talk to AURA using their microphone or type naturally to schedule meetings, set deadlines, detect scheduling conflicts, and receive audible alerts.

---

## 🚀 Key Features

- **🎙️ Browser-Native Voice Interface:**
  - Speech input via the W3C Web Speech Recognition API (`SpeechRecognition` / `webkitSpeechRecognition`).
  - Read-aloud responses with browser Text-to-Speech (`speechSynthesis`).
  - Dedicated **Mute / Speak Toggle** in the header.
  - Procedural Web Audio API sound chime when reminders trigger.
  - Zero microphone permissions requested until the student presses the mic button.
  - Seamless fallback to keyboard text chat on any browser.

- **💬 Intelligent Conversational Chatbot:**
  - **Natural Language Parsing:** Understood requests include:
    - *"Schedule a project meeting tomorrow at 3 PM with Prof. Sharma"*
    - *"Remind me to submit my assignment at 6 PM"*
    - *"What meetings do I have this week?"*
    - *"Move my project meeting to Friday at 2 PM"*
    - *"Cancel my 4 PM meeting"*
  - **Multi-Turn State Machine:** Proactively asks follow-up questions when details are missing (e.g. if the user says *"Schedule a meeting"*, AURA asks for title, date, and time).
  - **Confirmation Summary Cards:** Presents a summary card with **Confirm & Save** and **Cancel** buttons before persisting changes.
  - **Automated Conflict Detection:** Analyzes overlapping meetings in SQLite. If a conflict is detected, AURA warns the student and suggests available alternative free slots on that day.

- **📅 Student Productivity Dashboard & Calendar:**
  - **Productivity Dashboard:** Overview of today's date, metric summary cards, today's schedule, pending reminders, and quick-add buttons.
  - **Multi-View Calendar:** Interactive **Day**, **Week**, and **Month** views. Click to view meeting details, reschedule, or cancel.
  - **Smart Reminders:** Priority tags (*High*, *Medium*, *Low*), lead-time advance notices (*15m*, *30m*, *1hr*), and one-click completion checkboxes.

- **🧠 Dual-Engine NLP (Rule-Based + Local Naive Bayes ML):**
  - **Rule-Based Engine:** Deterministic regex heuristics and semantic entity extraction for high precision on dates, times, and attendees.
  - **Optional Local ML Classifier:** Pure JavaScript Multinomial Naive Bayes model with n-gram feature extraction and TF-IDF weighting.
  - Self-contained training script (`npm run train`) trained on a realistic college student dataset (`backend/ml/dataset.json`).
  - Interactive **Live Intent Tester** playground in the Settings view!

---

## 🏗️ Project Architecture

```
AURA-PROJECT/
├── backend/
│   ├── data/
│   │   └── aura.db                   # SQLite database (auto-generated)
│   ├── ml/
│   │   ├── dataset.json              # 125+ labeled student utterance examples
│   │   ├── naiveBayes.js             # Pure JS Multinomial Naive Bayes implementation
│   │   ├── train.js                  # Model training & 5-fold CV evaluation script
│   │   └── model.json                # Pre-trained model artifact
│   ├── nlp/
│   │   ├── dateParser.js             # Natural relative & absolute date/time parser
│   │   ├── entityExtractor.js        # Extracts title, date, time, attendees, lead-time
│   │   └── intentClassifier.js       # Hybrid Rule-Based + Naive Bayes ML engine
│   ├── routes/
│   │   ├── meetings.js               # CRUD endpoints & conflict validation
│   │   ├── reminders.js              # Reminders management & status toggle
│   │   ├── chat.js                   # Conversation processing & confirmation actions
│   │   ├── classifier.js             # ML status, training trigger & intent testing
│   │   └── stats.js                  # Dashboard metrics & sample data reset
│   ├── conversationManager.js        # Multi-turn conversational session state machine
│   ├── db.js                         # SQLite schema, initial seeds & conflict detection
│   ├── server.js                     # Express app setup & CORS configuration
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── public/
│   │   └── favicon.svg               # SVG assistant icon
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.jsx           # Responsive drawer navigation
│   │   │   ├── Header.jsx            # Current date, TTS voice toggle & quick actions
│   │   │   ├── DashboardView.jsx     # Overview, stats, today's schedule & reminders
│   │   │   ├── ChatAssistantView.jsx # Conversational voice/text UI with action cards
│   │   │   ├── CalendarView.jsx      # Day, Week, and Month interactive calendar views
│   │   │   ├── RemindersView.jsx     # Filterable list of reminders & deadlines
│   │   │   ├── SettingsView.jsx      # Voice selection, ML model toggle & intent tester
│   │   │   ├── MeetingModal.jsx      # Create/edit/reschedule meeting modal with conflict check
│   │   │   ├── ReminderModal.jsx     # Create/edit reminder modal
│   │   │   └── NotificationToast.jsx # Due reminder popup alerts with chime
│   │   ├── context/
│   │   │   └── AppContext.jsx        # Global React state for meetings, voice & alerts
│   │   ├── hooks/
│   │   │   ├── useSpeechRecognition.js # Web Speech API voice capture hook
│   │   │   ├── useSpeechSynthesis.js   # Browser text-to-speech hook
│   │   │   └── useReminderAlerts.js    # Due-time monitoring & desktop notification hook
│   │   ├── services/
│   │   │   └── api.js                # Backend API client
│   │   ├── utils/
│   │   │   ├── dateUtils.js          # Date/time formatting & calendar matrices
│   │   │   └── sound.js              # Web Audio API procedural audio chime
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css                 # Plain, readable CSS (Navy & Teal palette)
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── package.json                      # Root package with unified run scripts
├── run.js                            # Cross-platform concurrent server runner
└── README.md
```

---

## ⚙️ Prerequisites

- **Node.js**: v18.0.0 or newer (v20+ or v24+ recommended).
- **Web Browser**: Google Chrome, Microsoft Edge, or Safari for full Web Speech API recognition.
- **Microphone**: Any built-in or external mic.

---

## 🛠️ Installation & Setup

### 1. Clone or Open the Project
Open terminal in the project root:
```bash
cd "AURA- A ai based chat bot for meeting brief"
```

### 2. Install Dependencies
Install dependencies for both backend and frontend:
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Return to root
cd ..
```

---

## ▶️ Running the Application

### Option A: One-Command Unified Start (Recommended)
From the root project directory, run:
```bash
npm start
```
*This starts the Express backend on `http://localhost:5000` and the Vite React development server on `http://localhost:3000` concurrently.*

### Option B: Running Separately in Two Terminals

**Terminal 1 — Backend:**
```bash
cd backend
npm start
```
*Backend runs on `http://localhost:5000`.*

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```
*Frontend runs on `http://localhost:3000`.*

Open your browser and navigate to: **`http://localhost:3000`**

---

## 💬 Chatbot Capabilities & Voice Examples

AURA understands natural spoken and written student queries:

| Intent | Sample Student Utterances |
|---|---|
| **Schedule Meeting** | *"Schedule a project meeting tomorrow at 3 PM"*<br>*"Book meeting with Prof. Sharma on Friday at 11 AM"*<br>*"Set up team sync today at 4 PM in Lab 2"* |
| **Create Reminder** | *"Remind me to submit my assignment at 6 PM"*<br>*"Set a reminder to pay semester fees tomorrow at 11 AM"*<br>*"Remind me to return library book on Wednesday"* |
| **List Schedule** | *"What meetings do I have this week?"*<br>*"Show my schedule for today"*<br>*"List all my reminders"* |
| **Reschedule** | *"Move my project meeting to Friday at 2 PM"*<br>*"Reschedule team sync to tomorrow at 5 PM"* |
| **Cancel** | *"Cancel my 4 PM meeting"*<br>*"Delete reminder submit assignment"*<br>*"Cancel today's study session"* |
| **Follow-up Questions** | Student: *"Schedule a meeting"*<br>AURA: *"What is the topic or title of the meeting?"*<br>Student: *"AI Capstone"*<br>AURA: *"What date and time would you like to schedule AI Capstone for?"* |
| **Conflict Handling** | AURA: *"⚠️ Time Conflict Warning: You already have 'Team Sync' from 2:00 PM to 3:00 PM. Alternative available slots: 3:00 PM - 4:00 PM, 4:00 PM - 5:00 PM. Choose one?"* |

---

## 🧠 How the Local NLP Engine Works

AURA avoids external AI APIs entirely. It features a transparent, two-stage local architecture:

```
User Utterance (Voice / Text)
          │
          ▼
   [Text Cleaning]
          │
   ┌──────┴─────────────────────────────────┐
   │                                        │
   ▼                                        ▼
[Rule-Based Heuristic Engine]    [Local Naive Bayes ML]
(Regex & Semantic Keyword Maps)   (TF-IDF + Unigram/Bigram tokens)
   │                                        │
   └──────┬─────────────────────────────────┘
          │ (Predicted Intent + Confidence Score)
          ▼
   [Entity Extractor & Date Parser]
   • Date: 'tomorrow' -> YYYY-MM-DD
   • Time: '3 PM' -> 15:00, range -> 15:00-16:00
   • Title & Attendees extraction
          │
          ▼
   [Conversation State Machine]
   • Complete? -> Conflict Check -> Confirmation Card
   • Incomplete? -> Multi-turn Follow-up Question
          │
          ▼
   [SQLite Persistence (aura.db)]
```

### 1. The Rule-Based Heuristic Parser
- Employs deterministic regular expressions to match intent keywords (`schedule`, `remind me`, `cancel`, `move`, `what meetings`).
- Handles relative dates (*"today"*, *"tomorrow"*, *"next Friday"*, *"day after tomorrow"*, *"Nov 25"*) and 12-hr / 24-hr times (*"3 PM"*, *"3:30 pm"*, *"15:00"*, *"noon"*).
- Extracts attendees (*"with Prof. Sharma"*) and reminder lead times (*"30 minutes before"*).

### 2. The Multinomial Naive Bayes ML Classifier
- Written in pure JavaScript in `backend/ml/naiveBayes.js`.
- Features an n-gram tokenizer that extracts word unigrams and bigrams (e.g. `schedule_meeting`, `remind_me`).
- Computes class prior probabilities $P(C_k)$ and word likelihoods $P(w|C_k)$ with Laplace smoothing ($\alpha = 1.0$).
- Normalizes log-posteriors using numerically stable Softmax to yield calibrated probabilities between `0.0` and `1.0`.
- To retrain the model at any time from terminal:
  ```bash
  npm run train
  ```
  *(Or click **Retrain ML Model** inside the in-app Settings screen!)*

---

## 🎙️ Voice & Browser Limitations

1. **Web Speech API (`SpeechRecognition`):**
   - The Speech Recognition API is supported natively in **Google Chrome**, **Microsoft Edge**, and **Safari**.
   - Browsers like Firefox or Tor do not implement the Web Speech recognition standard; on those browsers, AURA automatically displays an informative badge and defaults smoothly to keyboard text chat.
2. **Microphone Permissions:**
   - Microphone permission is requested **only when the user clicks the microphone button**. AURA never opens or monitors the mic in the background.
3. **Speech Synthesis (`speechSynthesis`):**
   - Text-to-speech output is universally supported across modern browsers. The student can toggle speech output on or off at any moment via the header **Voice Active / Muted** button.

---

## 🗄️ Database Schema (SQLite)

Database file stored at: `backend/data/aura.db`

### `meetings` Table
| Column | Type | Description |
|---|---|---|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Unique identifier |
| `title` | `TEXT NOT NULL` | Subject / agenda |
| `date` | `TEXT NOT NULL` | Date (`YYYY-MM-DD`) |
| `start_time`| `TEXT NOT NULL` | Start time in 24-hr (`HH:MM`) |
| `end_time` | `TEXT NOT NULL` | End time in 24-hr (`HH:MM`) |
| `attendees` | `TEXT` | Comma-separated list |
| `location` | `TEXT` | Venue / Google Meet link |
| `notes` | `TEXT` | Notes & preparation items |
| `created_at`| `DATETIME` | Creation timestamp |

### `reminders` Table
| Column | Type | Description |
|---|---|---|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Unique identifier |
| `title` | `TEXT NOT NULL` | Reminder task |
| `date` | `TEXT NOT NULL` | Due date (`YYYY-MM-DD`) |
| `time` | `TEXT NOT NULL` | Due time (`HH:MM`) |
| `lead_time_minutes` | `INTEGER` | Advance warning (0, 10, 15, 30, 60 min) |
| `completed` | `INTEGER DEFAULT 0` | 0 = Active, 1 = Done |
| `priority` | `TEXT DEFAULT 'medium'`| `low`, `medium`, or `high` |
| `notes` | `TEXT` | Additional details |

---

## 🔌 Backend REST API Endpoints

### Meetings
- `GET /api/meetings` — List all meetings (optional `?date=YYYY-MM-DD`)
- `POST /api/meetings` — Create meeting (with conflict detection; accepts `force: true` to bypass)
- `GET /api/meetings/:id` — Retrieve meeting by ID
- `PUT /api/meetings/:id` — Update or reschedule meeting
- `DELETE /api/meetings/:id` — Cancel / delete meeting

### Reminders
- `GET /api/reminders` — List reminders (optional `?completed=0|1`)
- `POST /api/reminders` — Create new reminder
- `PUT /api/reminders/:id` — Update reminder
- `PATCH /api/reminders/:id/toggle` — Toggle completed state
- `DELETE /api/reminders/:id` — Delete reminder

### Chatbot & NLP
- `POST /api/chat` — Send message `{ message, sessionId, classifierMode }`
- `POST /api/chat/confirm` — Confirm or cancel a pending action `{ sessionId, confirmed: true/false }`
- `GET /api/chat/history` — Get session message logs
- `DELETE /api/chat/history` — Clear session history

### Machine Learning & System
- `GET /api/stats` — Dashboard counters & next upcoming meeting
- `POST /api/stats/reset-sample-data` — Reset database with demo college records
- `GET /api/classifier/status` — ML model status, dataset count & accuracy
- `POST /api/classifier/train` — Retrain local Naive Bayes model
- `POST /api/classifier/predict` — Test predict intent on arbitrary text

---

## 🎓 College Viva & Project Defense Guide

When demonstrating this project for academic evaluation or viva:

1. **Why No Paid AI APIs (OpenAI/Gemini)?**
   - *Answer:* College projects requiring external paid API keys encounter network latency, subscription costs, privacy issues, and rate limits. AURA demonstrates that 90% of task-oriented scheduling workflows can be solved with **deterministic regex semantic parsers and local statistical Machine Learning**, delivering instantaneous response times with zero operating costs.
2. **How is Overlap / Conflict Avoidance Handled?**
   - *Answer:* When a meeting creation or reschedule is requested, AURA queries SQLite for existing meetings on the same date. It tests the interval overlap condition: $(StartTime_A < EndTime_B) \land (EndTime_A > StartTime_B)$. If true, it scans candidate 1-hour slots from 9:00 AM to 6:00 PM and proposes conflict-free alternative slots.
3. **How Does Multi-turn State Work Without Cloud LLMs?**
   - *Answer:* The backend maintains a state machine keyed by `sessionId`. When a user says *"Schedule a meeting"*, the state is marked `await_title`. Once the title is supplied, the state advances to `await_date_time`. Once complete, it calculates conflicts and transitions to `confirm`, returning an interactive card with Confirm/Cancel triggers.
4. **How Does the Naive Bayes Classifier Compute Confidence?**
   - *Answer:* It applies Bayes' theorem: $P(C|d) \propto P(C) \prod_{i} P(w_i|C)$. Word likelihoods use Laplace smoothing ($\alpha = 1.0$) to handle unseen words. To convert arbitrary log-posteriors into intuitive percentages (0–100%), it applies a softmax transformation.

---

## 📜 License

Created by **Atharva**. Built for educational and college project purposes. Open source under the **MIT License**.
