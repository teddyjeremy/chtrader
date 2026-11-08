export type CostModel = {
  entryFeeBps: number;
  exitFeeBps: number;
  entrySlippageBps: number;
  exitSlippageBps: number;
  fixedNetworkCostUsd: number;
  rentCostUsd: number;
};

export type SizeRequest = {
  equityUsd: number;
  riskFraction: number;
  notionalCapUsd: number;
  stopDistanceFraction: number;
  targetDistanceFraction: number;
  costs: CostModel;
  minimumNetRewardRisk?: number;
};

export type SizeResult = {
  allowed: boolean;
  reason: string;
  notionalUsd: number;
  maxLossUsd: number;
  expectedNetProfitUsd: number;
  netRewardRisk: number;
  roundTripVariableCostFraction: number;
  fixedCostsUsd: number;
};

export function calculatePositionSize(input: SizeRequest): SizeResult {
  const { equityUsd, riskFraction, notionalCapUsd, stopDistanceFraction, targetDistanceFraction, costs } = input;
  const bps = (value: number) => value / 10_000;
  const variableCost = bps(costs.entryFeeBps + costs.exitFeeBps + costs.entrySlippageBps + costs.exitSlippageBps);
  const fixedCosts = costs.fixedNetworkCostUsd + costs.rentCostUsd;
  const riskBudget = equityUsd * riskFraction;

  if (!Number.isFinite(equityUsd) || equityUsd <= 0 ||
      !Number.isFinite(riskFraction) || riskFraction <= 0 || riskFraction > 0.02 ||
      !Number.isFinite(notionalCapUsd) || notionalCapUsd <= 0 ||
      stopDistanceFraction <= 0 || targetDistanceFraction <= 0 ||
      variableCost < 0 || fixedCosts < 0) {
    return rejected("Invalid input or risk fraction above the 2% hard ceiling.");
  }

  const lossFraction = stopDistanceFraction + variableCost;
  const riskAffordableNotional = (riskBudget - fixedCosts) / lossFraction;
  const notional = Math.min(notionalCapUsd, riskAffordableNotional);
  if (notional <= 0) return rejected("Fixed transaction costs already exceed the available risk budget.", variableCost, fixedCosts);

  const maxLoss = notional * lossFraction + fixedCosts;
  const expectedProfit = notional * (targetDistanceFraction - variableCost) - fixedCosts;
  const netRewardRisk = maxLoss > 0 ? expectedProfit / maxLoss : 0;
  const minRr = input.minimumNetRewardRisk ?? 1.5;

  if (expectedProfit <= 0) return rejected("Expected target does not cover estimated round-trip costs.", variableCost, fixedCosts);
  if (netRewardRisk < minRr) return rejected(`Net reward/risk ${netRewardRisk.toFixed(2)} is below required ${minRr.toFixed(2)}.`, variableCost, fixedCosts);
  if (maxLoss > riskBudget + 1e-9) return rejected("Estimated stop loss exceeds the risk budget.", variableCost, fixedCosts);

  return {
    allowed: true, reason: "Sizing fits the risk budget and estimated net reward/risk requirement.",
    notionalUsd: round(notional), maxLossUsd: round(maxLoss),
    expectedNetProfitUsd: round(expectedProfit), netRewardRisk: round(netRewardRisk),
    roundTripVariableCostFraction: variableCost, fixedCostsUsd: fixedCosts
  };
}

function rejected(reason: string, variableCost = 0, fixedCosts = 0): SizeResult {
  return { allowed: false, reason, notionalUsd: 0, maxLossUsd: 0, expectedNetProfitUsd: 0,
    netRewardRisk: 0, roundTripVariableCostFraction: variableCost, fixedCostsUsd: fixedCosts };
}
function round(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }
