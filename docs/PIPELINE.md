# Testing & CI/CD Deployment Pipeline (`zeerakt/rung`)

## 1. Automated Verification Stages

The repository enforces a three-stage verification pipeline before publishing any build to GitHub Pages:

| Stage | Script / Command | Scope & Assertions |
| :--- | :--- | :--- |
| **Stage 1: Docs & Asset Integrity** | `npm run test:docs` | Verifies `README.md`, `docs/ARCHITECTURE.md`, `docs/RULES.md`, `docs/PIPELINE.md`, `index.html`, and `.github/workflows/deploy.yml` exist and are non-empty. |
| **Stage 2: Core Engine & AI Unit Specs** | `npm run test:unit` (`tests/engine.test.mjs`) | Executes **12 unit test specifications** covering 52-card deck generation, seeded shuffles, 5–4–4 dealing, legal move validation, Single Sar, Double Sar streak sweeps, Chup Rung face-down tuck & void reveal, Kot (+2 pt) scoring, and Master Bot AI void/boss tracking. |
| **Stage 3: 300-Hand Monte Carlo Sim** | `npm run test:sim` (`tests/simulation.test.mjs`) | Runs **300 complete 13-trick hands** (100 Single Sar, 100 Double Sar, 100 Hidden Rung) across Casual, Tactical, and Master AI bots, verifying zero deadlocks and strict 52-card conservation. |

## 2. GitHub Actions Workflow (`.github/workflows/deploy.yml`)

The workflow triggers automatically on:
- `push` to `main`
- `pull_request` targeting `main`
- Manual `workflow_dispatch` from the GitHub Actions tab

### Pipeline Jobs
1. **`verify-test-and-bundle`**:
   - Runs on `ubuntu-latest` with Node.js 20.
   - Executes `npm run test:docs`, `npm run test:unit`, and `npm run test:sim`.
   - Assembles the static production bundle in `./dist` (`index.html`, `src/`, `docs/`, `README.md`) and uploads the GitHub Pages artifact via `actions/upload-pages-artifact@v3`.
2. **`deploy`**:
   - Runs on `main` branch pushes after `verify-test-and-bundle` succeeds.
   - Publishes `./dist` to `https://zeerakt.github.io/rung/` via `actions/deploy-pages@v4`.
