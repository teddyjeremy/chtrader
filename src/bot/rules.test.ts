import test from "node:test";
import assert from "node:assert/strict";
import { evaluateEntry } from "./rules.js";
import type { MarketSnapshot } from "./types.js";
const valid = (): MarketSnapshot => ({
  mint:"test-mint",timestampMs:10000,phase:"bonding_curve",ageSeconds:15,priceSol:0.000001,
  impulsePct:25,secondsSinceImpulse:2,pullbackFraction:0.20,higherLowConfirmed:true,
  pivotReclaimed:true,pivotReclaimPct:1.5,independentBuyers10s:4,buyVolumeSol10s:4,sellVolumeSol10s:1,
  buyQuoteVolume2s:4,sellQuoteVolume2s:1,uniqueBuyers2s:4,uniqueSellers2s:1,largestBuyerShare2s:0.5,
  liquiditySol:12,estimatedEntryImpactPct:0.5,estimatedExitImpactPct:0.5,estimatedRoundTripFeePct:3,
  estimatedNetworkCostSol:0.00001,exitRouteAvailable:true,creatorDistributing:false,
  suspiciousClusterDominance:false,sameSlotRoundTripDominance:false,dataFresh:true,marketStateVerified:true,
  creatorRisk:{status:"verified",observedAtMs:10000,creatorWalletKnown:true,creatorSellSupplyPct60s:0,creatorLinkedSellSupplyPct60s:0,relatedWalletBuyShare30s:10,relatedWalletHoldingsSupplyPct:5,clusterConfidence:0.9},
  flowPersistence:{status:"verified",observedAtMs:10000,windows:[
    {startMs:4000,endMs:6000,buyQuote:4,sellQuote:1,uniqueBuyers:3,uniqueSellers:1,largestBuyerShare:0.5,buyerWallets:["a","b","c"]},
    {startMs:6000,endMs:8000,buyQuote:4,sellQuote:1,uniqueBuyers:3,uniqueSellers:1,largestBuyerShare:0.5,buyerWallets:["a","b","d"]},
    {startMs:8000,endMs:10000,buyQuote:4,sellQuote:1,uniqueBuyers:3,uniqueSellers:1,largestBuyerShare:0.5,buyerWallets:["a","e","f"]}
  ]},
  tokenEconomics:{status:"verified",observedAtMs:10000,buyTransferTaxPct:0,sellTransferTaxPct:0,quoteAsset:{mint:"So11111111111111111111111111111111111111112",symbol:"SOL",decimals:9,kind:"native",solPerUnit:1,conversionVerified:true,transferTaxPct:0}}
});
test("accepts a snapshot meeting every strict entry condition",()=>{
  const d=evaluateEntry(valid()); assert.equal(d.action,"buy"); assert.equal(d.score,100);
});
test("requires +20% impulse, 10-40% pullback and +1% pivot reclaim",()=>{
  const cases:Array<[(s:MarketSnapshot)=>void,string]>=[
    [(s)=>{s.impulsePct=19.99;},"60s_impulse_below_20pct_or_invalid"],
    [(s)=>{s.pullbackFraction=0.09;},"pullback_outside_10_to_40pct_or_invalid"],
    [(s)=>{s.pullbackFraction=0.41;},"pullback_outside_10_to_40pct_or_invalid"],
    [(s)=>{s.pivotReclaimPct=0.99;},"5s_pivot_reclaim_below_1pct"]
  ];
  for(const [mutate,reason] of cases){const s=valid();mutate(s);assert.ok(evaluateEntry(s).reasons.includes(reason));}
});
test("requires >3x two-second buy quote, 3 buyers, sellers <= half and <=72% concentration",()=>{
  const cases:Array<[(s:MarketSnapshot)=>void,string]>=[
    [(s)=>{s.buyQuoteVolume2s=3;},"2s_buy_quote_not_greater_than_3x_sell_quote"],
    [(s)=>{s.uniqueBuyers2s=2;},"fewer_than_3_unique_buyers_in_2s"],
    [(s)=>{s.uniqueBuyers2s=3;s.uniqueSellers2s=2;},"seller_wallet_count_above_half_of_buyers"],
    [(s)=>{s.largestBuyerShare2s=0.73;},"largest_buyer_share_above_72pct"]
  ];
  for(const [mutate,reason] of cases){const s=valid();mutate(s);assert.ok(evaluateEntry(s).reasons.includes(reason));}
});
test("fails closed when two-second metrics are missing",()=>{
  const s=valid();delete s.buyQuoteVolume2s;delete s.uniqueBuyers2s;delete s.largestBuyerShare2s;
  const d=evaluateEntry(s);assert.equal(d.action,"watch");assert.ok(d.reasons.includes("2s_buy_sell_quote_data_missing_or_invalid"));
});
test("rejects stale data, non-curve markets and unavailable exit routes",()=>{
  const cases:Array<(s:MarketSnapshot)=>void>=[
    (s)=>{s.dataFresh=false;},(s)=>{s.phase="migrated";},(s)=>{s.exitRouteAvailable=false;}
  ];
  for(const mutate of cases){const s=valid();mutate(s);assert.equal(evaluateEntry(s).action,"reject");}
});
