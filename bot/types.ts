// Shared types for the single-market, multi-wallet 42.space trading bot.

export type CompareOp = ">" | ">=" | "<" | "<=" | "==" | "abs>" | "abs<";

/** A single entry/exit condition evaluated against an outcome's metrics. */
export interface Rule {
  metric: string;
  op: CompareOp;
  value: number;
}

export interface EntryConfig {
  rules: Rule[];
  combine: "all" | "any";
  minPriceUsdt: number;
  maxPriceUsdt: number;
}

export interface ExitConfig {
  takeProfitPct: number;
  stopLossPct: number;
  maxHoldHours: number;
  exitBeforeEndHours: number;
}

export interface SizingConfig {
  /** USDT per entry, per wallet. */
  usdtPerTrade: number;
  /** Max concurrent positions per wallet. */
  maxConcurrentPositions: number;
  /** Max total USDT a single wallet may deploy into this market. */
  maxTotalExposureUsdt: number;
  reentryCooldownHours: number;
}

export interface ExecutionConfig {
  slippagePct: number;
  /** Halt live buys for a wallet if its BNB (gas) drops below this. */
  minBnbReserve: number;
}

export interface StrategyConfig {
  entry: EntryConfig;
  exit: ExitConfig;
  sizing: SizingConfig;
  execution: ExecutionConfig;
}

/** One outcome of the target market, enriched for display + rule matching. */
export interface Outcome {
  tokenId: number;
  name: string;
  price: number; // USDT/OT (on-chain marginal)
  supply: number; // OT in circulation
  marketCap: number; // USDT
  payoutPerOt: number;
  volume: number; // REST: outcome volume
  traders: number;
  metrics: Record<string, number>; // priceChange1h, volumeChange24h, buyRatio, ...
}

/** Full snapshot of the single market the bot trades. */
export interface MarketSnapshot {
  address: string;
  question: string;
  status: string; // live / ended / resolved / finalised
  isFinalised: boolean;
  endDate: string | null;
  totalMarketCap: number;
  volume: number;
  traders: number;
  numOutcomes: number;
  outcomes: Outcome[];
  fetchedAt: string;
}

/** An open position held by a wallet. */
export interface Position {
  tokenId: number;
  name: string;
  entryPrice: number;
  otAmountWei: string;
  usdtCost: number;
  openedAt: string;
  fill: "live" | "paper";
  txHash?: string;
}

export interface ClosedTrade {
  tokenId: number;
  name: string;
  entryPrice: number;
  exitPrice: number;
  usdtCost: number;
  usdtReturned: number;
  pnlUsdt: number;
  pnlPct: number;
  reason: string;
  openedAt: string;
  closedAt: string;
  fill: "live" | "paper";
}

/** Per-wallet persisted state. */
export interface WalletState {
  /** Safe switch. Default false = no trading. */
  armed: boolean;
  positions: Position[];
  closed: ClosedTrade[];
  /** tokenId -> ISO timestamp of last exit (re-entry cooldown). */
  cooldowns: Record<string, string>;
  realizedPnlUsdt: number;
}

export interface BotState {
  /** Keyed by wallet id (label-derived or address). */
  wallets: Record<string, WalletState>;
  lastRun: string | null;
  lastHeartbeat: string | null;
}

/** Live wallet runtime info (not persisted — keys live only in memory). */
export interface WalletRuntime {
  id: string;
  label: string;
  address: string;
  canSign: boolean;
}

/** A wallet's live portfolio view for the dashboard. */
export interface WalletPortfolio {
  id: string;
  label: string;
  address: string;
  armed: boolean;
  canSign: boolean;
  bnb: number;
  usdt: number;
  positions: Array<
    Position & {
      currentPrice: number;
      currentValue: number;
      unrealizedPnlUsdt: number;
      unrealizedPnlPct: number;
    }
  >;
  positionValueUsdt: number;
  realizedPnlUsdt: number;
  claimableUsdt: number;
}
