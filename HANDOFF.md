# Handoff / New-Machine Setup

Everything durable lives in **GitHub** (this repo) + **Railway** (deploy, secrets,
state). Any computer is disposable — the live bot runs on Railway 24/7 regardless.

## What's deployed right now

- **Repo:** `git@github.com:wenlanbo/automation.git`
- **Railway project:** `automation` (id `601e080e-315a-4254-93f5-15c975d6b32a`), service `automation`
- **Dashboard:** https://automation-production-79a4.up.railway.app  (`/healthz` = health)
- **Market traded:** `0x38D8CA35d8662b2c6C94199497d787c93Aa34fEE` (2026 World Cup Winner)
- **Mode:** `DRY_RUN=false` (real). Loop every 5 min, market-summary heartbeat every 30 min → Slack.
- **Active campaign** (`campaign.json`): Main→France, Alt→Brazil — buy-all then sell 10% every ~5 min until flat.
- **Wallets:** `WALLET_1` (Main), `WALLET_2` (Alt). Both kept **disarmed** so the rules
  engine doesn't trade them while the campaign runs.

## Where secrets live (NOT in git)

- Wallet private keys → Railway vars `WALLET_1_KEY`, `WALLET_2_KEY` (sealed).
- `SLACK_WEBHOOK`, `DASHBOARD_PASSWORD` → Railway vars.
- `scripts/set-wallets.sh` (gitignored) → only needed to *change* wallets; recreate
  from `scripts/set-wallets.example.sh`.

## New machine — setup (≈5 steps)

```bash
# 1. tools
curl -fsSL https://bun.sh/install | bash          # bun
brew install railway                              # railway CLI (or npm i -g @railway/cli)

# 2. code
git clone git@github.com:wenlanbo/automation.git
cd automation && bun install

# 3. connect to the live Railway project
railway login                                     # interactive (browser) — use a real terminal
railway link                                       # pick: Wenlanbo's Projects → automation → production

# 4. confirm you have control
railway status                                     # should show project=automation, service=automation
railway logs                                        # watch the live bot
railway variables --service automation --kv | sed -E 's/=.*//'   # list var NAMES (no values)

# 5. dashboard login
#    open the dashboard URL above; password is the DASHBOARD_PASSWORD Railway var
#    (retrieve from your password manager, or `railway variables` locally).
```

## Common operations

```bash
bun run bot:scan                       # inspect market outcomes + rule matches (read-only)
railway run --service automation bun bot/bot.ts status   # market + wallet balances (uses live keys)
railway logs                           # live logs
railway redeploy -y                    # restart latest deployment
railway up                             # rebuild + deploy current local code

# Manual one-off trade (real), keys injected from Railway, never printed:
railway run --service automation bun bot/trade-once.ts France 1 5 3

# Reset wallets (edit keys in the gitignored copy first):
cp scripts/set-wallets.example.sh scripts/set-wallets.sh   # then edit + run
bash scripts/set-wallets.sh
```

## Stop / change the campaign

- Stop early: set `"enabled": false` in `campaign.json`, then `railway up`.
- It otherwise auto-completes after `sellChunks` (10) sells per wallet.

## Known follow-ups (not yet done)

- `buildPortfolio` shows position value 0 for campaign wallets — it reads the
  rules-engine position list, not on-chain holdings. Fix: populate from
  `getUserState` so dashboard shows actual France/Brazil holdings.
- Add a code guard so the rules engine always skips wallets with an active
  campaign leg (currently relies on them staying disarmed).
- Auto-claim winnings when the market finalises (today it only warns).

See `BOT.md` for full architecture and `README.md`/`SKILL.md` for the trading layer.
