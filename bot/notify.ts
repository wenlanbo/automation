// Slack notifications: info / warning / error / heartbeat. No-op if no webhook.
let webhook: string | undefined;
let dryRun = false;

export function initNotify(opts: { slackWebhook?: string; dryRun: boolean }): void {
  webhook = opts.slackWebhook;
  dryRun = opts.dryRun;
}

async function send(text: string): Promise<void> {
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.warn("  slack send failed:", (e as Error).message);
  }
}

const tag = () => (dryRun ? "DRY-RUN" : "LIVE");

export function info(text: string): Promise<void> {
  return send(`ℹ️ [${tag()}] ${text}`);
}
export function warn(text: string): Promise<void> {
  console.warn("  WARN:", text);
  return send(`⚠️ [${tag()}] ${text}`);
}
export function error(text: string): Promise<void> {
  console.error("  ERROR:", text);
  return send(`🚨 [${tag()}] ${text}`);
}

export interface Heartbeat {
  question: string;
  status: string;
  totalMarketCap: number;
  volume: number;
  openPositions: number;
  exposureUsdt: number;
  realizedPnlUsdt: number;
  armedWallets: number;
  topOutcome?: { name: string; price: number };
}

export function heartbeat(h: Heartbeat): Promise<void> {
  const lines = [
    `💓 [${tag()}] 42 bot heartbeat`,
    `• Market: ${h.question} (${h.status})`,
    `• Market cap: ${h.totalMarketCap.toFixed(0)} USDT | volume: ${h.volume.toFixed(0)} USDT`,
    h.topOutcome
      ? `• Leading: ${h.topOutcome.name} @ ${h.topOutcome.price.toFixed(4)}`
      : "",
    `• Armed wallets: ${h.armedWallets} | open positions: ${h.openPositions} | exposure: ${h.exposureUsdt.toFixed(2)} USDT`,
    `• Realized PnL: ${h.realizedPnlUsdt >= 0 ? "+" : ""}${h.realizedPnlUsdt.toFixed(3)} USDT`,
  ].filter(Boolean);
  return send(lines.join("\n"));
}
