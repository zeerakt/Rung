/**
 * Rung (Court Piece) Imperfect-Information Bot AI & Card-Tracking Memory Engine
 * Operates strictly on public table history + the bot's own hand (zero cheating/peeking).
 */

import {
  SUITS,
  SUIT_META,
  SEATS,
  TEAMS,
  VARIANTS,
  getPartnerSeat,
  getLegalCards,
  canRevealHiddenRung,
  evaluateTrickWinner
} from '../engine/rungEngine.js';

/**
 * Build public card-counting & void-inference memory from completed tricks and current trick
 */
export function buildBotMemory(state, perspectiveSeat = state.currentTurn) {
  const playedIds = new Set();
  const suitCountsPlayed = { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };
  const voidMatrix = {
    south: { spades: false, hearts: false, diamonds: false, clubs: false },
    west:  { spades: false, hearts: false, diamonds: false, clubs: false },
    north: { spades: false, hearts: false, diamonds: false, clubs: false },
    east:  { spades: false, hearts: false, diamonds: false, clubs: false }
  };

  const inspectTrick = (leadSuit, plays) => {
    for (const p of plays) {
      playedIds.add(p.card.id);
      suitCountsPlayed[p.card.suit] += 1;
      if (leadSuit && p.card.suit !== leadSuit) {
        voidMatrix[p.seat][leadSuit] = true;
      }
    }
  };

  for (const t of state.trickHistory) {
    inspectTrick(t.leadSuit, t.plays);
  }
  if (state.currentTrick && state.currentTrick.plays.length > 0) {
    inspectTrick(state.currentTrick.leadSuit, state.currentTrick.plays);
  }

  // Also include perspectiveSeat's own hand when determining highest remaining unseen cards
  const ownHand = state.hands[perspectiveSeat] || [];
  const ownIds = new Set(ownHand.map(c => c.id));

  const highestUnplayedBySuit = {};
  for (const suit of SUITS) {
    let highest = 0;
    for (let v = 14; v >= 2; v--) {
      const rankStr = v === 14 ? 'A' : v === 13 ? 'K' : v === 12 ? 'Q' : v === 11 ? 'J' : String(v);
      const id = `${rankStr}_${suit}`;
      if (!playedIds.has(id)) {
        highest = v;
        break;
      }
    }
    highestUnplayedBySuit[suit] = highest;
  }

  return {
    playedIds,
    suitCountsPlayed,
    voidMatrix,
    highestUnplayedBySuit,
    ownIds
  };
}

/**
 * Choose Trump (Rung) from initial 5 cards
 * Returns { suit, hiddenCardId, reasoning }
 */
export function chooseBotTrump(state, seat = state.trumpSelector, difficulty = 'master') {
  const hand = state.hands[seat];
  const scores = {};

  for (const suit of SUITS) {
    const cards = hand.filter(c => c.suit === suit);
    const count = cards.length;
    const honorSum = cards.reduce((acc, c) => acc + c.value, 0);
    const highHonors = cards.filter(c => c.value >= 11).length;
    // Suit length is critical in Rung, weighted alongside high honors
    scores[suit] = count * 18 + honorSum * 1.35 + highHonors * 6;
  }

  let bestSuit = SUITS[0];
  for (const s of SUITS) {
    if (scores[s] > scores[bestSuit]) {
      bestSuit = s;
    }
  }

  if (difficulty === 'casual' && Math.random() < 0.25) {
    // Casual bot occasionally picks simply by highest single card
    const topCard = [...hand].sort((a, b) => b.value - a.value)[0];
    bestSuit = topCard.suit;
  }

  let hiddenCardId = null;
  const suitCards = hand.filter(c => c.suit === bestSuit).sort((a, b) => a.value - b.value);
  if (state.variant === VARIANTS.HIDDEN_RUNG) {
    // Tuck the lowest card of the chosen trump suit face-down so high honors stay active in hand
    const chosen = suitCards[0] || [...hand].sort((a, b) => a.value - b.value)[0];
    hiddenCardId = chosen.id;
    bestSuit = chosen.suit;
  }

  const reasoning =
    state.variant === VARIANTS.HIDDEN_RUNG
      ? `Selected ${SUIT_META[bestSuit].name} (${suitCards.length} cards in initial 5) and tucked ${hiddenCardId.replace('_', ' of ')} face-down.`
      : `Called ${SUIT_META[bestSuit].name} based on ${suitCards.length}-card length and honor strength (${Math.round(scores[bestSuit])} pts).`;

  return { suit: bestSuit, hiddenCardId, reasoning };
}

