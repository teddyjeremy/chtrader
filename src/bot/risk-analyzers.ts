import type {
  BundleAssessment, EvidenceMeta, HolderDistribution, LiquidityAssessment, MarketPhase
} from "./types.js";

export type HolderAccount = {
  owner: string; amountRaw: string; isBurn?: boolean; isPoolOrProgram?: boolean;
  isCreator?: boolean; isCreatorLinked?: boolean; isInsider?: boolean; isSuspectedCluster?: boolean;
};
export type SwapObservation = {
  wallet: string; signature: string; slot: number; timestampMs: number;
  side: "buy" | "sell"; tokenAmountRaw: string; funder?: string;
  creatorLinked?: boolean;
};
const pct = (part: bigint, whole: bigint): number => whole > 0n ? Number(part * 1_000_000n / whole) / 10_000 : 0;
const sum = (values: bigint[]) => values.reduce((a,b)=>a+b,0n);
const meta = (status: EvidenceMeta["status"], source: EvidenceMeta["source"], observedAtMs: number, notes: string[] = []): EvidenceMeta =>
  ({status,source,observedAtMs,staleAfterMs:15_000,notes});

/** Reconstructs owner-level concentration. Caller must provide a complete token-account snapshot
 * and explicitly classify pool/program/burn accounts; unknown accounts are not silently excluded. */
export function analyzeHolders(input: {
  supplyRaw: string; decimals: number; accounts: HolderAccount[];
  observedAtMs: number; completeSnapshot: boolean;
}): HolderDistribution {
  const supply = BigInt(input.supplyRaw);
  if (supply <= 0n) throw new Error("supplyRaw must be positive");
  const byOwner = new Map<string,bigint>();
  let burned=0n, excluded=0;
  let creator=0n, creatorLinked=0n, cluster=0n, insider=0n;
  for (const a of input.accounts) {
    const amount=BigInt(a.amountRaw);
    if (amount < 0n) throw new Error("holder amount cannot be negative");
    if (a.isBurn) { burned+=amount; continue; }
    if (a.isPoolOrProgram) { excluded++; continue; }
    byOwner.set(a.owner,(byOwner.get(a.owner)??0n)+amount);
    if (a.isCreator) creator+=amount;
    if (a.isCreator || a.isCreatorLinked) creatorLinked+=amount;
    if (a.isSuspectedCluster) cluster+=amount;
    if (a.isInsider) insider+=amount;
  }
  const balances=[...byOwner.values()].sort((a,b)=>a>b?-1:a<b?1:0);
  const total=sum(balances);
  const notes:string[]=[];
  if (total+burned>supply) notes.push("account_balances_exceed_reported_supply_check_snapshot_and_decimals");
  if (!input.completeSnapshot) notes.push("holder_snapshot_incomplete");
  const status=input.completeSnapshot && total+burned<=supply ? "verified" : "partial";
  return {
    ...meta(status,["rpc","helius"],input.observedAtMs,notes),
    supplyRaw:input.supplyRaw,decimals:input.decimals,
    top1Pct:pct(balances.slice(0,1).reduce((a,b)=>a+b,0n),supply),
    top5Pct:pct(sum(balances.slice(0,5)),supply),
    top10Pct:pct(sum(balances.slice(0,10)),supply),
    top20Pct:pct(sum(balances.slice(0,20)),supply),
    creatorCurrentPct:pct(creator,supply),creatorLinkedCurrentPct:pct(creatorLinked,supply),
    suspectedClusterCurrentPct:pct(cluster,supply),insiderCurrentPct:pct(insider,supply),
    burnedPct:pct(burned,supply),excludedAccountCount:excluded
  };
}

