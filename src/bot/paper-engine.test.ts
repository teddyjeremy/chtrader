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
  suspiciousClusterDominance:false,sameSlotRoundTripDominance:false,dataFresh:true,marketStateVerified:true
});
test("paper engine waits until the next completed one-second close",()=>{
  const signal=snapshot(1000);
  const decision=evaluateEntry(signal);
  const engine=new PaperEngine();
  assert.equal(decision.action,"buy");
  assert.equal(engine.open(decision,signal),false);
  assert.equal(engine.open(decision,snapshot(2000)),true);
  assert.equal(engine.getState().openPositions.length,1);
});
test("paper engine rejects a delayed signal and never opens after migration",()=>{
  const signal=snapshot(1000);
  const decision=evaluateEntry(signal);
  const engine=new PaperEngine();
  assert.equal(engine.open(decision,snapshot(4000)),false);
  const migrated=snapshot(2000);migrated.phase="migrated";
  assert.equal(engine.open(decision,migrated),false);
});
