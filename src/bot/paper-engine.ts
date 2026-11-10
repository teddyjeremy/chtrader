import type { ClosedPaperTrade, Decision, MarketSnapshot, PaperPosition } from "./types.js";
import { AdaptiveExitManager, DEFAULT_ADAPTIVE_EXIT_CONFIG } from "./adaptive-exit-manager.js";
import type { ExitConfig } from "./adaptive-exit-manager.js";
import { evaluateEntry } from "./rules.js";
import { evaluateTokenEconomics } from "./market-guards.js";

export type PaperConfig = {
  startingEquitySol: number;
  maxPositionSol: number;
  maxOpenPositions: number;
  riskFraction: number;
  estimatedExitCostFraction: number;
  adaptiveExit: ExitConfig;
};
export const DEFAULT_PAPER_CONFIG: PaperConfig = {
  startingEquitySol: 0.05,
  maxPositionSol: 0.006,
  maxOpenPositions: 3,
  riskFraction: 0.01,
  estimatedExitCostFraction: 0.02,
  adaptiveExit: DEFAULT_ADAPTIVE_EXIT_CONFIG
};
export class PaperEngine {
  private equitySol: number;
  private readonly positions = new Map<string, PaperPosition>();
  private readonly exitManagers = new Map<string, AdaptiveExitManager>();
  private readonly closed: ClosedPaperTrade[] = [];
  private readonly decisions: Decision[] = [];
  private consecutiveLosses = 0;
  private halted = false;
  constructor(private readonly config: PaperConfig = DEFAULT_PAPER_CONFIG) {
    this.equitySol = config.startingEquitySol;
  }
  getState() {
    return {
      mode: "paper" as const, equitySol: this.equitySol, halted: this.halted,
      consecutiveLosses: this.consecutiveLosses, openPositions: [...this.positions.values()],
      closedTrades: this.closed.slice(-200), recentDecisions: this.decisions.slice(-200),
      totalTrades: this.closed.length, netPnlSol: this.equitySol - this.config.startingEquitySol
    };
  }
  recordDecision(d: Decision): void {
    this.decisions.push(d);
    if (this.decisions.length > 2000) this.decisions.splice(0, this.decisions.length - 2000);
  }
  open(d: Decision, s: MarketSnapshot): boolean {
    const signalAgeMs = s.timestampMs - d.timestampMs;
    if (this.halted || d.action !== "buy" || d.mint !== s.mint ||
        signalAgeMs < 1000 || signalAgeMs > 2000 ||
        this.positions.size >= this.config.maxOpenPositions || this.positions.has(s.mint)) return false;
    if (!(s.priceSol > 0) || !s.dataFresh || !s.marketStateVerified ||
        !s.exitRouteAvailable || s.phase !== "bonding_curve" ||
        !Number.isFinite(s.estimatedRoundTripFeePct)) return false;
    // Re-evaluate the completed entry bar: stale signal approval cannot bypass new vetoes.
    if (evaluateEntry(s).action !== "buy") return false;
    const economics = evaluateTokenEconomics(s.tokenEconomics, s.estimatedRoundTripFeePct, s.timestampMs);
    if (economics.effectiveRoundTripCostPct === undefined || economics.reject.length || economics.watch.length) return false;
    const roundTripCostPct = economics.effectiveRoundTripCostPct;
    const riskSol = this.equitySol * this.config.riskFraction;
    const totalStopRiskFraction = this.config.adaptiveExit.hardStopPct + roundTripCostPct / 100;
    const riskSizedNotional = totalStopRiskFraction > 0 ? riskSol / totalStopRiskFraction : 0;
    const notionalSol = Math.min(this.config.maxPositionSol, riskSizedNotional, this.equitySol * 0.25);
    if (notionalSol <= 0 || notionalSol > this.equitySol) return false;
    const position: PaperPosition = {
      mint: s.mint, entryPriceSol: s.priceSol, quantity: notionalSol / s.priceSol, notionalSol,
      openedAtMs: s.timestampMs,
      stopPriceSol: s.priceSol * (1 - this.config.adaptiveExit.hardStopPct),
      highestPriceSol: s.priceSol,
      entryCostSol: notionalSol * roundTripCostPct / 200,
      roundTripCostPct
    };
    this.positions.set(s.mint, position);
    this.exitManagers.set(s.mint, new AdaptiveExitManager(s.priceSol, s.timestampMs, this.config.adaptiveExit));
    return true;
  }
  mark(s: MarketSnapshot): ClosedPaperTrade | null {
    const p = this.positions.get(s.mint);
    const manager = this.exitManagers.get(s.mint);
    if (!p || !manager || !(s.priceSol > 0) || s.timestampMs <= p.openedAtMs) return null;
    let reason: string | undefined;
    let exitPrice = s.priceSol;
    if (!s.exitRouteAvailable || !s.marketStateVerified) reason = "emergency_exit_route_or_state_failure";
    else if (s.creatorDistributing || s.suspiciousClusterDominance) reason = "emergency_distribution_or_cluster";
    else {
      const decision = manager.onBar({
        timestampMs: s.timestampMs,
        open: s.priceSol, high: s.priceSol, low: s.priceSol, close: s.priceSol,
        buyQuote: s.buyVolumeSol10s, sellQuote: s.sellVolumeSol10s
      }, s.phase !== "bonding_curve");
      p.highestPriceSol = decision.peakPrice;
      if (decision.stopPrice !== undefined) p.stopPriceSol = Math.max(p.stopPriceSol, decision.stopPrice);
      if (decision.action === "hold") return null;
      reason = decision.reason ?? "adaptive_exit";
      exitPrice = reason === "migration" || reason === "max_hold"
        ? s.priceSol
        : Math.min(s.priceSol, decision.exitPrice ?? s.priceSol);
    }
    const gross = (exitPrice - p.entryPriceSol) * p.quantity;
    const exitEconomics = evaluateTokenEconomics(s.tokenEconomics, s.estimatedRoundTripFeePct, s.timestampMs);
    const currentRoundTripCostPct = exitEconomics.effectiveRoundTripCostPct ?? p.roundTripCostPct;
    const costs = p.notionalSol * currentRoundTripCostPct / 200 + p.entryCostSol + s.estimatedNetworkCostSol;
    const net = gross - costs;
    this.equitySol += net;
    this.positions.delete(s.mint);
    this.exitManagers.delete(s.mint);
    const trade: ClosedPaperTrade = {
      mint: s.mint, openedAtMs: p.openedAtMs, closedAtMs: s.timestampMs,
      entryPriceSol: p.entryPriceSol, exitPriceSol: exitPrice, quantity: p.quantity,
      grossPnlSol: gross, estimatedCostsSol: costs, netPnlSol: net, exitReason: reason
    };
    this.closed.push(trade);
    this.consecutiveLosses = net < 0 ? this.consecutiveLosses + 1 : 0;
    if (this.consecutiveLosses >= 3) this.halted = true;
    return trade;
  }
}
