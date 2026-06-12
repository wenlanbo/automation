// Fund-retrieval ("drain") routine. For each wallet, in order:
//   1. sell ALL outcome positions back to USDT (retrying smaller on revert to
//      absorb price impact on thin outcomes),
//   2. transfer the full USDT balance to the destination,
//   3. transfer (almost) all BNB to the destination — last, since the USDT
//      transfer above needs BNB for gas.
// Runs inside the server process (which owns the signers) AFTER the strategy is
// paused, so it never races the trading loop for nonces. Progress → Slack.
import { formatUnits, getAddress, type Address } from "viem";
import type { RuntimeConfig } from "./config.ts";
import * as chain from "./chain.ts";
import * as notify from "./notify.ts";
import type { ManagedWallet } from "./wallets.ts";

const TICK_WEI = 10n ** 16n; // 0.01 OT
const floorTick = (wei: bigint) => wei - (wei % TICK_WEI);
const f = (n: number, d = 2) => n.toLocaleString("en-US", { maximumFractionDigits: d });

/** Sell a full position, halving on revert (price impact) down to a floor. */
async function liquidatePosition(
  w: ManagedWallet,
  market: Address,
  tokenId: number,
  name: string,
  slippagePct: number,
): Promise<number> {
  let remaining = floorTick((await readHolding(market, w.address, tokenId)));
  let gotUsdt = 0;
  let attempts = 0;
  while (remaining > 0n && attempts < 12) {
    attempts++;
    let lot = remaining;
    let sold = false;
    // Try the whole lot; on revert, halve a few times before giving up on this round.
    for (let h = 0; h < 6 && lot >= TICK_WEI; h++) {
      try {
        const sim = await chain.simulateSell(market, tokenId, lot);
        await chain.executeSell(w.signer, market, tokenId, lot, slippagePct, sim);
        gotUsdt += sim.collateralUsdt;
        sold = true;
        break;
      } catch {
        lot = floorTick(lot / 2n); // impact too high — try a smaller slice
      }
    }
    if (!sold) break;
    remaining = floorTick(await readHolding(market, getAddress(w.address) as Address, tokenId));
  }
  if (remaining > 0n)
    await notify.warn(`withdraw ${w.label}: ${name} not fully sold (${f(parseFloat(formatUnits(remaining, 18)))} OT dust left)`);
  return gotUsdt;
}

async function readHolding(market: Address, addr: string, tokenId: number): Promise<bigint> {
  const us = await chain.getUserState(market, getAddress(addr) as Address);
  return us.holdings.find((h) => h.tokenId === tokenId)?.otHolding ?? 0n;
}

export interface WithdrawResult {
  to: string;
  usdtSent: number;
  bnbSent: number;
  perWallet: Array<{ label: string; usdt: number; bnb: number; error?: string }>;
}

export async function withdrawAll(
  rc: RuntimeConfig,
  wallets: ManagedWallet[],
  to: Address,
  slippagePct = 12,
): Promise<WithdrawResult> {
  const market = getAddress(rc.targetMarket) as Address;
  const result: WithdrawResult = { to, usdtSent: 0, bnbSent: 0, perWallet: [] };

  await notify.alertHere(
    `💸 [${notify.tagStr()}] Withdraw started → ${to}\nLiquidating all positions, then sending USDT then BNB from ${wallets.length} wallet(s).`,
  );

  for (const w of wallets) {
    const addr = getAddress(w.address) as Address;
    const row = { label: w.label, usdt: 0, bnb: 0 } as WithdrawResult["perWallet"][number];
    try {
      // 1. Liquidate every held outcome to USDT.
      const us = await chain.getUserState(market, addr);
      for (const h of us.holdings) {
        if (floorTick(h.otHolding) <= 0n) continue;
        const name = `#${h.tokenId}`;
        await liquidatePosition(w, market, h.tokenId, name, slippagePct);
      }

      // 2. Send the full USDT balance.
      const usdtWei = await chain.usdtBalanceWei(addr);
      if (usdtWei > 0n) {
        if (rc.dryRun) {
          row.usdt = parseFloat(formatUnits(usdtWei, 18));
        } else {
          await chain.transferUsdt(w.signer, to, usdtWei);
          row.usdt = parseFloat(formatUnits(usdtWei, 18));
        }
      }

      // 3. Send (almost) all BNB last (USDT transfer above needed gas).
      if (!rc.dryRun) {
        const sent = await chain.sendAllBnb(w.signer, to);
        if (sent) row.bnb = parseFloat(formatUnits(sent.valueWei, 18));
      } else {
        const bal = await chain.getBalances(addr);
        row.bnb = Math.max(0, bal.bnb - 0.0005);
      }

      result.usdtSent += row.usdt;
      result.bnbSent += row.bnb;
      await notify.message(
        `  ✅ ${w.label}: sent ${f(row.usdt)} USDT + ${f(row.bnb, 5)} BNB → ${to.slice(0, 8)}…`,
      );
    } catch (e) {
      row.error = (e as Error).message;
      await notify.error(`withdraw ${w.label}: ${row.error}`);
    }
    result.perWallet.push(row);
  }

  await notify.alertHere(
    `✅ [${notify.tagStr()}] Withdraw complete → ${to}\nTotal: ${f(result.usdtSent)} USDT + ${f(result.bnbSent, 5)} BNB across ${wallets.length} wallet(s).`,
  );
  return result;
}
