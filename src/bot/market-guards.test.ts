import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateEffectiveRoundTripCostPct,
  evaluateCreatorAndClusterRisk,
  evaluatePersistentBuyingPressure,
  evaluateTokenEconomics,
  quotePriceToSol,
  quoteUnitsToSol
} from "./market-guards.js";
import type { CreatorRiskAssessment, FlowPersistenceAssessment, TokenEconomicsAssessment } from "./types.js";

const creatorRisk = (): CreatorRiskAssessment => ({
  status:"verified",observedAtMs:10_000,creatorWalletKnown:true,
  creatorSellSupplyPct60s:0,creatorLinkedSellSupplyPct60s:0,relatedWalletSellSupplyPct60s:0,
  relatedWalletBuyShare30s:10,relatedWalletHoldingsSupplyPct:5,clusterConfidence:0.9
});
const flow = (): FlowPersistenceAssessment => ({
  status:"verified",observedAtMs:10_000,windows:[
    {startMs:6_000,endMs:8_000,buyQuote:4,sellQuote:1,uniqueBuyers:3,uniqueSellers:1,largestBuyerShare:0.5,buyerWallets:["a","b","c"]},
    {startMs:7_000,endMs:9_000,buyQuote:4,sellQuote:1,uniqueBuyers:3,uniqueSellers:1,largestBuyerShare:0.5,buyerWallets:["a","b","d"]},
    {startMs:8_000,endMs:10_000,buyQuote:4,sellQuote:1,uniqueBuyers:3,uniqueSellers:1,largestBuyerShare:0.5,buyerWallets:["a","e","f"]}
  ]
});
const economics = (): TokenEconomicsAssessment => ({
  status:"verified",observedAtMs:10_000,buyTransferTaxPct:0.1,sellTransferTaxPct:0.1,
  quoteAsset:{mint:"So11111111111111111111111111111111111111112",symbol:"SOL",decimals:9,kind:"native",solPerUnit:1,conversionVerified:true,transferTaxPct:0}
});

test("vetoes a creator sale even when other market conditions are healthy",()=>{
  const risk=creatorRisk();risk.creatorSellSupplyPct60s=0.2;
  assert.ok(evaluateCreatorAndClusterRisk(risk,false,false,10_000).reject.includes("creator_wallet_sold_tokens_recently"));
});
test("vetoes high-confidence related-wallet buy and holder concentration",()=>{
  const risk=creatorRisk();risk.relatedWalletBuyShare30s=45;risk.relatedWalletHoldingsSupplyPct=25;
  const result=evaluateCreatorAndClusterRisk(risk,false,false,10_000);
  assert.ok(result.reject.includes("related_wallets_dominate_recent_buy_volume"));
  assert.ok(result.reject.includes("related_wallets_hold_too_much_token_supply"));
});
test("same-slot or low-confidence cluster evidence does not become an automatic rug accusation",()=>{
  const risk=creatorRisk();risk.clusterConfidence=0.4;risk.relatedWalletBuyShare30s=50;
  const result=evaluateCreatorAndClusterRisk(risk,false,false,10_000);
  assert.equal(result.reject.length,0);
  assert.ok(result.watch.includes("possible_related_wallet_buy_concentration_needs_confirmation"));
});
test("requires three consecutive windows and at least five distinct buyer wallets",()=>{
  const result=evaluatePersistentBuyingPressure(flow(),10_000);
  assert.equal(result.watch.length,0);
  const broken=flow();broken.windows[1]!.buyQuote=2;
  assert.ok(evaluatePersistentBuyingPressure(broken,10_000).watch.includes("buying_pressure_window_2_failed"));
  const sameWallets=flow();sameWallets.windows.forEach(w=>w.buyerWallets=["a","b","c"]);
  assert.ok(evaluatePersistentBuyingPressure(sameWallets,10_000).watch.includes("too_few_distinct_buyers_across_persistence_windows"));
});
test("models token and quote transfer taxes in round-trip cost",()=>{
  const result=evaluateTokenEconomics(economics(),3,10_000);
  assert.ok(result.effectiveRoundTripCostPct! > 3);
  assert.ok(result.effectiveRoundTripCostPct! < 4);
  const tooTaxed=economics();tooTaxed.buyTransferTaxPct=3;
  assert.ok(evaluateTokenEconomics(tooTaxed,3,10_000).reject.includes("token_transfer_tax_exceeds_configured_limit"));
});
test("requires a verified quote-asset to SOL conversion",()=>{
  const q=economics();q.quoteAsset.conversionVerified=false;
  assert.ok(evaluateTokenEconomics(q,3,10_000).watch.includes("quote_asset_identity_or_sol_conversion_unverified"));
});
test("round-trip cost combines venue costs and independent transfer taxes multiplicatively",()=>{
  const cost=calculateEffectiveRoundTripCostPct({baseRoundTripCostPct:3,tokenBuyTaxPct:1,tokenSellTaxPct:1,quoteTransferTaxPct:0});
  assert.ok(cost > 4.9 && cost < 5.1);
});

test("does not accept a native quote asset with a false SOL conversion",()=>{
  const q=economics();q.quoteAsset.solPerUnit=0.5;
  assert.ok(evaluateTokenEconomics(q,3,10_000).watch.includes("quote_asset_identity_or_sol_conversion_unverified"));
});

test("normalizes non-SOL quote assets only through a verified conversion rate",()=>{
  const quote={mint:"aapl-x-mint",symbol:"AAPLx",decimals:6,kind:"other" as const,solPerUnit:2,conversionVerified:true,transferTaxPct:0};
  assert.equal(quoteUnitsToSol(3,quote),6);
  assert.equal(quotePriceToSol(0.5,quote),1);
  quote.conversionVerified=false;
  assert.throws(()=>quoteUnitsToSol(3,quote),/verified quote-to-SOL rate/);
});

test("vetoes selling from a high-confidence related-wallet cluster",()=>{
  const risk=creatorRisk();risk.relatedWalletSellSupplyPct60s=0.5;
  assert.ok(evaluateCreatorAndClusterRisk(risk,false,false,10_000).reject.includes("related_wallet_cluster_sold_tokens_recently"));
});

test("low-confidence related-wallet selling produces WATCH rather than a hard veto",()=>{
  const risk=creatorRisk();risk.clusterConfidence=0.4;risk.relatedWalletSellSupplyPct60s=0.5;
  const result=evaluateCreatorAndClusterRisk(risk,false,false,10_000);
  assert.equal(result.reject.length,0);
  assert.ok(result.watch.includes("possible_related_wallet_cluster_selling_needs_confirmation"));
});
