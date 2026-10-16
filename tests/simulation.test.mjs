import assert from 'node:assert/strict';
import {
  VARIANTS,
  SEATS,
  createGameState,
  selectTrump,
  revealHiddenRung,
  playCard
} from '../src/engine/rungEngine.js';
import { chooseBotTrump, chooseBotMove } from '../src/ai/rungBot.js';

console.log('=== 300-HAND BOT-VS-BOT MONTE CARLO INVARIANT SIMULATION ===');

const variantsToTest = [VARIANTS.SINGLE_SAR, VARIANTS.DOUBLE_SAR, VARIANTS.HIDDEN_RUNG];
const difficulties = ['casual', 'tactical', 'master'];
let totalHandsSimulated = 0;
let kotWins = 0;
let hiddenReveals = 0;

for (const variant of variantsToTest) {
  for (let h = 1; h <= 100; h++) {
    const seed = h * 1337 + variantsToTest.indexOf(variant) * 10000;
    const diff = difficulties[h % difficulties.length];
    let state = createGameState({ variant, dealer: SEATS[h % 4], seed });

    // 1. Bot selects Rung
    const trumpChoice = chooseBotTrump(state, state.trumpSelector, diff);
    state = selectTrump(state, trumpChoice.suit, trumpChoice.hiddenCardId);

    // 2. Play all 13 tricks
    let safetyCounter = 0;
    while (state.phase === 'TRICK_PLAY') {
      safetyCounter++;
      assert.ok(safetyCounter < 200, `Infinite loop detected on seed ${seed}`);

      const turnSeat = state.currentTurn;
      const decision = chooseBotMove(state, turnSeat, diff);
      if (decision.action === 'REVEAL_HIDDEN_RUNG') {
        state = revealHiddenRung(state, turnSeat);
        hiddenReveals++;
      } else {
        state = playCard(state, turnSeat, decision.cardId);
      }
    }

    // 3. Verify Post-Hand Invariants
    assert.equal(state.phase, 'HAND_OVER');
    assert.equal(state.trickHistory.length, 13, `Expected 13 tricks, got ${state.trickHistory.length}`);
    assert.equal(
      state.tricksCollected.teamA + state.tricksCollected.teamB,
      13,
      `Expected 13 collected tricks in ${variant}, got ${state.tricksCollected.teamA + state.tricksCollected.teamB}`
    );
    for (const s of SEATS) {
      assert.equal(state.hands[s].length, 0, `Player ${s} still had cards left at HAND_OVER`);
    }
    if (state.winType === 'KOT') kotWins++;
    totalHandsSimulated++;
  }
  console.log(`  ✓ Simulated 100 complete hands of ${variant} (0 deadlocks, 100% invariant pass)`);
}

console.log(`Total Hands Verified: ${totalHandsSimulated} | Kot Sweeps Observed: ${kotWins} | Hidden Rung Reveals: ${hiddenReveals}\n`);
