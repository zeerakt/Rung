/**
 * Automated Unit Tests for Multiplayer Room Manager & Fog-of-War State Redaction
 * Run via: node tests/multiplayer.test.mjs
 */

import assert from 'node:assert/strict';
import { RungRoomManager, sanitizeStateForSeat } from '../server/roomManager.mjs';
import { VARIANTS, SEATS } from '../src/engine/rungEngine.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAILED: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('\n=== RUNG MULTIPLAYER & FOG-OF-WAR TEST SUITE ===');

test('1. Room Creation, Human Seat Assignment & Reconnection Token', () => {
  const mgr = new RungRoomManager();
  const { room, hostSeat, hostToken } = mgr.createRoom({
    roomCode: 'LAHORE',
    variant: VARIANTS.SINGLE_SAR,
    hostName: 'Zeerak',
    hostSeat: 'south',
    seed: 101
  });

  assert.equal(room.roomCode, 'LAHORE');
  assert.equal(hostSeat, 'south');
  assert.equal(room.seats.south.type, 'human');
  assert.equal(room.seats.north.type, 'bot');

  // Join North seat as partner
  const joinRes = mgr.joinRoom({
    roomCode: 'LAHORE',
    playerName: 'Ali',
    preferredSeat: 'north'
  });
  assert.equal(joinRes.seat, 'north');
  assert.equal(room.seats.north.type, 'human');

  // Reconnect South using hostToken
  room.seats.south.connected = false;
  const reconRes = mgr.joinRoom({
    roomCode: 'LAHORE',
    playerName: 'Zeerak',
    reconnectToken: hostToken
  });
  assert.equal(reconRes.reconnected, true);
  assert.equal(reconRes.seat, 'south');
  assert.equal(room.seats.south.connected, true);
});

test('2. Per-Seat Fog-of-War Redaction hides opponent hands and unrevealed deck', () => {
  const mgr = new RungRoomManager();
  mgr.createRoom({
    roomCode: 'FOG101',
    variant: VARIANTS.SINGLE_SAR,
    hostName: 'Zeerak',
    hostSeat: 'south',
    seed: 202
  });

  const payloads = mgr.getRedactedPayloads('FOG101');
  for (const seat of SEATS) {
    const view = payloads[seat];
    assert.equal(view.viewerSeat, seat);
    assert.equal(view.myHand.length, 5, 'Viewer should see their own 5 cards');
    assert.equal(view.remainingDeckCount, 32, 'Remaining deck count is visible');
    assert.equal(view.remainingDeck, undefined, 'Actual remainingDeck array must be stripped');
    assert.equal(view.hands, undefined, 'Raw all-player hands map must be stripped');
    assert.deepEqual(view.handCounts, { south: 5, west: 5, north: 5, east: 5 });
  }

  // Ensure South's cards are completely different from West's cards
  const southIds = new Set(payloads.south.myHand.map(c => c.id));
  for (const c of payloads.west.myHand) {
    assert.equal(southIds.has(c.id), false, 'No card overlap between seats');
  }
});

test('3. Hidden Rung (Chup Rung) Fog-of-War hides trumpSuit from non-Hukamwala until revealed', () => {
  const mgr = new RungRoomManager();
  const { room } = mgr.createRoom({
    roomCode: 'CHUP99',
    variant: VARIANTS.HIDDEN_RUNG,
    hostName: 'Zeerak',
    hostSeat: 'south',
    seed: 303
  });

  // South is trumpSelector (since default dealer is east)
  const hiddenCard = room.state.hands.south[0];
  mgr.handleAction('CHUP99', 'south', {
    type: 'SELECT_TRUMP',
    suit: hiddenCard.suit,
    hiddenCardId: hiddenCard.id
  });

  const payloadsBefore = mgr.getRedactedPayloads('CHUP99');
  // South (Hukamwala) knows the secret trump suit and card
  assert.equal(payloadsBefore.south.trumpSuit, hiddenCard.suit);
  assert.equal(payloadsBefore.south.hiddenRungCard.card.id, hiddenCard.id);

  // West, North, East MUST NOT see the secret trumpSuit or hiddenRungCard.card before reveal!
  for (const otherSeat of ['west', 'north', 'east']) {
    assert.equal(payloadsBefore[otherSeat].trumpSuit, null, `${otherSeat} must not see unrevealed trumpSuit`);
    assert.equal(payloadsBefore[otherSeat].hiddenRungCard.card, null, `${otherSeat} must not see face-down card`);
  }
});

test('4. Hybrid Human + Bot AI Turn Stepping completes full hand in Room Manager', () => {
  const mgr = new RungRoomManager();
  mgr.createRoom({
    roomCode: 'BOTSIM',
    variant: VARIANTS.DOUBLE_SAR,
    hostSeat: 'none', // All 4 seats are bots
    seed: 404
  });

  let steps = 0;
  while (mgr.getRoom('BOTSIM').state.phase !== 'HAND_OVER' && steps < 100) {
    const res = mgr.stepBotIfNeeded('BOTSIM');
    assert.ok(res, 'Bot step should execute');
    steps++;
  }

  const finalState = mgr.getRoom('BOTSIM').state;
  assert.equal(finalState.phase, 'HAND_OVER');
  assert.equal(finalState.trickHistory.length, 13);
  assert.equal(finalState.tricksCollected.teamA + finalState.tricksCollected.teamB, 13);
});

console.log(`\nALL ${passed} MULTIPLAYER & FOG-OF-WAR SPECIFICATIONS PASSED!\n`);
