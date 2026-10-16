/**
 * Rung (Court Piece) Core Game Engine
 * Supports all 3 classic variants:
 *  - SINGLE_SAR: Standard trick-taking, immediate trick collection, first team to 7 tricks wins hand.
 *  - DOUBLE_SAR: Tricks stay in an uncollected center pile until a player wins a trick when their
 *                team already won the immediately preceding trick (or wins 2 consecutive tricks).
 *  - HIDDEN_RUNG (Chup Rung): Trump selector places 1 card from their initial 5 cards face-down as
 *                the hidden Rung. Trump remains secret and inactive until any player is void in the
 *                led suit and chooses to ask for the Hidden Rung to be revealed.
 */

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
export const SUIT_META = {
  spades:   { symbol: '♠', name: 'Spades (Hukam)', color: 'black', urdu: 'حکم' },
  hearts:   { symbol: '♥', name: 'Hearts (Paan)', color: 'red', urdu: 'پان' },
  diamonds: { symbol: '♦', name: 'Diamonds (Eent)', color: 'red', urdu: 'اینٹ' },
  clubs:    { symbol: '♣', name: 'Clubs (Chiri)', color: 'black', urdu: 'چڑی' }
};

export const RANKS = [
  { rank: '2', value: 2 },
  { rank: '3', value: 3 },
  { rank: '4', value: 4 },
  { rank: '5', value: 5 },
  { rank: '6', value: 6 },
  { rank: '7', value: 7 },
  { rank: '8', value: 8 },
  { rank: '9', value: 9 },
  { rank: '10', value: 10 },
  { rank: 'J', value: 11 },
  { rank: 'Q', value: 12 },
  { rank: 'K', value: 13 },
  { rank: 'A', value: 14 }
];

export const SEATS = ['south', 'west', 'north', 'east']; // Counter-clockwise or clockwise standard 4-seat ring
export const TEAMS = {
  south: 'teamA',
  north: 'teamA',
  west: 'teamB',
  east: 'teamB'
};

export const VARIANTS = {
  SINGLE_SAR: 'SINGLE_SAR',
  DOUBLE_SAR: 'DOUBLE_SAR',
  HIDDEN_RUNG: 'HIDDEN_RUNG'
};

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const r of RANKS) {
      deck.push({
        id: `${r.rank}_${suit}`,
        suit,
        rank: r.rank,
        value: r.value
      });
    }
  }
  return deck;
}

