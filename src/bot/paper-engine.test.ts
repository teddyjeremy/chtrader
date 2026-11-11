import test from "node:test";
import assert from "node:assert/strict";
import { PaperEngine } from "./paper-engine.js";
import { evaluateEntry } from "./rules.js";
import type { MarketSnapshot } from "./types.js";
const snapshot = (timestampMs: number): MarketSnapshot => ({
  mint:"paper-test-mint",timestampMs,phase:"bonding_curve",ageSeconds:15,priceSol:0.000001,
  impulsePct:25,secondsSinceImpulse:2,pullbackFraction:0.20,higherLowConfirmed:true,
  pivotReclaimed:true,pivotReclaimPct:1.5,independentBuyers10s:4,buyVolumeSol10s:4,sellVolumeSol10s:1,
  buyQuoteVolume2s:4,sellQuoteVolume2s:1,uniqueBuyers2s:4,uniqueSellers2s:1,largestBuyerShare2s:0.5,
  liquiditySol:12,estimatedEntryImpactPct:0.5,estimatedExitImpactPct:0.5,estimatedRoundTripFeePct:3,
  estimatedNetworkCostSol:0.00001,exitRouteAvailable:true,creatorDistributing:false,
  suspiciousClusterDominance:false,sameSlotRoundTripDominance:false,dataFresh:true,marketStateVerified:true,
  creatorRisk:{status:"verified",observedAtMs:timestampMs,creatorWalletKnown:true,creatorSellSupplyPct60s:0,creatorInitialAllocationSoldPctSinceLaunch:0,creatorSellSupplyPctSinceLaunch:0,
  creatorFirstSellAfterLaunchSeconds:null,creatorLifecycleHistoryComplete:true,
  creatorLinkedSellSupplyPct60s:0,relatedWalletSellSupplyPct60s:0,relatedWalletBuyShare30s:10,relatedWalletHoldingsSupplyPct:5,clusterConfidence:0.9},
  flowPersistence:{status:"verified",observedAtMs:timestampMs,windows:[
    {startMs:timestampMs-4000,endMs:timestampMs-2000,buyQuote:4,sellQuote:1,uniqueBuyers:3,uniqueSellers:1,largestBuyerShare:0.5,buyerWallets:["a","b","c"]},
    {startMs:timestampMs-3000,endMs:timestampMs-1000,buyQuote:4,sellQuote:1,uniqueBuyers:3,uniqueSellers:1,largestBuyerShare:0.5,buyerWallets:["a","b","d"]},
    {startMs:timestampMs-2000,endMs:timestampMs,buyQuote:4,sellQuote:1,uniqueBuyers:3,uniqueSellers:1,largestBuyerShare:0.5,buyerWallets:["a","e","f"]}
  ]},
  tokenEconomics:{status:"verified",observedAtMs:timestampMs,buyTransferTaxPct:0,sellTransferTaxPct:0,quoteAsset:{mint:"So11111111111111111111111111111111111111112",symbol:"SOL",decimals:9,kind:"native",solPerUnit:1,conversionVerified:true,transferTaxPct:0}}
});
test("paper engine waits until the next completed one-second close",()=>{
  const signal=snapshot(10000);
  const decision=evaluateEntry(signal);
  const engine=new PaperEngine();
  assert.equal(decision.action,"buy");
  assert.equal(engine.open(decision,signal),false);
  assert.equal(engine.open(decision,snapshot(11000)),true);
  assert.equal(engine.getState().openPositions.length,1);
});
test("paper engine rejects a delayed signal and never opens after migration",()=>{
  const signal=snapshot(1000);
  const decision=evaluateEntry(signal);
  const engine=new PaperEngine();
  assert.equal(engine.open(decision,snapshot(13000)),false);
  const migrated=snapshot(11000);migrated.phase="migrated";
  assert.equal(engine.open(decision,migrated),false);
});

test("paper engine rechecks creator-sale veto at entry time",()=>{
  const signal=snapshot(10000);
  const decision=evaluateEntry(signal);
  const entry=snapshot(11000);entry.creatorRisk!.creatorSellSupplyPct60s=0.2;
  const engine=new PaperEngine();
  assert.equal(decision.action,"buy");
  assert.equal(engine.open(decision,entry),false);
});
test("paper engine exits an open position on confirmed creator distribution",()=>{
  const signal=snapshot(10000);
  const engine=new PaperEngine();
  const decision=evaluateEntry(signal);
  assert.equal(engine.open(decision,snapshot(11000)),true);
  const distribution=snapshot(12000);
  distribution.creatorRisk!.creatorSellSupplyPct60s=0.2;
  const trade=engine.mark(distribution);
  assert.equal(trade?.exitReason,"emergency_creator_or_related_wallet_distribution");
});

test("paper engine blocks and exits on lifetime creator liquidation after the rolling window",()=>{
  const signal=snapshot(10000);
  const engine=new PaperEngine();
  const decision=evaluateEntry(signal);
  const entry=snapshot(11000);
  assert.equal(engine.open(decision,entry),true);
  const later=snapshot(100000);
  later.creatorRisk!.creatorInitialAllocationSoldPctSinceLaunch=100;
  later.creatorRisk!.creatorSellSupplyPct60s=0;
  const trade=engine.mark(later);
  assert.equal(trade?.exitReason,"emergency_creator_or_related_wallet_distribution");
});
