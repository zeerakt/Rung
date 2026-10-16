# Royal Rung (Court Piece) — 2.5D Tabletop, AI Engine & Oracle VM Multiplayer (`zeerakt/rung`)

[![Deploy to GitHub Pages](https://github.com/zeerakt/rung/actions/workflows/deploy.yml/badge.svg)](https://github.com/zeerakt/rung/actions)

A South Asian partnership trick-taking card game (**Rung / Court Piece**) featuring a **2/2.5D perspective felt tabletop**, an **imperfect-information Bot AI with void/boss memory**, a **5-stage GitHub Actions CI/CD pipeline**, and a **zero-dependency Node.js WebSocket Multiplayer Server** ready for **Oracle Cloud Infrastructure (OCI) VM** deployment.

- **Live GitHub Pages Frontend**: `https://zeerakt.github.io/rung/`
- **Multiplayer Backend**: Zero-dependency Node.js 20 WebSocket server (`server/multiplayerServer.mjs`) + Oracle Cloud VM provisioning (`deploy/oracle-vm/setup_oracle_vm.sh`).

---

## 1. Push & Deploy to GitHub Pages First

```bash
unzip zeerakt_rung_repo.zip -d rung
cd rung

# Run all 4 verification suites (Docs + 12 Engine Specs + 4 Multiplayer Specs + 300-Hand Sim)
npm test

# Push to github.com/zeerakt/rung
git init
git branch -M main
git remote add origin https://github.com/zeerakt/rung.git
git add .
git commit -m "feat: Royal Rung 2.5D tabletop, Bot AI, CI pipeline & Oracle VM multiplayer"
git push -u origin main
```

In your GitHub repository, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**. Every push to `main` automatically runs all tests and deploys to `https://zeerakt.github.io/rung/`.

---

## 2. Deploy the Real-Time Multiplayer Server on Your Oracle Cloud VM

See **[`docs/MULTIPLAYER_ORACLE_VM.md`](docs/MULTIPLAYER_ORACLE_VM.md)** for the full architecture and Oracle Cloud firewall guide.

```bash
# On your Oracle Cloud Ubuntu VM:
git clone https://github.com/zeerakt/rung.git
cd rung
sudo bash deploy/oracle-vm/setup_oracle_vm.sh https://github.com/zeerakt/rung.git
```

Or run locally / on your VM with Node.js 20+:
```bash
npm run start:server
# ♠ Royal Rung Multiplayer Server listening on ws://0.0.0.0:8080
```

---

## 3. Repository Structure

```text
zeerakt-rung/
├── .github/workflows/deploy.yml        # 5-stage CI/CD pipeline -> GitHub Pages
├── deploy/oracle-vm/
│   ├── setup_oracle_vm.sh              # 1-command Oracle Cloud VM provisioning script
│   ├── nginx-rung.conf                 # Nginx WebSocket reverse proxy config
│   └── rung-multiplayer.service        # systemd daemon unit file
├── docs/
│   ├── ARCHITECTURE.md                 # State machine & Bot AI void/boss memory design
│   ├── MULTIPLAYER_ORACLE_VM.md        # GitHub Pages + Oracle Cloud VM multiplayer guide
│   ├── PIPELINE.md                     # Automated test & CI/CD pipeline guide
│   └── RULES.md                        # Single Sar, Double Sar, Chup Rung & Kot rules
├── server/
│   ├── roomManager.mjs                 # Authoritative rooms, Fog-of-War redaction & Bot fill
│   └── multiplayerServer.mjs           # Zero-dependency RFC 6455 WebSocket + HTTP server
├── src/
│   ├── engine/rungEngine.js            # Pure functional 52-card Rung engine
│   └── ai/rungBot.js                   # Imperfect-information Bot AI (Casual/Tactical/Master)
├── tests/
│   ├── engine.test.mjs                 # 12 core engine & Bot AI unit specifications
│   ├── multiplayer.test.mjs            # 4 multiplayer room & Fog-of-War specifications
│   └── simulation.test.mjs             # 300-hand Monte Carlo Bot-vs-Bot invariant verifier
├── Dockerfile                          # Containerized Oracle VM image
├── docker-compose.yml                  # 1-command Docker Compose stack
├── index.html                          # Self-contained 2.5D Web App (Single-Player + Multiplayer)
└── package.json                        # Scripts: test, test:unit, test:mp, test:sim, start:server
```
