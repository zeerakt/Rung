import assert from 'node:assert/strict';
import {
  SUITS,
  SEATS,
  TEAMS,
  VARIANTS,
  createDeck,
  shuffleDeck,
  createGameState,
  selectTrump,
  getLegalCards,
  canRevealHiddenRung,
  revealHiddenRung,
  playCard,
  evaluateTrickWinner
} from '../src/engine/rungEngine.js';
import {
  buildBotMemory,
  chooseBotTrump,
  chooseBotMove
} from '../src/ai/rungBot.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ [SPEC ${passed + 1}] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('\n=== RUNG ENGINE & BOT AI UNIT TEST SUITE (12 SPECS) ===');

test('Deck creation produces 52 unique cards across 4 suits (2..A)', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  const uniqueIds = new Set(deck.map(c => c.id));
  assert.equal(uniqueIds.size, 52);
  for (const suit of SUITS) {
    assert.equal(deck.filter(c => c.suit === suit).length, 13);
  }
});

test('Deterministic seeded shuffle produces reproducible card order', () => {
  const d1 = shuffleDeck(createDeck(), 42);
  const d2 = shuffleDeck(createDeck(), 42);
  const d3 = shuffleDeck(createDeck(), 99);
  assert.deepEqual(d1.map(c => c.id), d2.map(c => c.id));
  assert.notDeepEqual(d1.map(c => c.id), d3.map(c => c.id));
});

test('5-4-4 Dealing Pattern deals 5 cards initially, then 8 more after Rung selection', () => {
  let state = createGameState({ variant: VARIANTS.SINGLE_SAR, dealer: 'east', seed: 101 });
  assert.equal(state.phase, 'SELECT_TRUMP');
  assert.equal(state.trumpSelector, 'south');
  for (const s of SEATS) {
    assert.equal(state.hands[s].length, 5);
  }
  assert.equal(state.remainingDeck.length, 32);

  state = selectTrump(state, 'spades');
  assert.equal(state.phase, 'TRICK_PLAY');
  assert.equal(state.trumpSuit, 'spades');
  assert.equal(state.trumpRevealed, true);
  for (const s of SEATS) {
    assert.equal(state.hands[s].length, 13);
  }
  assert.equal(state.remainingDeck.length, 0);
});

test('Legal Move Validator enforces following lead suit when holding suit', () => {
  let state = createGameState({ variant: VARIANTS.SINGLE_SAR, dealer: 'east', seed: 202 });
  state = selectTrump(state, 'hearts');
  const leadCard = state.hands.south[0];
  state = playCard(state, 'south', leadCard.id);

  const westHand = state.hands.west;
  const westSameSuit = westHand.filter(c => c.suit === leadCard.suit);
  const westLegal = getLegalCards(state, 'west');

  if (westSameSuit.length > 0) {
    assert.equal(westLegal.length, westSameSuit.length);
    assert.ok(westLegal.every(c => c.suit === leadCard.suit));
  } else {
    assert.equal(westLegal.length, westHand.length);
  }
});

test('Trick Winner Resolution respects active trump over lead suit and inactive Hidden Rung', () => {
  const plays = [
    { seat: 'south', card: { id: 'A_hearts', suit: 'hearts', rank: 'A', value: 14 } },
    { seat: 'west',  card: { id: 'K_spades', suit: 'spades', rank: 'K', value: 13 } },
    { seat: 'north', card: { id: '2_clubs',  suit: 'clubs',  rank: '2', value: 2 } },
    { seat: 'east',  card: { id: 'Q_hearts', suit: 'hearts', rank: 'Q', value: 12 } }
  ];
  const winTrumpActive = evaluateTrickWinner(plays, 'hearts', 'clubs', true);
  assert.equal(winTrumpActive.seat, 'north');

  const winTrumpHidden = evaluateTrickWinner(plays, 'hearts', 'clubs', false);
  assert.equal(winTrumpHidden.seat, 'south');
});

