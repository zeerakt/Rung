/**
 * Authoritative Multiplayer Room Manager & Fog-of-War State Redactor
 * Powers real-time 4-player Rung rooms on Oracle Cloud VM while reusing
 * the pure state machine in `src/engine/rungEngine.js` and `src/ai/rungBot.js`.
 */

import {
  SEATS,
  TEAMS,
  VARIANTS,
  createGameState,
  selectTrump,
  canRevealHiddenRung,
  revealHiddenRung,
  getLegalCards,
  playCard,
  getNextSeat
} from '../src/engine/rungEngine.js';
import { chooseBotTrump, chooseBotMove } from '../src/ai/rungBot.js';

/**
 * Redacts a full server gameState into a seat-specific client view (Fog of War).
 * - The player at `viewerSeat` sees their own exact cards (`myHand`) and `legalCardIds`.
 * - Other seats' hands are replaced strictly with integer card counts (`handCounts`).
 * - `remainingDeck` is never sent to clients.
 * - In `HIDDEN_RUNG` (Chup Rung), `trumpSuit` and `hiddenRungCard.card` are redacted (`null`)
 *   for all non-Hukamwala players until `trumpRevealed === true`.
 */
export function sanitizeStateForSeat(state, viewerSeat, roomMeta = {}) {
  const handCounts = {};
  for (const seat of SEATS) {
    handCounts[seat] = state.hands[seat] ? state.hands[seat].length : 0;
  }

  const isHukamwala = viewerSeat === state.trumpSelector;
  const canSeeTrump = state.trumpRevealed || isHukamwala;

  let redactedHiddenCard = null;
  if (state.hiddenRungCard) {
    redactedHiddenCard = {
      owner: state.hiddenRungCard.owner,
      returnedToHand: state.hiddenRungCard.returnedToHand,
      card: canSeeTrump ? state.hiddenRungCard.card : null
    };
  }

  const isMyTurn = state.phase === 'TRICK_PLAY' && state.currentTurn === viewerSeat;

  return {
    roomCode: roomMeta.roomCode || 'LOCAL',
    viewerSeat,
    viewerTeam: TEAMS[viewerSeat] || null,
    variant: state.variant,
    phase: state.phase,
    dealer: state.dealer,
    trumpSelector: state.trumpSelector,
    currentTurn: state.currentTurn,
    trumpSuit: canSeeTrump ? state.trumpSuit : null,
    trumpRevealed: state.trumpRevealed,
    hiddenRungCard: redactedHiddenCard,
    myHand: viewerSeat && state.hands[viewerSeat] ? [...state.hands[viewerSeat]] : [],
    legalCardIds: isMyTurn ? getLegalCards(state, viewerSeat).map(c => c.id) : [],
    canRevealHiddenRung: isMyTurn ? canRevealHiddenRung(state, viewerSeat) : false,
    handCounts,
    remainingDeckCount: state.remainingDeck ? state.remainingDeck.length : 0,
    currentTrick: state.currentTrick,
    tricksCollected: state.tricksCollected,
    tricksWonRaw: state.tricksWonRaw,
    centerPile: state.centerPile,
    lastTrickWinnerTeam: state.lastTrickWinnerTeam,
    lastTrickWinnerSeat: state.lastTrickWinnerSeat,
    trickHistory: state.trickHistory,
    handWinner: state.handWinner,
    winType: state.winType,
    matchScore: state.matchScore,
    seats: roomMeta.seats || null,
    logs: state.logs.slice(-25)
  };
}

/**
 * Authoritative Room Manager supporting room creation, seat assignment,
 * reconnection tokens, human actions, and automatic Bot AI turn execution.
 */