export function shuffleDeck(deck, seed = null) {
  const copy = [...deck];
  let rng = Math.random;
  if (seed !== null) {
    let s = seed >>> 0;
    rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function sortHand(cards, trumpSuit = null) {
  const suitOrder = { spades: 0, hearts: 1, clubs: 2, diamonds: 3 };
  return [...cards].sort((a, b) => {
    if (trumpSuit) {
      if (a.suit === trumpSuit && b.suit !== trumpSuit) return -1;
      if (b.suit === trumpSuit && a.suit !== trumpSuit) return 1;
    }
    if (suitOrder[a.suit] !== suitOrder[b.suit]) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return b.value - a.value;
  });
}

export function getNextSeat(seat) {
  const idx = SEATS.indexOf(seat);
  return SEATS[(idx + 1) % 4];
}

export function getPartnerSeat(seat) {
  const idx = SEATS.indexOf(seat);
  return SEATS[(idx + 2) % 4];
}

/**
 * Initialize a new Match or Hand state
 */
export function createGameState({
  variant = VARIANTS.SINGLE_SAR,
  dealer = 'east',
  seed = null,
  matchScore = { teamA: 0, teamB: 0, handsPlayed: 0, kotCount: { teamA: 0, teamB: 0 } }
} = {}) {
  const fullDeck = shuffleDeck(createDeck(), seed);
  const trumpSelector = getNextSeat(dealer); // Eldest hand ("Hukamwala")

  // Deal initial 5 cards to each player in 5-4-4 pattern
  const hands = {
    south: sortHand(fullDeck.slice(0, 5)),
    west:  sortHand(fullDeck.slice(5, 10)),
    north: sortHand(fullDeck.slice(10, 15)),
    east:  sortHand(fullDeck.slice(15, 20))
  };

  const remainingDeck = fullDeck.slice(20); // 32 cards remaining (16 for batch 2, 16 for batch 3)

  return {
    variant,
    phase: 'SELECT_TRUMP', // SELECT_TRUMP | TRICK_PLAY | HAND_OVER
    dealer,
    trumpSelector,
    currentTurn: trumpSelector,
    trumpSuit: null,
    trumpRevealed: variant !== VARIANTS.HIDDEN_RUNG,
    hiddenRungCard: null, // In HIDDEN_RUNG, stores { card, owner: trumpSelector, pickedUp: false }
    hands,
    remainingDeck,
    currentTrick: {
      number: 1,
      leadSeat: trumpSelector,
      leadSuit: null,
      plays: [], // Array of { seat, card, revealedHiddenRung }
      revealedOnThisTrick: false
    },
    tricksCollected: { teamA: 0, teamB: 0 },
    tricksWonRaw: { teamA: 0, teamB: 0 },
    centerPile: 0, // Uncollected tricks in DOUBLE_SAR
    lastTrickWinnerTeam: null, // Tracks consecutive trick team in DOUBLE_SAR
    lastTrickWinnerSeat: null,
    trickHistory: [],
    handWinner: null,
    winType: null, // 'STANDARD' | 'KOT' | 'BAZI'
    matchScore: JSON.parse(JSON.stringify(matchScore)),
    logs: [
      `Dealt initial 5 cards. Waiting for ${trumpSelector.toUpperCase()} (Hukamwala) to call Rung.`
    ]
  };
}

/**
 * Step 2: Select Trump (Rung) after initial 5 cards
 * In HIDDEN_RUNG, the selector also passes `cardId` from their 5-card hand to set face-down.
 */
export function selectTrump(state, suit, hiddenCardId = null) {
  if (state.phase !== 'SELECT_TRUMP') {
    throw new Error('Cannot select trump outside SELECT_TRUMP phase');
  }
  if (!SUITS.includes(suit)) {
    throw new Error(`Invalid suit: ${suit}`);
  }

  const next = JSON.parse(JSON.stringify(state));
  const selector = next.trumpSelector;

  if (next.variant === VARIANTS.HIDDEN_RUNG) {
    let chosenCard = null;
    if (hiddenCardId) {
      chosenCard = next.hands[selector].find(c => c.id === hiddenCardId);
    }
    if (!chosenCard) {
      // Fallback: pick lowest card of that suit in selector's hand
      const suitCards = next.hands[selector].filter(c => c.suit === suit).sort((a, b) => a.value - b.value);
      chosenCard = suitCards[0] || next.hands[selector][0];
    }
    next.trumpSuit = chosenCard.suit;
    next.trumpRevealed = false;
    next.hiddenRungCard = {
      card: chosenCard,
      owner: selector,
      returnedToHand: false
    };
    // Remove the face-down card from active hand until revealed
    next.hands[selector] = next.hands[selector].filter(c => c.id !== chosenCard.id);
    next.logs.push(`${selector.toUpperCase()} placed a Hidden Rung (Chup Rung) card face-down.`);
  } else {
    next.trumpSuit = suit;
    next.trumpRevealed = true;
    next.logs.push(`${selector.toUpperCase()} declared ${SUIT_META[suit].name} as Rung!`);
  }

  // Deal remaining 32 cards in two batches of 4 (8 cards per player)
  const batch4A = next.remainingDeck.slice(0, 16);
  const batch4B = next.remainingDeck.slice(16, 32);

  SEATS.forEach((seat, idx) => {
    const extra8 = [
      ...batch4A.slice(idx * 4, (idx + 1) * 4),
      ...batch4B.slice(idx * 4, (idx + 1) * 4)
    ];
    const effectiveSortTrump = next.trumpRevealed ? next.trumpSuit : null;
    next.hands[seat] = sortHand([...next.hands[seat], ...extra8], effectiveSortTrump);
  });

  next.remainingDeck = [];
  next.phase = 'TRICK_PLAY';
  next.currentTurn = selector;
  next.currentTrick.leadSeat = selector;
  return next;
}

/**
 * Determine if the current player can ask to reveal Hidden Rung right now
 */
export function canRevealHiddenRung(state, seat = state.currentTurn) {
  if (state.variant !== VARIANTS.HIDDEN_RUNG) return false;
  if (state.trumpRevealed) return false;
  if (state.phase !== 'TRICK_PLAY') return false;
  if (state.currentTurn !== seat) return false;
  const leadSuit = state.currentTrick.leadSuit;
  if (!leadSuit) return false; // Leader cannot reveal on lead

  const hand = state.hands[seat];
  const hasLeadSuit = hand.some(c => c.suit === leadSuit);
  return !hasLeadSuit;
}

/**
 * Reveal Hidden Rung when current player is void in the led suit
 */
export function revealHiddenRung(state, seat = state.currentTurn) {
  if (!canRevealHiddenRung(state, seat)) {
    throw new Error(`Player ${seat} cannot reveal Hidden Rung right now.`);
  }
  const next = JSON.parse(JSON.stringify(state));
  next.trumpRevealed = true;
  next.currentTrick.revealedOnThisTrick = true;

  // Return the face-down card to the selector's hand so all 52 cards participate across 13 tricks
  if (next.hiddenRungCard && !next.hiddenRungCard.returnedToHand) {
    const owner = next.hiddenRungCard.owner;
    next.hands[owner] = sortHand([...next.hands[owner], next.hiddenRungCard.card], next.trumpSuit);
    next.hiddenRungCard.returnedToHand = true;
  }

  SEATS.forEach(s => {
    next.hands[s] = sortHand(next.hands[s], next.trumpSuit);
  });

  next.logs.push(
    `${seat.toUpperCase()} was void in ${SUIT_META[next.currentTrick.leadSuit].name} and revealed Hidden Rung: ${SUIT_META[next.trumpSuit].name}!`
  );
  return next;
}

/**
 * Get all legal cards a player can play on their turn
 */
export function getLegalCards(state, seat = state.currentTurn) {
  if (state.phase !== 'TRICK_PLAY' || state.currentTurn !== seat) {
    return [];
  }
  const hand = state.hands[seat];
  if (!hand || hand.length === 0) return [];

  const leadSuit = state.currentTrick.leadSuit;
  if (!leadSuit) {
    // Leading the trick: any card in hand is legal
    return [...hand];
  }

  // Must follow lead suit if holding any card of leadSuit
  const sameSuitCards = hand.filter(c => c.suit === leadSuit);
  if (sameSuitCards.length > 0) {
    return sameSuitCards;
  }

  // In HIDDEN_RUNG, if player JUST revealed the Hidden Rung on this turn,
  // traditional rules require them to play a trump card if they hold one.
  if (
    state.variant === VARIANTS.HIDDEN_RUNG &&
    state.currentTrick.revealedOnThisTrick &&
    state.currentTrick.plays.length > 0 &&
    !state.currentTrick.plays.some(p => p.revealedHiddenRung)
  ) {
    const trumpCards = hand.filter(c => c.suit === state.trumpSuit);
    if (trumpCards.length > 0) {
      return trumpCards;
    }
  }

  // Void in lead suit: any card is legal
  return [...hand];
}

/**
 * Evaluate which play currently wins a trick
 */
export function evaluateTrickWinner(plays, leadSuit, trumpSuit, trumpRevealed) {
  if (!plays || plays.length === 0) return null;
  let winningPlay = plays[0];

  for (let i = 1; i < plays.length; i++) {
    const candidate = plays[i];
    const winCard = winningPlay.card;
    const candCard = candidate.card;

    const candIsTrump = trumpRevealed && candCard.suit === trumpSuit;
    const winIsTrump = trumpRevealed && winCard.suit === trumpSuit;

    if (candIsTrump && !winIsTrump) {
      winningPlay = candidate;
    } else if (candIsTrump && winIsTrump) {
      if (candCard.value > winCard.value) {
        winningPlay = candidate;
      }
    } else if (!winIsTrump && candCard.suit === leadSuit) {
      if (winCard.suit !== leadSuit || candCard.value > winCard.value) {
        winningPlay = candidate;
      }
    }
  }
  return winningPlay;
}

/**
 * Play a card from the active seat
 */
export function playCard(state, seat, cardId) {
  if (state.phase !== 'TRICK_PLAY') {
    throw new Error('Cannot play card outside TRICK_PLAY phase');
  }
  if (state.currentTurn !== seat) {
    throw new Error(`It is ${state.currentTurn}'s turn, not ${seat}'s`);
  }

  const legal = getLegalCards(state, seat);
  const chosen = legal.find(c => c.id === cardId);
  if (!chosen) {
    throw new Error(`Illegal card play ${cardId} by ${seat}`);
  }

  const next = JSON.parse(JSON.stringify(state));

  // If this is the 13th trick and Hidden Rung was never revealed, return the face-down card
  // before the owner plays their last turn so nobody runs out of cards on trick 13.
  if (
    next.variant === VARIANTS.HIDDEN_RUNG &&
    !next.trumpRevealed &&
    next.hiddenRungCard &&
    !next.hiddenRungCard.returnedToHand &&
    next.hands[next.hiddenRungCard.owner].length === 1 &&
    seat === next.hiddenRungCard.owner
  ) {
    // Owner has 1 visible card + 1 hidden card; return hidden card if needed
  }

  next.hands[seat] = next.hands[seat].filter(c => c.id !== cardId);

  if (next.currentTrick.plays.length === 0) {
    next.currentTrick.leadSeat = seat;
    next.currentTrick.leadSuit = chosen.suit;
  }

  const justRevealed =
    next.currentTrick.revealedOnThisTrick &&
    !next.currentTrick.plays.some(p => p.revealedHiddenRung);

  next.currentTrick.plays.push({
    seat,
    card: chosen,
    revealedHiddenRung: Boolean(justRevealed)
  });

  // If all 4 players have played, resolve the trick
  if (next.currentTrick.plays.length === 4) {
    return resolveCompletedTrick(next);
  }

  const nextSeat = getNextSeat(seat);
  // Edge case in Hidden Rung: if Hidden Rung was never revealed by Trick 13 and the selector
  // has 0 visible cards left (only their face-down card remains), return it to their hand automatically
  if (
    next.variant === VARIANTS.HIDDEN_RUNG &&
    !next.trumpRevealed &&
    next.hiddenRungCard &&
    !next.hiddenRungCard.returnedToHand &&
    next.hands[nextSeat].length === 0
  ) {
    const owner = next.hiddenRungCard.owner;
    next.hands[owner].push(next.hiddenRungCard.card);
    next.hiddenRungCard.returnedToHand = true;
  }

  next.currentTurn = nextSeat;
  return next;
}

function resolveCompletedTrick(state) {
  const next = JSON.parse(JSON.stringify(state));
  const { plays, leadSuit, number } = next.currentTrick;
  const winnerPlay = evaluateTrickWinner(plays, leadSuit, next.trumpSuit, next.trumpRevealed);
  const winnerSeat = winnerPlay.seat;
  const winnerTeam = TEAMS[winnerSeat];

  next.tricksWonRaw[winnerTeam] += 1;

  let collectedThisTrick = 0;
  if (next.variant === VARIANTS.DOUBLE_SAR) {
    next.centerPile += 1;
    // Double Sar rule: a team collects the accumulated center pile when they win 2 consecutive tricks
    // (or on the 13th trick if tricks remain uncollected, the 13th trick winner takes the remaining pile)
    if (next.lastTrickWinnerTeam === winnerTeam || number === 13) {
      collectedThisTrick = next.centerPile;
      next.tricksCollected[winnerTeam] += next.centerPile;
      next.centerPile = 0;
      next.lastTrickWinnerTeam = null; // Reset streak after collection
      next.logs.push(
        `Trick #${number}: ${winnerSeat.toUpperCase()} won with ${winnerPlay.card.rank}${SUIT_META[winnerPlay.card.suit].symbol} and collected ${collectedThisTrick} Double Sar trick(s)!`
      );
    } else {
      next.lastTrickWinnerTeam = winnerTeam;
      next.logs.push(
        `Trick #${number}: ${winnerSeat.toUpperCase()} won Sar #1 with ${winnerPlay.card.rank}${SUIT_META[winnerPlay.card.suit].symbol} (${next.centerPile} in center pile).`
      );
    }
  } else {
    // SINGLE_SAR and HIDDEN_RUNG collect tricks immediately
    collectedThisTrick = 1;
    next.tricksCollected[winnerTeam] += 1;
    next.lastTrickWinnerTeam = winnerTeam;
    next.logs.push(
      `Trick #${number}: ${winnerSeat.toUpperCase()} won with ${winnerPlay.card.rank}${SUIT_META[winnerPlay.card.suit].symbol}.`
    );
  }

  next.lastTrickWinnerSeat = winnerSeat;
  next.trickHistory.push({
    number,
    leadSeat: next.currentTrick.leadSeat,
    leadSuit,
    plays: [...plays],
    winnerSeat,
    winnerTeam,
    collectedThisTrick
  });

  // Check if Hidden Rung owner needs their face-down card returned before Trick 13 begins
  if (
    next.variant === VARIANTS.HIDDEN_RUNG &&
    !next.trumpRevealed &&
    next.hiddenRungCard &&
    !next.hiddenRungCard.returnedToHand &&
    number === 12
  ) {
    const owner = next.hiddenRungCard.owner;
    next.hands[owner].push(next.hiddenRungCard.card);
    next.hiddenRungCard.returnedToHand = true;
  }

  // Check hand termination conditions (13 tricks completed)
  if (number === 13) {
    next.phase = 'HAND_OVER';
    const aTricks = next.tricksCollected.teamA;
    const bTricks = next.tricksCollected.teamB;
    const winTeam = aTricks > bTricks ? 'teamA' : 'teamB';
    const loseTricks = winTeam === 'teamA' ? bTricks : aTricks;

    next.handWinner = winTeam;
    if (loseTricks === 0) {
      next.winType = 'KOT'; // Complete 13-0 / 7-0 shutout sweep
      next.matchScore[winTeam] += 2;
      next.matchScore.kotCount[winTeam] += 1;
      next.logs.push(`KOT (Grand Sweep)! ${winTeam === 'teamA' ? 'Your Partnership' : 'Opponents'} won all collected tricks (+2 Match Points)!`);
    } else {
      next.winType = 'STANDARD';
      next.matchScore[winTeam] += 1;
      next.logs.push(`Hand Complete! ${winTeam === 'teamA' ? 'Your Partnership' : 'Opponents'} won ${ Math.max(aTricks, bTricks) }–${ Math.min(aTricks, bTricks) } (+1 Match Point).`);
    }
    next.matchScore.handsPlayed += 1;
    return next;
  }

  // Prepare next trick
  next.currentTrick = {
    number: number + 1,
    leadSeat: winnerSeat,
    leadSuit: null,
    plays: [],
    revealedOnThisTrick: false
  };
  next.currentTurn = winnerSeat;
  return next;
}
