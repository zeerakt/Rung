# Architecture & Engine Design (`zeerakt/rung`)

## 1. Pure Functional Game State Machine (`src/engine/rungEngine.js`)

The Rung engine is designed as a deterministic, side-effect-free state machine where every transition clones and returns an updated state snapshot. This guarantees identical behavior across the browser 2.5D tabletop UI, the in-browser test runner, and the Node.js headless CI test suite.

### State Phases (`state.phase`)
1. `SELECT_TRUMP`:
   - Triggered by `createGameState({ variant, dealer, seed, matchScore })`.
   - Shuffles a 52-card deck (supports deterministic LCG seeding via `seed` for reproducible unit tests) and deals the initial **5 cards** to `south`, `west`, `north`, and `east`.
   - Assigns `trumpSelector = getNextSeat(dealer)` (*Hukamwala*).
2. `TRICK_PLAY`:
   - Entered via `selectTrump(state, suit, hiddenCardId)`.
   - Deals the remaining 32 cards in two 4-card batches (`batch4A` and `batch4B`) so all players hold 13 cards (or 12 visible cards + 1 face-down `hiddenRungCard` for the selector in `HIDDEN_RUNG`).
   - Progresses through 13 tricks (`number: 1..13`). Each trick records `plays: [{ seat, card, revealedHiddenRung }]`.
3. `HAND_OVER`:
   - Entered automatically when Trick #13 resolves in `resolveCompletedTrick(state)`.
   - Computes `handWinner` (`teamA` for South/North vs. `teamB` for West/East), checks for a **Kot** (13–0 shutout worth +2 match points vs. +1 standard match point), and increments `matchScore`.

## 2. Imperfect-Information Bot AI (`src/ai/rungBot.js`)

Unlike naive card games where bots inspect hidden opponent hands, `rungBot.js` operates strictly on public table history (`state.trickHistory` and `state.currentTrick.plays`) plus the active bot's own hand:

- **`buildBotMemory(state, perspectiveSeat)`**:
  - Tracks `playedIds` (all cards played so far) and `suitCountsPlayed` (0..13 per suit).
  - Builds a 4×4 `voidMatrix[seat][suit]` whenever a player fails to follow `leadSuit`.
  - Computes `highestUnplayedBySuit[suit]` to identify the current **Boss Card** in each suit.
- **`chooseBotTrump(state, seat, difficulty)`**:
  - Evaluates the initial 5-card hand using suit length (`count * 18`), honor sum (`honorSum * 1.35`), and high honor density (`highHonors * 6`).
  - In `HIDDEN_RUNG`, selects the lowest card of the strongest suit to tuck face-down (`hiddenCardId`), preserving high honors (`A`, `K`, `Q`) for active play.
- **`chooseBotMove(state, seat, difficulty)`**:
  - **Void Reveal Heuristic**: When void in `leadSuit` during `HIDDEN_RUNG`, reveals the Hidden Rung unless the partner is already commanding the trick with a King or Ace.
  - **Lead Selection**: Prioritizes non-trump boss winners where opponents are not void, Double Sar consecutive-win trump pushes, or trump draws when holding 4+ trumps.
  - **Following & 4th-Seat Economy**: Sloughs low non-trumps when partner is winning; wins as cheaply as possible in 4th seat.
