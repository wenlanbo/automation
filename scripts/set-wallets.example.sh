#!/usr/bin/env bash
#
# set-wallets.sh — reset the bot's wallets on Railway to EXACTLY the set defined
# below. Every run is idempotent: it CLEARS all existing wallet variables and the
# persisted state (per-wallet armed flags + positions), then applies only the
# wallets listed here, then redeploys.
#
#   Usage:
#     cp scripts/set-wallets.example.sh scripts/set-wallets.sh   # gitignored copy
#     # edit scripts/set-wallets.sh — fill in real LABEL|KEY lines
#     bash scripts/set-wallets.sh
#
# ⚠️  SECURITY: the real copy contains PRIVATE KEYS. Keep it OUT of git
#     (scripts/set-wallets.sh is gitignored). Never commit real keys.
#
# Notes:
#   - All wallets load SAFE (disarmed). Arm them in the dashboard to trade.
#   - This does NOT touch DRY_RUN / DASHBOARD_PASSWORD / SLACK_WEBHOOK.
#   - Requires: railway CLI logged in, and this dir linked to the project.
set -euo pipefail

# ============================ CONFIG ============================
SERVICE="automation"               # Railway service name
STATE_PATH="/data/bot-state.json"  # must match BOT_STATE_PATH on Railway
MAX_SLOTS=20                        # number of WALLET_n_* slots to clear each run
RESET_STATE=true                   # wipe persisted armed flags/positions on reset

# ===================== DEFINE YOUR WALLETS ======================
# One per line as  "Label|0x<64 hex private key>".  Add/remove freely.
WALLETS=(
  "Main|0xREPLACE_WITH_REAL_64_HEX_PRIVATE_KEY_0000000000000000000000"
  "Alt|0xREPLACE_WITH_REAL_64_HEX_PRIVATE_KEY_0000000000000000000000"
  # "Whale|0x...."
)
# ================================================================

key_re='^0x[0-9a-fA-F]{64}$'
declare -a KEYS=() LABELS=()
for entry in "${WALLETS[@]}"; do
  label="${entry%%|*}"
  key="${entry#*|}"
  if [[ ! "$key" =~ $key_re ]]; then
    echo "ERROR: wallet '$label' — key must be 0x + 64 hex chars." >&2
    exit 1
  fi
  LABELS+=("$label")
  KEYS+=("$key")
done

COUNT=${#KEYS[@]}
if (( COUNT == 0 )); then echo "ERROR: no wallets defined." >&2; exit 1; fi
if (( COUNT > MAX_SLOTS )); then
  echo "ERROR: ${COUNT} wallets exceeds MAX_SLOTS=${MAX_SLOTS}. Raise MAX_SLOTS." >&2
  exit 1
fi
echo "Setting ${COUNT} wallet(s) on '${SERVICE}'; clearing the remaining slots up to ${MAX_SLOTS}."

# Build a single variables command that defines EVERY slot exactly once:
# slots 1..COUNT get the real wallets; the rest are set empty (= cleared).
SET_ARGS=()
for (( i=1; i<=MAX_SLOTS; i++ )); do
  idx=$(( i - 1 ))
  if (( idx < COUNT )); then
    SET_ARGS+=( --set "WALLET_${i}_KEY=${KEYS[$idx]}" --set "WALLET_${i}_LABEL=${LABELS[$idx]}" )
  else
    SET_ARGS+=( --set "WALLET_${i}_KEY=" --set "WALLET_${i}_LABEL=" )
  fi
done

# Apply variables without an intermediate deploy (we deploy once at the end).
railway variables --service "$SERVICE" --skip-deploys "${SET_ARGS[@]}" >/dev/null
echo "✓ wallet variables applied."

# Wipe persisted state so the new wallet set starts clean (all SAFE, no positions).
if [[ "$RESET_STATE" == "true" ]]; then
  if railway ssh --service "$SERVICE" "rm -f '$STATE_PATH'" >/dev/null 2>&1; then
    echo "✓ persisted state wiped ($STATE_PATH)."
  else
    echo "! could not wipe state via ssh (container restarting?). New wallets may"
    echo "  inherit a prior slot's armed flag — re-run this script once it's up if so."
  fi
fi

# Redeploy to load the new wallet set.
railway redeploy -y >/dev/null
echo "✓ redeploy triggered. Wallets load in ~1 min, all SAFE until armed in the dashboard."
echo
echo "Verify with:  railway logs   (look for 'wallets=${COUNT}')"