/** Detects candidate coordination clusters. Same-slot buys alone never establish a bundle. */
export function analyzeBundles(input: {
  swaps: SwapObservation[]; supplyRaw: string; observedAtMs: number; historyComplete: boolean;
}): BundleAssessment {
  const supply=BigInt(input.supplyRaw);
  const buys=input.swaps.filter(x=>x.side==="buy");
  const byFunder=new Map<string,SwapObservation[]>();
  for (const b of buys) if (b.funder) byFunder.set(b.funder,[...(byFunder.get(b.funder)??[]),b]);
  const commonFunderGroups=[...byFunder.values()].filter(g=>new Set(g.map(x=>x.wallet)).size>=2);
  const bySignature=new Map<string,Set<string>>();
  for (const b of buys) bySignature.set(b.signature,new Set([...(bySignature.get(b.signature)??[]),b.wallet]));
  const sameTxWallets=[...bySignature.values()].reduce((n,s)=>n+Math.max(0,s.size-1),0);
  const coordinated=new Set<string>();
  for (const g of commonFunderGroups) for (const b of g) coordinated.add(b.wallet);
  for (const s of bySignature.values()) if (s.size>=2) for (const w of s) coordinated.add(w);
  const walletBuys=new Map<string,bigint>();
  for (const b of buys) walletBuys.set(b.wallet,(walletBuys.get(b.wallet)??0n)+BigInt(b.tokenAmountRaw));
  const acquired=sum([...walletBuys.values()].filter((_,i)=>coordinated.has([...walletBuys.keys()][i])));
  const current=0n; // Current holdings are supplied by holder-account reconstruction, not inferred from buys.
  const slots=new Map<number,Set<string>>();
  for (const b of buys) slots.set(b.slot,new Set([...(slots.get(b.slot)??[]),b.wallet]));
  const sameSlotOnly=coordinated.size===0 && [...slots.values()].some(s=>s.size>=3);
  const signals:string[]=[];
  if(commonFunderGroups.length) signals.push("multiple_buyers_share_funder");
  if(sameTxWallets) signals.push("multiple_buyers_in_same_transaction");
  if(sameSlotOnly || [...slots.values()].some(s=>s.size>=3)) signals.push("multiple_buyers_in_same_slot");
  const confidence=Math.min(1,(commonFunderGroups.length?0.55:0)+(sameTxWallets?0.35:0)+(coordinated.size>=3?0.1:0));
  return {
    ...meta(input.historyComplete?"verified":"partial",["helius","derived"],input.observedAtMs,
      input.historyComplete?[]:["transaction_history_window_incomplete"]),
    confidence,coordinatedWalletCount:coordinated.size,
    acquiredSupplyPct:pct(acquired,supply),currentHoldingsSupplyPct:pct(current,supply),
    creatorLinkedWalletCount:new Set(buys.filter(x=>x.creatorLinked).map(x=>x.wallet)).size,
    sameTransactionWalletCount:sameTxWallets,
    commonFunderWalletCount:new Set(commonFunderGroups.flat().map(x=>x.wallet)).size,
    sameSlotOnly,signals
  };
}

export function assessLiquidity(input: {
  phase: MarketPhase; observedAtMs: number; verified: boolean;
  curveVirtualSolReserves?: number; curveRealSolReserves?: number; curveTokenReserves?: number;
  migratedPoolLiquiditySol?: number; lpBurnedPct?: number; lpLockedPct?: number;
  lpUnlockAtMs?: number | null; lpAuthorityRevoked?: boolean;
  estimatedExitImpactPct?: number; exitCapacitySol?: number;
}): LiquidityAssessment {
  const notes:string[]=[];
  if(input.phase==="bonding_curve" && input.curveRealSolReserves===undefined && input.curveVirtualSolReserves===undefined)
    notes.push("bonding_curve_sol_reserves_missing");
  if(input.phase==="migrated" && input.migratedPoolLiquiditySol===undefined)
    notes.push("migrated_pool_liquidity_missing");
  if(input.phase==="migrated" && input.lpBurnedPct===undefined && input.lpLockedPct===undefined)
    notes.push("lp_lock_and_burn_not_verified");
  if(input.phase==="migrating" || input.phase==="unknown") notes.push("market_phase_not_stable");
  return {
    ...meta(input.verified && notes.length===0?"verified":"partial",["helius","rpc","derived"],input.observedAtMs,notes),
    marketPhase:input.phase,curveVirtualSolReserves:input.curveVirtualSolReserves,
    curveRealSolReserves:input.curveRealSolReserves,curveTokenReserves:input.curveTokenReserves,
    migratedPoolLiquiditySol:input.migratedPoolLiquiditySol,lpBurnedPct:input.lpBurnedPct,
    lpLockedPct:input.lpLockedPct,lpUnlockAtMs:input.lpUnlockAtMs,
    lpAuthorityRevoked:input.lpAuthorityRevoked,estimatedExitImpactPct:input.estimatedExitImpactPct,
    exitCapacitySol:input.exitCapacitySol
  };
}