test('Double Sar Variant holds single tricks in center pile until consecutive team win', () => {
  let state = createGameState({ variant: VARIANTS.DOUBLE_SAR, dealer: 'east', seed: 303 });
  state = selectTrump(state, 'spades');

  for (let i = 0; i < 4; i++) {
    const seat = state.currentTurn;
    const legal = getLegalCards(state, seat);
    state = playCard(state, seat, legal[0].id);
  }
  assert.equal(state.centerPile, 1);
  assert.equal(state.tricksCollected.teamA + state.tricksCollected.teamB, 0);
  assert.ok(state.lastTrickWinnerTeam === 'teamA' || state.lastTrickWinnerTeam === 'teamB');
});

test('Double Sar Variant sweeps entire accumulated center pile upon consecutive team win', () => {
  let state = createGameState({ variant: VARIANTS.DOUBLE_SAR, dealer: 'east', seed: 303 });
  state = selectTrump(state, 'spades');

  // Force Team A (south) to win Trick 1 and Trick 2 consecutively
  state.hands.south[0] = { id: 'A_spades', suit: 'spades', rank: 'A', value: 14 };
  state.hands.south[1] = { id: 'K_spades', suit: 'spades', rank: 'K', value: 13 };
  state.hands.west[0]  = { id: '2_spades', suit: 'spades', rank: '2', value: 2 };
  state.hands.west[1]  = { id: '3_spades', suit: 'spades', rank: '3', value: 3 };
  state.hands.north[0] = { id: '4_spades', suit: 'spades', rank: '4', value: 4 };
  state.hands.north[1] = { id: '5_spades', suit: 'spades', rank: '5', value: 5 };
  state.hands.east[0]  = { id: '6_spades', suit: 'spades', rank: '6', value: 6 };
  state.hands.east[1]  = { id: '7_spades', suit: 'spades', rank: '7', value: 7 };

  // Trick 1 won by south (teamA) -> centerPile = 1
  state = playCard(state, 'south', 'A_spades');
  state = playCard(state, 'west',  '2_spades');
  state = playCard(state, 'north', '4_spades');
  state = playCard(state, 'east',  '6_spades');
  assert.equal(state.centerPile, 1);
  assert.equal(state.tricksCollected.teamA, 0);

  // Trick 2 won by south (teamA) -> sweeps 2 tricks!
  state = playCard(state, 'south', 'K_spades');
  state = playCard(state, 'west',  '3_spades');
  state = playCard(state, 'north', '5_spades');
  state = playCard(state, 'east',  '7_spades');
  assert.equal(state.centerPile, 0);
  assert.equal(state.tricksCollected.teamA, 2);
  assert.equal(state.lastTrickWinnerTeam, null);
});

test('Hidden Rung (Chup Rung) keeps Rung secret and tucks 1 card face-down until void reveal', () => {
  let state = createGameState({ variant: VARIANTS.HIDDEN_RUNG, dealer: 'east', seed: 404 });
  const hiddenCandidate = state.hands.south[0];
  state = selectTrump(state, hiddenCandidate.suit, hiddenCandidate.id);

  assert.equal(state.trumpRevealed, false);
  assert.equal(state.hands.south.length, 12);
  assert.equal(state.hands.west.length, 13);
  assert.equal(state.hiddenRungCard.card.id, hiddenCandidate.id);
});

test('Hidden Rung Reveal returns tucked card to selector and enforces trump play when holding trump', () => {
  let state = createGameState({ variant: VARIANTS.HIDDEN_RUNG, dealer: 'east', seed: 505 });
  const hiddenCard = { id: '2_spades', suit: 'spades', rank: '2', value: 2 };
  state.hands.south[0] = hiddenCard;
  state = selectTrump(state, 'spades', '2_spades');

  // Lead hearts from south; make west void in hearts and holding a spade trump
  state.hands.south[0] = { id: 'A_hearts', suit: 'hearts', rank: 'A', value: 14 };
  state.hands.west = state.hands.west.filter(c => c.suit !== 'hearts');
  if (!state.hands.west.some(c => c.suit === 'spades')) {
    state.hands.west[0] = { id: '10_spades', suit: 'spades', rank: '10', value: 10 };
  }

  state = playCard(state, 'south', 'A_hearts');
  assert.equal(canRevealHiddenRung(state, 'west'), true);

  const southHandBefore = state.hands.south.length;
  state = revealHiddenRung(state, 'west');
  assert.equal(state.trumpRevealed, true);
  assert.equal(state.hiddenRungCard.returnedToHand, true);
  assert.equal(state.hands.south.length, southHandBefore + 1);

  const westLegalAfterReveal = getLegalCards(state, 'west');
  assert.ok(westLegalAfterReveal.every(c => c.suit === 'spades'));
});

