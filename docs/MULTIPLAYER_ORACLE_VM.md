# Deploying to GitHub Pages & Building Multiplayer on Oracle Cloud (OCI) VM

This guide walks through **(Part 1)** pushing and deploying `zeerakt/rung` to GitHub Pages first, and **(Part 2)** running the authoritative 4-player WebSocket Multiplayer Server on your **Oracle Cloud Infrastructure (OCI) VM**.

---

## Part 1: Push & Deploy to GitHub Pages First (`zeerakt/rung`)

Because the repository already includes a 5-stage GitHub Actions workflow (`.github/workflows/deploy.yml`), pushing to `main` automatically runs all unit tests, multiplayer fog-of-war tests, and the 300-hand Monte Carlo simulation before publishing to `https://zeerakt.github.io/rung/`.

### Step 1 — Unzip and Push to GitHub
Run these commands in your local terminal after downloading `zeerakt_rung_repo.zip`:

```bash
unzip zeerakt_rung_repo.zip -d rung
cd rung

# Optional: Run the full verification suite locally (Docs + 12 Engine Specs + 4 Multiplayer Specs + 300-Hand Sim)
npm test

# Initialize Git and push to github.com/zeerakt/rung
git init
git branch -M main
git remote add origin https://github.com/zeerakt/rung.git
git add .
git commit -m "feat: Royal Rung 2.5D tabletop, Bot AI, CI pipeline & Oracle VM multiplayer server"
git push -u origin main
```

### Step 2 — Enable GitHub Actions Pages Source
1. Open `https://github.com/zeerakt/rung/settings/pages` in your browser.
2. Under **Build and deployment → Source**, select **GitHub Actions** (instead of "Deploy from a branch").
3. Open the **Actions** tab (`https://github.com/zeerakt/rung/actions`) — once the workflow turns green (~45 seconds), your game is live at **`https://zeerakt.github.io/rung/`**.

---

## Part 2: How the Multiplayer Architecture Works on Oracle Cloud VM

Card games with hidden information (especially **Rung / Court Piece** and **Hidden Rung / Chup Rung**) **cannot** rely on peer-to-peer client state broadcasting because any player could inspect browser network traffic to see opponents' hands or the face-down Chup Rung card.

### 1. Authoritative Server + Fog-of-War Redaction (`server/roomManager.mjs`)
Because the core engine (`src/engine/rungEngine.js`) and Bot AI (`src/ai/rungBot.js`) are written in **pure ES modules (`node` + browser compatible)**, your Oracle Cloud VM runs the exact same state machine authoritatively:

- **Single Source of Truth**: The Oracle VM shuffles the 52-card deck, deals the `5-4-4` batches, validates legal suit-following, and resolves trick winners and Double Sar center-pile sweeps.
- **Per-Seat Fog-of-War Redaction (`sanitizeStateForSeat`)**:
  - When broadcasting `ROOM_STATE` to **South**, `myHand` contains South's 13 cards, while `handCounts` sends only `{ south: 13, west: 13, north: 13, east: 13 }`. West, North, and East's card identities are stripped.
  - In **Hidden Rung (`HIDDEN_RUNG`)**, `trumpSuit` and `hiddenRungCard.card` are redacted to `null` for all players except the `trumpSelector` (*Hukamwala*) until `trumpRevealed === true`.
- **Hybrid Human + Bot AI Seats**: Any of the 4 seats (`south`, `west`, `north`, `east`) not occupied by a human player is automatically played by the server's Master Bot AI (`stepBotIfNeeded`), so 2 friends can team up as North/South against 2 bots, or 3 friends can play with 1 bot partner.
- **Session Reconnection Tokens**: Each human seat receives a unique token (`tok_<ROOM>_<SEAT>_<HASH>`) stored in `localStorage`. If a player's mobile connection drops, re-joining with that token reclaims their exact seat and hand mid-trick.

### 2. WebSocket Wire Protocol (`server/multiplayerServer.mjs`)

| Direction | Event `type` | Payload Fields | Description |
| :--- | :--- | :--- | :--- |
| **Client → Server** | `CREATE_ROOM` | `{ roomCode, variant, botDifficulty, playerName, preferredSeat }` | Creates a new 4-seat room on the Oracle VM and assigns the host seat |
| **Client → Server** | `JOIN_ROOM` | `{ roomCode, playerName, preferredSeat, token }` | Joins an open bot seat or reconnects to an existing human seat via `token` |
| **Client → Server** | `SELECT_TRUMP` | `{ suit, hiddenCardId }` | Hukamwala declares Rung after the initial 5-card deal |
| **Client → Server** | `REVEAL_HIDDEN_RUNG` | `{}` | Void player requests Chup Rung reveal mid-trick |
| **Client → Server** | `PLAY_CARD` | `{ cardId }` | Plays a legal card from the player's hand |
| **Client → Server** | `NEXT_HAND` | `{ variant }` | Rotates dealer and starts the next hand in the room |
| **Server → Client** | `ROOM_STATE` | `{ roomCode, seat, token, state }` | Seat-specific Fog-of-War redacted game state |
| **Server → Client** | `ERROR` | `{ message }` | Validation error (e.g., playing out of turn or failing to follow suit) |

---

## Part 3: Step-by-Step Deployment on Your Oracle Cloud (OCI) VM

Oracle Cloud VMs (such as **Ampere A1 ARM64** or **AMD Micro** running Ubuntu 22.04/24.04) have **two separate firewalls**:
1. The **OCI VCN Security List / Network Security Group** in the Oracle Cloud web console.
2. The **OS-level `iptables` firewall** inside Ubuntu (which blocks ports `80`, `443`, and `8080` by default even if UFW is disabled).

### Step 1 — Open Ports in Oracle Cloud Console (VCN Security List)
1. Log into the **Oracle Cloud Console** → **Networking** → **Virtual Cloud Networks** → click your VCN → **Subnets** → click your public subnet → **Security Lists**.
2. Click **Add Ingress Rules** and add:
   - **Source CIDR**: `0.0.0.0/0`, **IP Protocol**: `TCP`, **Destination Port Range**: `80, 443, 8080`

### Step 2 — Run the Automated Provisioning Script on Your Oracle VM
SSH into your Oracle VM and run the included provisioning script (`deploy/oracle-vm/setup_oracle_vm.sh`):

```bash
ssh ubuntu@<YOUR_ORACLE_VM_PUBLIC_IP>

# Clone your GitHub repo and run the 1-command Oracle VM installer
git clone https://github.com/zeerakt/rung.git
cd rung
sudo bash deploy/oracle-vm/setup_oracle_vm.sh https://github.com/zeerakt/rung.git
```

Or if you prefer **Docker** on your Oracle VM:

```bash
docker compose up -d --build
```

### Step 3 — Enable `wss://` (TLS) for GitHub Pages Compatibility
Because GitHub Pages is served over `https://zeerakt.github.io/rung/`, browsers require a secure WebSocket (`wss://`) connection when connecting from GitHub Pages to your Oracle VM:
1. Point a free subdomain (e.g., DuckDNS, Cloudflare, or No-IP like `rung.yourdomain.com`, or `<VM_IP>.nip.io`) to your Oracle VM's public IP.
2. Run Certbot on the Oracle VM to automatically configure Let's Encrypt TLS on Nginx:
   ```bash
   sudo certbot --nginx -d rung.yourdomain.com
   ```
3. In the game's **🌐 Multiplayer & Oracle VM** tab, enter `wss://rung.yourdomain.com` (or open `http://<YOUR_ORACLE_VM_IP>` directly) to create or join live rooms!
