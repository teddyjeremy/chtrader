import test from "node:test";
import assert from "node:assert/strict";
import { buildCreatorRiskAssessment, buildFlowPersistenceAssessment } from "./market-guard-builders.js";
import type { MarketSwapEvent } from "./market-guard-builders.js";

const events: MarketSwapEvent[] = [];
for (const [start, wallets] of [[4_000,["a","b","c"]],[6_000,["a","b","d"]],[8_000,["a","e","f"]]] as const) {
  for (const wallet of wallets) events.push({
    wallet,side:"buy",timestampMs:start+100,tokenAmountRaw:"100",quoteAmount:1
  });
}

test("builds three consecutive completed two-second flow windows",()=>{
  const result=buildFlowPersistenceAssessment({swaps:events,observedAtMs:10_000,historyComplete:true});
  assert.equal(result.status,"verified");
  assert.equal(result.windows.length,3);
  assert.deepEqual(result.windows.map(w=>[w.startMs,w.endMs]),[[4_000,6_000],[6_000,8_000],[8_000,10_000]]);
  assert.equal(new Set(result.windows.flatMap(w=>w.buyerWallets)).size,6);
});
test("marks incomplete swap history as partial rather than passing it as verified",()=>{
  const result=buildFlowPersistenceAssessment({swaps:events,observedAtMs:10_000,historyComplete:false});
  assert.equal(result.status,"partial");
});
test("measures creator sells and related-wallet concentration using supply units",()=>{
  const swaps:MarketSwapEvent[]=[
    {wallet:"creator",side:"sell",timestampMs:9_500,tokenAmountRaw:"100",quoteAmount:1},
    {wallet:"linked",side:"sell",timestampMs:9_600,tokenAmountRaw:"200",quoteAmount:2,creatorLinked:true},
    {wallet:"cluster-a",side:"buy",timestampMs:9_700,tokenAmountRaw:"100",quoteAmount:6},
    {wallet:"other",side:"buy",timestampMs:9_800,tokenAmountRaw:"100",quoteAmount:4}
  ];
  const result=buildCreatorRiskAssessment({
    swaps,creatorWallet:"creator",relatedWallets:["cluster-a"],relatedClusterConfidence:0.9,
    currentHoldingsByWallet:{"cluster-a":"500"},supplyRaw:"10000",observedAtMs:10_000,
    historyComplete:true,holdingsComplete:true
  });
  assert.equal(result.status,"verified");
  assert.equal(result.creatorSellSupplyPct60s,1);
  assert.equal(result.creatorLinkedSellSupplyPct60s,2);
  assert.equal(result.relatedWalletBuyShare30s,60);
  assert.equal(result.relatedWalletHoldingsSupplyPct,5);
});
test("missing creator or incomplete holdings keep creator-risk evidence partial",()=>{
  const result=buildCreatorRiskAssessment({
    swaps:[],creatorWallet:null,relatedWallets:[],relatedClusterConfidence:0,
    currentHoldingsByWallet:{},supplyRaw:"1000",observedAtMs:10_000,
    historyComplete:true,holdingsComplete:false
  });
  assert.equal(result.status,"partial");
  assert.equal(result.creatorWalletKnown,false);
});