/**
 * Choose tactical play during TRICK_PLAY
 * Returns { action: 'REVEAL_HIDDEN_RUNG' | 'PLAY_CARD', cardId?, reasoning }
 */
export function chooseBotMove(state, seat = state.currentTurn, difficulty = 'master') {
  const legal = getLegalCards(state, seat);
  if (legal.length === 0) {
    throw new Error(`No legal cards available for ${seat}`);
  }

  const partner = getPartnerSeat(seat);
  const myTeam = TEAMS[seat];
  const memory = buildBotMemory(state, seat);
  const plays = state.currentTrick.plays;
  const leadSuit = state.currentTrick.leadSuit;
  const trumpSuit = state.trumpRevealed ? state.trumpSuit : null;

  // Check if bot is void in leadSuit and can reveal Hidden Rung
  if (canRevealHiddenRung(state, seat)) {
    const currentWinPlay = evaluateTrickWinner(plays, leadSuit, state.trumpSuit, false);
    const partnerWinning = currentWinPlay && currentWinPlay.seat === partner;
    const partnerCardStrong = partnerWinning && currentWinPlay.card.value >= 13;

    // In Master/Tactical mode, don't reveal Hidden Rung if partner is already commanding the trick
    if (!partnerCardStrong) {
      return {
        action: 'REVEAL_HIDDEN_RUNG',
        reasoning: `Void in ${SUIT_META[leadSuit].name} while opponents contest the trick — revealing Hidden Rung to seize trump control.`
      };
    }
  }

  if (legal.length === 1) {
    return {
      action: 'PLAY_CARD',
      cardId: legal[0].id,
      reasoning: `Only legal play available (${legal[0].rank}${SUIT_META[legal[0].suit].symbol}).`
    };
  }

  // Casual mode: simple semi-random heuristic
  if (difficulty === 'casual' && Math.random() < 0.35) {
    const pick = legal[Math.floor(Math.random() * legal.length)];
    return {
      action: 'PLAY_CARD',
      cardId: pick.id,
      reasoning: `Casual play: selected ${pick.rank}${SUIT_META[pick.suit].symbol}.`
    };
  }

  // CASE 1: Leading the trick (plays.length === 0)
  if (plays.length === 0) {
    // 1a. Check if we hold the boss (highest remaining) card in any non-trump suit where opponents aren't known void
    const nonTrumpBosses = legal.filter(c => {
      if (trumpSuit && c.suit === trumpSuit) return false;
      const isBoss = c.value >= memory.highestUnplayedBySuit[c.suit];
      const oppsVoid = SEATS.some(s => TEAMS[s] !== myTeam && memory.voidMatrix[s][c.suit]);
      return isBoss && !oppsVoid;
    });

    if (nonTrumpBosses.length > 0) {
      const chosen = nonTrumpBosses.sort((a, b) => b.value - a.value)[0];
      return {
        action: 'PLAY_CARD',
        cardId: chosen.id,
        reasoning: `Leading boss winner ${chosen.rank}${SUIT_META[chosen.suit].symbol} (no opponent known void in ${SUIT_META[chosen.suit].name}).`
      };
    }

    // 1b. In Double Sar, if we won the last trick (lastTrickWinnerTeam === myTeam) and have high trump, push to collect the pile!
    if (
      state.variant === VARIANTS.DOUBLE_SAR &&
      state.lastTrickWinnerTeam === myTeam &&
      trumpSuit
    ) {
      const trumps = legal.filter(c => c.suit === trumpSuit).sort((a, b) => b.value - a.value);
      if (trumps.length > 0 && trumps[0].value >= memory.highestUnplayedBySuit[trumpSuit]) {
        return {
          action: 'PLAY_CARD',
          cardId: trumps[0].id,
          reasoning: `Double Sar pile conversion: leading boss trump ${trumps[0].rank}${SUIT_META[trumpSuit].symbol} to secure ${state.centerPile + 1} tricks.`
        };
      }
    }

    // 1c. If we have 4+ trumps and trump is revealed, lead trump to draw out opponents' Rung
    if (trumpSuit) {
      const myTrumps = legal.filter(c => c.suit === trumpSuit).sort((a, b) => b.value - a.value);
      if (myTrumps.length >= 4) {
        const chosen = myTrumps[0];
        return {
          action: 'PLAY_CARD',
          cardId: chosen.id,
          reasoning: `Drawing opponents' trumps with ${chosen.rank}${SUIT_META[chosen.suit].symbol} (${myTrumps.length} trumps in hand).`
        };
      }
    }

    // 1d. Lead a suit where an opponent is NOT void, or lead a low exploratory card from longest non-trump suit
    const nonTrumps = legal.filter(c => c.suit !== trumpSuit);
    const pool = nonTrumps.length > 0 ? nonTrumps : legal;
    const sortedLow = [...pool].sort((a, b) => a.value - b.value);
    const chosen = sortedLow[0];
    return {
      action: 'PLAY_CARD',
      cardId: chosen.id,
      reasoning: `Leading low ${chosen.rank}${SUIT_META[chosen.suit].symbol} to probe suit distribution and preserve high honors.`
    };
  }

  // CASE 2: Following in an active trick (plays.length >= 1)
  const currentWinner = evaluateTrickWinner(plays, leadSuit, state.trumpSuit, state.trumpRevealed);
  const partnerIsWinning = currentWinner.seat === partner;

  // Determine which legal cards would beat the current winning play right now
  const winningCandidates = legal.filter(card => {
    const simulatedPlays = [...plays, { seat, card }];
    const simWinner = evaluateTrickWinner(simulatedPlays, leadSuit, state.trumpSuit, state.trumpRevealed);
    return simWinner.seat === seat;
  });

  // Helper: lowest discard value (prefer discarding non-trump singletons/low cards)
  const sortCheapestDiscard = cards =>
    [...cards].sort((a, b) => {
      const aTrump = trumpSuit && a.suit === trumpSuit ? 1 : 0;
      const bTrump = trumpSuit && b.suit === trumpSuit ? 1 : 0;
      if (aTrump !== bTrump) return aTrump - bTrump;
      return a.value - b.value;
    });

  // 2a. Partner is already winning the trick
  if (partnerIsWinning) {
    const isFourthSeat = plays.length === 3;
    const partnerHasBoss =
      currentWinner.card.value >= memory.highestUnplayedBySuit[currentWinner.card.suit] ||
      (trumpSuit && currentWinner.card.suit === trumpSuit && currentWinner.card.value >= 12);

    if (isFourthSeat || partnerHasBoss) {
      const slough = sortCheapestDiscard(legal)[0];
      return {
        action: 'PLAY_CARD',
        cardId: slough.id,
        reasoning: `Partner (${partner.toUpperCase()}) holds trick lead with ${currentWinner.card.rank}${SUIT_META[currentWinner.card.suit].symbol} — sloughing low ${slough.rank}${SUIT_META[slough.suit].symbol}.`
      };
    }
  }

  // 2b. Opponent is winning (or partner's card is weak in 2nd/3rd seat) and we have winning candidates
  if (winningCandidates.length > 0) {
    // In 4th seat, win as cheaply as possible!
    if (plays.length === 3) {
      const cheapestWin = sortCheapestDiscard(winningCandidates)[0];
      return {
        action: 'PLAY_CARD',
        cardId: cheapestWin.id,
        reasoning: `4th-seat finesse: winning trick economically with ${cheapestWin.rank}${SUIT_META[cheapestWin.suit].symbol}.`
      };
    }

    // In 2nd or 3rd seat: play strongest non-trump winner, or cheapest trump cut if void in lead suit
    const sameSuitWinners = winningCandidates.filter(c => c.suit === leadSuit).sort((a, b) => b.value - a.value);
    if (sameSuitWinners.length > 0) {
      const chosen = sameSuitWinners[0];
      return {
        action: 'PLAY_CARD',
        cardId: chosen.id,
        reasoning: `Contesting trick in ${SUIT_META[leadSuit].name} with high ${chosen.rank}${SUIT_META[chosen.suit].symbol}.`
      };
    }

    // Trumping in when void in leadSuit
    const trumpWinners = winningCandidates.sort((a, b) => a.value - b.value);
    const chosenTrump = trumpWinners[0];
    return {
      action: 'PLAY_CARD',
      cardId: chosenTrump.id,
      reasoning: `Void in ${SUIT_META[leadSuit].name} — cutting in with Rung ${chosenTrump.rank}${SUIT_META[chosenTrump.suit].symbol}.`
    };
  }

  // 2c. Cannot beat current winning card — discard lowest value card (protecting trumps)
  const discard = sortCheapestDiscard(legal)[0];
  return {
    action: 'PLAY_CARD',
    cardId: discard.id,
    reasoning: `Cannot overtake ${currentWinner.card.rank}${SUIT_META[currentWinner.card.suit].symbol} — discarding lowest card ${discard.rank}${SUIT_META[discard.suit].symbol}.`
  };
}
