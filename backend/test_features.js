const fs = require('fs');
const path = require('path');

// Never run the feature suite against the application's live SQLite file.
const testDbPath = path.join(__dirname, 'data', 'test-features.db');
for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(`${testDbPath}${suffix}`, { force: true });
}
process.env.AURA_DB_PATH = testDbPath;

const { db, initDatabase } = require('./db');
const { processUserMessage, getSession } = require('./conversationManager');
const { classifyRuleBased } = require('./nlp/intentClassifier');

initDatabase();

async function runTests() {
  console.log('=== RUNNING COMPREHENSIVE FEATURE TESTS ===\n');

  // Clean test state
  db.prepare('DELETE FROM meetings').run();
  db.prepare('DELETE FROM reminders').run();

  // 1. Test Intent Classification for new queries
  console.log('--- TEST 1: Intent Classification ---');
  const testPhrases = [
    { text: 'can you tell me the meeting slots', expected: 'list_schedule' },
    { text: 'show the meetings list which i have scheduled', expected: 'list_schedule' },
    { text: 'what meetings do i have', expected: 'list_schedule' },
    { text: 'delete the meeting', expected: 'cancel_meeting' },
    { text: 'cancel my 4 PM meeting', expected: 'cancel_meeting' },
    { text: 'delete dog meeting', expected: 'cancel_meeting' },
    { text: 'schedule a meeting of the next date at 3 PM', expected: 'schedule_meeting' }
  ];

  for (const item of testPhrases) {
    const res = classifyRuleBased(item.text);
    const pass = res.intent === item.expected;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] "${item.text}" -> ${res.intent} (expected: ${item.expected})`);
    if (!pass) throw new Error(`Intent classifier failed for "${item.text}"`);
  }

  // 2. Test "can you tell me the meeting slots" when calendar is empty
  console.log('\n--- TEST 2: Meeting slots with empty calendar ---');
  const slotsRes1 = await processUserMessage('can you tell me the meeting slots', 'test_sess_1', 'rule_based');
  console.log('Bot Reply:\n', slotsRes1.reply);
  console.log('Speech:', slotsRes1.speechText);
  if (!slotsRes1.reply.includes('Available Meeting Slots') || !slotsRes1.reply.includes('9:00 AM')) {
    throw new Error('Test 2 Failed: Did not show available slots properly');
  }

  // 3. Schedule a real meeting: "Dog Meeting"
  console.log('\n--- TEST 3: Schedule "Dog Meeting" tomorrow at 3 PM ---');
  const schedRes = await processUserMessage('schedule dog meeting tomorrow at 3 PM', 'test_sess_1', 'rule_based');
  console.log('Bot Reply:\n', schedRes.reply);
  const meetingsInDb = db.prepare('SELECT * FROM meetings').all();
  console.log('Meetings in DB count:', meetingsInDb.length, meetingsInDb.map(m => m.title));
  if (meetingsInDb.length !== 1 || !meetingsInDb[0].title.toLowerCase().includes('dog')) {
    throw new Error('Test 3 Failed: Dog meeting was not saved in real-time');
  }

  // 4. Test "show the meetings list which i have scheduled"
  console.log('\n--- TEST 4: "show the meetings list which i have scheduled" ---');
  const listRes = await processUserMessage('show the meetings list which i have scheduled', 'test_sess_1', 'rule_based');
  console.log('Bot Reply:\n', listRes.reply);
  console.log('Speech:', listRes.speechText);
  if (!/dog meeting/i.test(listRes.reply) || !/dog meeting/i.test(listRes.speechText)) {
    throw new Error('Test 4 Failed: Scheduled meeting list missing Dog Meeting');
  }

  // 5. Test "can you tell me the meeting slots" when 1 meeting is booked
  console.log('\n--- TEST 5: "can you tell me the meeting slots" with booked meeting ---');
  const slotsRes2 = await processUserMessage('can you tell me the meeting slots', 'test_sess_1', 'rule_based');
  console.log('Bot Reply:\n', slotsRes2.reply);
  console.log('Speech:', slotsRes2.speechText);
  if (!/dog meeting/i.test(slotsRes2.reply) || !slotsRes2.reply.includes('Remaining Available Slots')) {
    throw new Error('Test 5 Failed: Did not list booked meeting and remaining open slots');
  }

  // 6. Test "delete the meeting" when exactly 1 meeting exists
  console.log('\n--- TEST 6: "delete the meeting" (single meeting auto-delete) ---');
  const delRes1 = await processUserMessage('delete the meeting', 'test_sess_1', 'rule_based');
  console.log('Bot Reply:\n', delRes1.reply);
  console.log('Speech:', delRes1.speechText);
  const afterDel1 = db.prepare('SELECT * FROM meetings').all();
  console.log('Meetings in DB after delete:', afterDel1.length);
  if (afterDel1.length !== 0) {
    throw new Error('Test 6 Failed: Meeting was not deleted from DB');
  }

  // 7. Add 2 meetings and test interactive delete selection
  console.log('\n--- TEST 7: Multiple meetings delete selection ---');
  await processUserMessage('schedule Project Review tomorrow at 10 AM', 'test_sess_2', 'rule_based');
  await processUserMessage('schedule Team Sync tomorrow at 2 PM', 'test_sess_2', 'rule_based');
  const twoMeetings = db.prepare('SELECT * FROM meetings').all();
  console.log('Created 2 meetings:', twoMeetings.map(m => m.title));

  // User says generic "delete the meeting"
  const multiDelPrompt = await processUserMessage('delete the meeting', 'test_sess_2', 'rule_based');
  console.log('Bot Prompt:\n', multiDelPrompt.reply);
  if (!multiDelPrompt.reply.includes('Which meeting would you like to delete')) {
    throw new Error('Test 7 Failed: Did not prompt user to choose meeting to delete');
  }

  // User selects "1"
  const multiDelChoice = await processUserMessage('1', 'test_sess_2', 'rule_based');
  console.log('Choice Reply:\n', multiDelChoice.reply);
  const afterChoice = db.prepare('SELECT * FROM meetings').all();
  console.log('Remaining meetings in DB:', afterChoice.map(m => m.title));
  if (afterChoice.length !== 1 || !afterChoice[0].title.toLowerCase().includes('team sync')) {
    throw new Error('Test 7 Failed: Meeting #1 was not deleted');
  }

  // User deletes by name: "delete team sync"
  console.log('\n--- TEST 8: Delete by specific title "delete team sync" ---');
  const delSpecific = await processUserMessage('delete team sync', 'test_sess_2', 'rule_based');
  console.log('Bot Reply:\n', delSpecific.reply);
  const afterAllDel = db.prepare('SELECT * FROM meetings').all();
  console.log('Remaining meetings in DB:', afterAllDel.length);
  if (afterAllDel.length !== 0) {
    throw new Error('Test 8 Failed: Team sync was not deleted');
  }

  // 9. Test general questions (math, facts, jokes)
  console.log('\n--- TEST 9: General questions & calculations ---');
  const mathQ = await processUserMessage('what is 25 * 4', 'test_sess_3', 'rule_based');
  console.log('Math:', mathQ.reply);
  if (!mathQ.reply.includes('100')) throw new Error('Test 9 Failed: Math solver failed');

  const timeQ = await processUserMessage('what time is it', 'test_sess_3', 'rule_based');
  console.log('Time:', timeQ.reply);
  if (!/\b(?:am|pm|\d{1,2}:\d{2})\b/i.test(timeQ.reply)) throw new Error('Test 9 Failed: Time query failed');

  const jokeQ = await processUserMessage('tell me a joke', 'test_sess_3', 'rule_based');
  console.log('Joke:', jokeQ.reply);
  if (!jokeQ.reply || jokeQ.reply.length < 10) throw new Error('Test 9 Failed: Joke failed');

  // 10. Test Interruption: User triggers draft without date, then asks for meeting slots
  console.log('\n--- TEST 10: Interruption of pending draft without getting stuck ---');
  const sess = getSession('test_sess_interrupted');
  sess.pendingAction = {
    type: 'create_meeting',
    step: 'await_date_time',
    draft: { title: 'Dog Meeting' }
  };
  const interruptRes = await processUserMessage('can you tell me the meeting slots', 'test_sess_interrupted', 'rule_based');
  console.log('Interrupt Reply:\n', interruptRes.reply);
  if (interruptRes.reply.includes('What date and time would you like to schedule')) {
    throw new Error('Test 10 Failed: Assistant got stuck repeating the scheduling question!');
  }
  if (!interruptRes.reply.includes('Available Meeting Slots')) {
    throw new Error('Test 10 Failed: Assistant did not switch to answering the slot inquiry');
  }

  console.log('\n🎉 ALL 10 TESTS PASSED WITH 100% SUCCESS!');
}

runTests().catch(err => {
  console.error('\n❌ TEST RUNNER FAILED:', err);
  process.exit(1);
});
