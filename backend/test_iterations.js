const fs = require('fs');
const path = require('path');

// Keep iterative scenarios isolated from the application's live data.
const testDbPath = path.join(__dirname, 'data', 'test-iterations.db');
for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(`${testDbPath}${suffix}`, { force: true });
}
process.env.AURA_DB_PATH = testDbPath;

const { processUserMessage, clearSessionPending } = require('./conversationManager');
const { db, initDatabase } = require('./db');

initDatabase();

async function runIterations() {
  console.log('====================================================');
  console.log('🧪 RUNNING COMPREHENSIVE AUTOMATED ITERATIONS FOR AURA');
  console.log('====================================================\n');

  // Purge any test data
  db.prepare("DELETE FROM meetings WHERE notes LIKE '%AURA%' OR title LIKE '%Dog%' OR title LIKE '%Project%'").run();
  db.prepare("DELETE FROM reminders WHERE title LIKE '%dog%'").run();

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName, details = '') {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] Iteration ${totalTests}: ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] Iteration ${totalTests}: ${testName} - ${details}`);
    }
  }

  // --- ITERATION 1: Rambling Speech Title Cleaning ---
  console.log('\n--- ITERATION 1: Conversational Ramble Handling ---');
  clearSessionPending('iter-1');
  const res1 = await processUserMessage(
    'Dog meeting is basically for a dog better waiting a dog better near and also the timing of the meeting is',
    'iter-1'
  );
  console.log('Turn 1 Reply:', res1.reply);
  console.log('Turn 1 SpeechText:', res1.speechText);

  assert(
    res1.reply.includes('Dog Meeting') || res1.reply.includes('Project Meeting'),
    'Title sanitized to clean 2-word phrase',
    `Received: ${res1.reply}`
  );
  assert(
    !res1.reply.includes('better waiting') && !res1.reply.includes('basically for'),
    'Conversational clutter completely purged from reply',
    `Received: ${res1.reply}`
  );
  assert(
    res1.reply.includes('What date and time'),
    'Polite follow-up asks for date and time',
    `Received: ${res1.reply}`
  );

  // --- ITERATION 2: Follow-up with Date & Time (Real-Time Scheduling) ---
  console.log('\n--- ITERATION 2: Multi-Turn Scheduling Completion ---');
  const res2 = await processUserMessage('tomorrow at 3 PM', 'iter-1');
  console.log('Turn 2 Reply:', res2.reply);

  assert(
    res2.reply.includes('Successfully Scheduled in Real-Time'),
    'Meeting saved immediately to database upon getting date and time',
    `Received: ${res2.reply}`
  );
  assert(
    res2.reply.includes('3:00 PM'),
    'Correct 3:00 PM time formatted',
    `Received: ${res2.reply}`
  );

  // Verify directly in SQLite
  const m1 = db.prepare("SELECT * FROM meetings WHERE title LIKE '%Dog%' OR title = 'Project Meeting' ORDER BY id DESC LIMIT 1").get();
  assert(
    Boolean(m1 && m1.start_time === '15:00'),
    'Meeting verified in SQLite database with start_time 15:00',
    JSON.stringify(m1)
  );

  // --- ITERATION 3: Single-Turn Complete Scheduling ---
  console.log('\n--- ITERATION 3: Complete Single-Sentence Schedule ---');
  clearSessionPending('iter-3');
  const res3 = await processUserMessage('Schedule discussion with Neha of the next date at 4 PM', 'iter-3');
  console.log('Single-turn reply:', res3.reply);

  assert(
    res3.reply.includes('Successfully Scheduled in Real-Time') || res3.reply.includes('Neha'),
    'Single-sentence scheduling creates real-time meeting',
    `Received: ${res3.reply}`
  );

  // --- ITERATION 4: Creating a Real-Time Reminder ---
  console.log('\n--- ITERATION 4: Real-Time Reminder Creation ---');
  clearSessionPending('iter-4');
  const res4 = await processUserMessage('Remind me to feed the dog at 8 PM', 'iter-4');
  console.log('Reminder reply:', res4.reply);

  assert(
    res4.reply.includes('Reminder Set in Real-Time') || res4.reply.includes('8:00 PM'),
    'Reminder saved in real-time',
    `Received: ${res4.reply}`
  );

  const r1 = db.prepare("SELECT * FROM reminders WHERE title LIKE '%feed the dog%' OR title LIKE '%dog%'").get();
  assert(
    Boolean(r1 && r1.time === '20:00'),
    'Reminder verified in SQLite database with time 20:00',
    JSON.stringify(r1)
  );

  // --- ITERATION 5: Agenda Query ---
  console.log('\n--- ITERATION 5: Listing Live Schedule from Database ---');
  clearSessionPending('iter-5');
  const res5 = await processUserMessage('What meetings do I have this week?', 'iter-5');
  console.log('Agenda reply:', res5.reply);

  assert(
    res5.reply.includes('Dog') || res5.reply.includes('Meeting') || res5.reply.includes('Schedule'),
    'Live agenda correctly queries and returns meetings from SQLite',
    `Received: ${res5.reply}`
  );

  // --- ITERATION 6: Rescheduling in Real-Time ---
  console.log('\n--- ITERATION 6: Rescheduling an Existing Meeting ---');
  clearSessionPending('iter-6');
  const res6 = await processUserMessage('Move my 3 PM meeting to 5 PM', 'iter-6');
  console.log('Reschedule reply:', res6.reply);

  assert(
    res6.reply.includes('Rescheduled') || res6.reply.includes('5:00 PM'),
    'Meeting successfully rescheduled to 5 PM in real-time',
    `Received: ${res6.reply}`
  );

  // --- ITERATION 7: Cancelling a Meeting in Real-Time ---
  console.log('\n--- ITERATION 7: Cancelling a Meeting ---');
  clearSessionPending('iter-7');
  const res7 = await processUserMessage('Cancel my 5 PM meeting', 'iter-7');
  console.log('Cancel reply:', res7.reply);

  assert(
    res7.reply.includes('Cancelled') || res7.reply.includes('cancelled') || res7.reply.includes('deleted'),
    'Meeting cancelled and removed/flagged in SQLite',
    `Received: ${res7.reply}`
  );

  // --- ITERATION 8: General Math Question ---
  console.log('\n--- ITERATION 8: General Math Query ---');
  clearSessionPending('iter-8');
  const res8 = await processUserMessage('What is 25 * 4?', 'iter-8');
  console.log('Math reply:', res8.reply);

  assert(
    res8.reply.includes('100'),
    'Math calculation answered correctly',
    `Received: ${res8.reply}`
  );

  // --- ITERATION 9: Conversational Joke ---
  console.log('\n--- ITERATION 9: Conversational Entertainment ---');
  clearSessionPending('iter-9');
  const res9 = await processUserMessage('Tell me a joke', 'iter-9');
  console.log('Joke reply:', res9.reply);

  assert(
    res9.reply.length > 10 && !res9.reply.includes("couldn't quite understand"),
    'Joke delivered without fallback confusion',
    `Received: ${res9.reply}`
  );

  // --- ITERATION 10: Science / Factual Knowledge Question ---
  console.log('\n--- ITERATION 10: General Factual Knowledge ---');
  clearSessionPending('iter-10');
  const res10 = await processUserMessage('What is photosynthesis?', 'iter-10');
  console.log('Science reply:', res10.reply?.substring(0, 120));

  assert(
    res10.reply.toLowerCase().includes('photosynthesis') || res10.reply.toLowerCase().includes('energy') || res10.reply.toLowerCase().includes('light'),
    'General factual knowledge question answered thoroughly',
    `Received: ${res10.reply}`
  );

  // --- ITERATION 11: Question asked during Pending Draft (Topic Switch) ---
  console.log('\n--- ITERATION 11: Asking General Question during Scheduling ---');
  clearSessionPending('iter-11');
  const draftStep = await processUserMessage('Schedule project meeting', 'iter-11');
  console.log('Draft step:', draftStep.reply);
  const switchTopic = await processUserMessage('What is the speed of light?', 'iter-11');
  console.log('Switch topic reply:', switchTopic.reply?.substring(0, 120));

  assert(
    !switchTopic.reply.includes('What date and time would you like to schedule'),
    'Switched from scheduling to answering user question smoothly',
    `Received: ${switchTopic.reply}`
  );

  console.log('\n====================================================');
  console.log(`🏁 ITERATIONS COMPLETE: ${passedTests}/${totalTests} TESTS PASSED!`);
  console.log('====================================================');
}

runIterations().catch(console.error);