export class RungRoomManager {
  constructor() {
    this.rooms = new Map();
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  createRoom({
    roomCode = this.generateRoomCode(),
    variant = VARIANTS.SINGLE_SAR,
    botDifficulty = 'master',
    seed = null,
    hostName = 'Host (South)',
    hostSeat = 'south'
  } = {}) {
    const normalizedCode = String(roomCode).toUpperCase().trim();
    const seats = {
      south: { seat: 'south', type: 'bot', name: 'South Bot', connected: true, token: null },
      west:  { seat: 'west',  type: 'bot', name: 'Tariq (Bot)', connected: true, token: null },
      north: { seat: 'north', type: 'bot', name: 'Amina (Bot)', connected: true, token: null },
      east:  { seat: 'east',  type: 'bot', name: 'Zafar (Bot)', connected: true, token: null }
    };

    const hostToken = `tok_${normalizedCode}_${hostSeat}_${ Math.random().toString(36).slice(2, 10) }`;
    if (SEATS.includes(hostSeat)) {
      seats[hostSeat] = {
        seat: hostSeat,
        type: 'human',
        name: hostName,
        connected: true,
        token: hostToken
      };
    }

    const state = createGameState({ variant, dealer: 'east', seed });
    const room = {
      roomCode: normalizedCode,
      variant,
      botDifficulty,
      seats,
      state,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.rooms.set(normalizedCode, room);
    return { room, hostSeat, hostToken };
  }

  getRoom(roomCode) {
    if (!roomCode) return null;
    return this.rooms.get(String(roomCode).toUpperCase().trim()) || null;
  }

  joinRoom({ roomCode, playerName = 'Player', preferredSeat = null, reconnectToken = null }) {
    const room = this.getRoom(roomCode);
    if (!room) {
      throw new Error(`Room ${roomCode} not found`);
    }

    // 1. Check Reconnection Token first
    if (reconnectToken) {
      for (const seat of SEATS) {
        if (room.seats[seat].token === reconnectToken) {
          room.seats[seat].connected = true;
          room.seats[seat].type = 'human';
          if (playerName) room.seats[seat].name = playerName;
          room.updatedAt = Date.now();
          return { room, seat, token: reconnectToken, reconnected: true };
        }
      }
    }

    // 2. Assign requested seat if it's currently a Bot or disconnected slot
    let targetSeat = null;
    if (preferredSeat && SEATS.includes(preferredSeat) && room.seats[preferredSeat].type === 'bot') {
      targetSeat = preferredSeat;
    } else {
      targetSeat = SEATS.find(s => room.seats[s].type === 'bot') || null;
    }

    if (!targetSeat) {
      throw new Error(`Room ${room.roomCode} is full (all 4 seats occupied by human players)`);
    }

    const token = `tok_${room.roomCode}_${targetSeat}_${Math.random().toString(36).slice(2, 10)}`;
    room.seats[targetSeat] = {
      seat: targetSeat,
      type: 'human',
      name: playerName || `Player (${targetSeat.toUpperCase()})`,
      connected: true,
      token
    };
    room.updatedAt = Date.now();
    return { room, seat: targetSeat, token, reconnected: false };
  }

  setSeatBot(roomCode, seat, botName = null) {
    const room = this.getRoom(roomCode);
    if (!room || !SEATS.includes(seat)) return null;
    const defaultNames = {
      south: 'South Bot',
      west: 'Tariq (Bot)',
      north: 'Amina (Bot)',
      east: 'Zafar (Bot)'
    };
    room.seats[seat] = {
      seat,
      type: 'bot',
      name: botName || defaultNames[seat],
      connected: true,
      token: null
    };
    room.updatedAt = Date.now();
    return room;
  }

  /**
   * Process an authoritative player action (`SELECT_TRUMP`, `REVEAL_HIDDEN_RUNG`, `PLAY_CARD`, `NEXT_HAND`)
   */
  handleAction(roomCode, seat, action) {
    const room = this.getRoom(roomCode);
    if (!room) throw new Error(`Room ${roomCode} not found`);

    const { type } = action;
    if (type === 'SELECT_TRUMP') {
      if (room.state.trumpSelector !== seat) {
        throw new Error(`Only Hukamwala (${room.state.trumpSelector}) can call Rung`);
      }
      room.state = selectTrump(room.state, action.suit, action.hiddenCardId || null);
    } else if (type === 'REVEAL_HIDDEN_RUNG') {
      room.state = revealHiddenRung(room.state, seat);
    } else if (type === 'PLAY_CARD') {
      room.state = playCard(room.state, seat, action.cardId);
    } else if (type === 'NEXT_HAND') {
      const nextDealer = getNextSeat(room.state.dealer);
      room.state = createGameState({
        variant: action.variant || room.variant,
        dealer: nextDealer,
        seed: action.seed || null,
        matchScore: room.state.matchScore
      });
      if (action.variant) room.variant = action.variant;
    } else {
      throw new Error(`Unknown action type: ${type}`);
    }

    room.updatedAt = Date.now();
    return room;
  }

  /**
   * Advance any pending Bot AI turns synchronously or step-by-step
   */
  stepBotIfNeeded(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room) return null;
    const st = room.state;

    if (st.phase === 'HAND_OVER') return null;

    if (st.phase === 'SELECT_TRUMP') {
      const selector = st.trumpSelector;
      if (room.seats[selector].type === 'bot') {
        const dec = chooseBotTrump(st, selector, room.botDifficulty);
        room.state = selectTrump(st, dec.suit, dec.hiddenCardId);
        room.updatedAt = Date.now();
        return { actor: selector, action: 'SELECT_TRUMP', detail: dec };
      }
      return null;
    }

    if (st.phase === 'TRICK_PLAY') {
      const active = st.currentTurn;
      if (room.seats[active].type === 'bot') {
        const dec = chooseBotMove(st, active, room.botDifficulty);
        if (dec.action === 'REVEAL_HIDDEN_RUNG') {
          room.state = revealHiddenRung(st, active);
          room.updatedAt = Date.now();
          return { actor: active, action: 'REVEAL_HIDDEN_RUNG', detail: dec };
        }
        room.state = playCard(st, active, dec.cardId);
        room.updatedAt = Date.now();
        return { actor: active, action: 'PLAY_CARD', detail: dec };
      }
    }
    return null;
  }

  /**
   * Build redacted state payloads for all 4 seats in the room
   */
  getRedactedPayloads(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room) return null;
    const meta = {
      roomCode: room.roomCode,
      seats: Object.fromEntries(
        SEATS.map(s => [
          s,
          { seat: s, type: room.seats[s].type, name: room.seats[s].name, connected: room.seats[s].connected }
        ])
      )
    };
    const payloads = {};
    for (const seat of SEATS) {
      payloads[seat] = sanitizeStateForSeat(room.state, seat, meta);
    }
    return payloads;
  }
}