test('Kot (13-0 Grand Sweep) awards +2 Match Points and increments kotCount', () => {
  let state = createGameState({ variant: VARIANTS.SINGLE_SAR, dealer: 'east', seed: 606 });
  state = selectTrump(state, 'spades');

  // Give Team A all 13 spades and Team B non-spades so Team A sweeps 13-0
  const allSpades = SUITS[0];
  for (let i = 0; i < 13; i++) {
    const r = ['A','K','Q','J','10','9','8','7','6','5','4','3','2'][i];
    const v = 14 - i;
    state.hands.south[i] = { id: `${r}_spades`, suit: 'spades', rank: r, value: v };
    state.hands.west[i]  = { id: `${r}_hearts`, suit: 'hearts', rank: r, value: v };
    state.hands.north[i] = { id: `${r}_clubs`,  suit: 'clubs',  rank: r, value: v };
    state.hands.east[i]  = { id: `${r}_diamonds`, suit: 'diamonds', rank: r, value: v };
  }

  while (state.phase === 'TRICK_PLAY') {
    const s = state.currentTurn;
    const legal = getLegalCards(state, s);
    state = playCard(state, s, legal[0].id);
  }

  assert.equal(state.phase, 'HAND_OVER');
  assert.equal(state.handWinner, 'teamA');
  assert.equal(state.winType, 'KOT');
  assert.equal(state.matchScore.teamA, 2);
  assert.equal(state.matchScore.kotCount.teamA, 1);
});

test('BotMemory accurately tracks played cards and infers suit voids when a player sloughs', () => {
  let state = createGameState({ variant: VARIANTS.SINGLE_SAR, dealer: 'east', seed: 707 });
  state = selectTrump(state, 'spades');

  state.hands.south[0] = { id: 'A_hearts', suit: 'hearts', rank: 'A', value: 14 };
  state.hands.west = state.hands.west.filter(c => c.suit !== 'hearts');
  state.hands.west[0] = { id: '3_clubs', suit: 'clubs', rank: '3', value: 3 };

  state = playCard(state, 'south', 'A_hearts');
  state = playCard(state, 'west', '3_clubs');

  const mem = buildBotMemory(state, 'north');
  assert.equal(mem.playedIds.has('A_hearts'), true);
  assert.equal(mem.playedIds.has('3_clubs'), true);
  assert.equal(mem.voidMatrix.west.hearts, true);
  assert.equal(mem.highestUnplayedBySuit.hearts, 13); // Ace of hearts is played, King (13) is now boss
});

test('Master Bot AI economizes in 4th seat and sloughs low when partner holds boss lead', () => {
  let state = createGameState({ variant: VARIANTS.SINGLE_SAR, dealer: 'east', seed: 808 });
  state = selectTrump(state, 'spades');

  // Partner (north) leads Ace of diamonds, east follows low, south (4th seat) has K and 2 of diamonds
  state.currentTurn = 'north';
  state.currentTrick.leadSeat = 'north';
  state.hands.north[0] = { id: 'A_diamonds', suit: 'diamonds', rank: 'A', value: 14 };
  state.hands.east[0]  = { id: '4_diamonds', suit: 'diamonds', rank: '4', value: 4 };
  state.hands.south = [
    { id: 'K_diamonds', suit: 'diamonds', rank: 'K', value: 13 },
    { id: '2_diamonds', suit: 'diamonds', rank: '2', value: 2 }
  ];

  state = playCard(state, 'north', 'A_diamonds');
  state = playCard(state, 'east',  '4_diamonds');

  const decision = chooseBotMove(state, 'south', 'master');
  assert.equal(decision.action, 'PLAY_CARD');
  assert.equal(decision.cardId, '2_diamonds'); // Saves King because partner's Ace is already winning
});

console.log(`All ${passed}/12 unit test specifications passed!\n`);
