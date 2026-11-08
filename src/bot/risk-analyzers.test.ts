import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBundles, analyzeHolders, assessLiquidity } from "./risk-analyzers.js";

test("holder analysis aggregates token accounts by owner and excludes pool accounts", () => {
  const result=analyzeHolders({
    supplyRaw:"10000",decimals:0,observedAtMs:1000,completeSnapshot:true,
    accounts:[
      {owner:"whale",amountRaw:"2500"},{owner:"whale",amountRaw:"1500"},
      {owner:"holder2",amountRaw:"1000",isCreator:true},
      {owner:"cluster",amountRaw:"1200",isSuspectedCluster:true,isCreatorLinked:true},
      {owner:"burn",amountRaw:"500",isBurn:true},
      {owner:"pool",amountRaw:"3300",isPoolOrProgram:true}
    ]
  });
  assert.equal(result.top1Pct,40);
  assert.equal(result.creatorCurrentPct,10);
  assert.equal(result.creatorLinkedCurrentPct,22);
  assert.equal(result.suspectedClusterCurrentPct,12);
  assert.equal(result.burnedPct,5);
  assert.equal(result.excludedAccountCount,1);
  assert.equal(result.status,"verified");
});

test("bundle analysis requires more than same-slot coincidence for confidence", () => {
  const result=analyzeBundles({
    supplyRaw:"10000",observedAtMs:2000,historyComplete:true,
    swaps:[
      {wallet:"a",signature:"sig-a",slot:8,timestampMs:1000,side:"buy",tokenAmountRaw:"1000"},
      {wallet:"b",signature:"sig-b",slot:8,timestampMs:1001,side:"buy",tokenAmountRaw:"1000"},
      {wallet:"c",signature:"sig-c",slot:8,timestampMs:1002,side:"buy",tokenAmountRaw:"1000"}
    ]
  });
  assert.equal(result.sameSlotOnly,true);
  assert.equal(result.confidence,0);
  assert.equal(result.currentHoldingsSupplyPct,0);
  assert.ok(result.signals.includes("multiple_buyers_in_same_slot"));
});

test("common funder evidence estimates coordinated buys and current balances separately", () => {
  const result=analyzeBundles({
    supplyRaw:"10000",observedAtMs:2000,historyComplete:true,
    currentHoldingsByWallet:{a:"500",b:"300"},
    swaps:[
      {wallet:"a",funder:"fund",signature:"sig-a",slot:8,timestampMs:1000,side:"buy",tokenAmountRaw:"1000"},
      {wallet:"b",funder:"fund",signature:"sig-b",slot:9,timestampMs:1100,side:"buy",tokenAmountRaw:"1000"}
    ]
  });
  assert.equal(result.coordinatedWalletCount,2);
  assert.equal(result.acquiredSupplyPct,20);
  assert.equal(result.currentHoldingsSupplyPct,8);
  assert.ok(result.confidence>=0.55);
});

test("bonding curve reserves are not mislabelled as locked migrated LP", () => {
  const result=assessLiquidity({
    phase:"bonding_curve",observedAtMs:1000,verified:true,
    curveRealSolReserves:12,curveTokenReserves:9000
  });
  assert.equal(result.marketPhase,"bonding_curve");
  assert.equal(result.curveRealSolReserves,12);
  assert.equal(result.lpLockedPct,undefined);
  assert.equal(result.status,"verified");
});
