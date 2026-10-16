# Official Rung (Court Piece) Rulebook & Variants

## Core Partnership Setup & 5–4–4 Dealing Cadence

- **Players & Partnerships**: 4 players in fixed partnerships sitting opposite one another:
  - **Team A (N/S)**: `south` (You) & `north` (Amina — Partner Bot)
  - **Team B (E/W)**: `west` (Tariq — Bot) & `east` (Zafar — Bot)
- **The 5–4–4 Deal**:
  1. Each player receives an initial batch of **5 cards**.
  2. The player to the dealer's right (`trumpSelector` / *Hukamwala*) inspects their 5 cards and declares the **Rung (Trump)** suit.
  3. The remaining 32 cards are dealt in two batches of **4 cards** per player, bringing each hand to 13 cards.

## Rule Variants

### 1. Single Sar (`SINGLE_SAR` / یک سر)
- Each trick is awarded immediately to the partnership that wins it.
- Players must follow the led suit (`leadSuit`) if holding a card of that suit; if void, they may play any card (including a Rung card to trump the trick).
- The partnership that collects a majority of tricks (**7 or more out of 13**) wins the hand (+1 Match Point).

### 2. Double Sar (`DOUBLE_SAR` / دو سر)
- Winning a single trick (*Sar #1*) does **not** immediately collect the trick. Instead, tricks accumulate in the **Center Pile** (`centerPile`).
- A partnership collects the entire accumulated Center Pile only when they win **two consecutive tricks** (i.e. they win a trick while `lastTrickWinnerTeam` already belongs to their partnership), or on the 13th trick if tricks remain uncollected.
- Once a pile is swept, the consecutive-win streak resets (`lastTrickWinnerTeam = null`).

### 3. Hidden Rung / Chup Rung (`HIDDEN_RUNG` / چھپ رنگ)
- After viewing their initial 5 cards, the *Hukamwala* selects **1 card** and places it face-down on the table (`hiddenRungCard`). Its suit is the secret Rung.
- While the Rung is hidden (`trumpRevealed === false`), **trumps are inactive** — the highest card of the led suit wins every trick, even if cards of the secret Rung suit are discarded.
- A player who is **void in the led suit** on their turn may ask to **Reveal the Hidden Rung** (`revealHiddenRung`).
- Upon reveal:
  1. The secret Rung suit is announced to all players (`trumpRevealed = true`).
  2. The face-down card is returned to the *Hukamwala*'s hand so all 52 cards participate across the 13 tricks.
  3. If the revealing player holds any card(s) of the newly revealed Rung suit, they must play a Rung card on that turn.
- If the Hidden Rung is never revealed by the end of Trick #12, the face-down card is automatically returned to the *Hukamwala*'s hand for Trick #13.

## Kot (Grand Sweep) Scoring
- **Standard Hand Win**: Collecting 7–12 tricks while opponents collect at least 1 trick awards **+1 Match Point**.
- **Kot / Baazi (Shutout Sweep)**: Collecting all tricks (**13–0** in Single Sar / Chup Rung, or **13–0** collected in Double Sar) awards a **Kot** worth **+2 Match Points** and increments the partnership's `kotCount`.
