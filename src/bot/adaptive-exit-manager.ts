/**
 * Pump.fun bonding-curve adaptive exit manager.
 * Feed completed bars or timestamped price observations in strict chronological order.
 * Stops use the PREVIOUS completed observation's high-water mark (no same-bar look-ahead).
 * This module returns paper decisions only; it does not sign or submit transactions.
 */
export type ExitBar = {
  timestampMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  buyQuote?: number;
  sellQuote?: number;
};
export type ExitReason = "hard_stop" | "profit_floor" | "trailing_stop" | "migration" | "max_hold";
export type ExitDecision = {
  action: "hold" | "sell";
  reason?: ExitReason;
  exitPrice?: number;
  stopPrice?: number;
  peakPrice: number;
  peakGainPct: number;
  protectedFloorPrice: number;
};
export type ExitConfig = {
  hardStopPct: number;
  trailActivationPct: number;
  trailGapPct: number;
  maxHoldSeconds: number;
  profitLocks: Array<[number, number]>;
};
export const DEFAULT_ADAPTIVE_EXIT_CONFIG: ExitConfig = {
  hardStopPct: 0.05,
  trailActivationPct: 0.10,
  trailGapPct: 0.40,
  maxHoldSeconds: 300,
  profitLocks: [[0.10, 0.05], [0.50, 0.15], [1.00, 0.40], [2.00, 0.80]]
};
export class AdaptiveExitManager {
  private readonly config: ExitConfig;
  private peakPrice: number;
  private lastTimestampMs: number;
  private closed = false;
  constructor(
    private readonly entryPrice: number,
    private readonly entryTimestampMs: number,
    config: Partial<ExitConfig> = {}
  ) {
    if (!(entryPrice > 0) || !Number.isFinite(entryPrice)) throw new Error("entryPrice must be positive");
    this.config = { ...DEFAULT_ADAPTIVE_EXIT_CONFIG, ...config };
    if (!(this.config.hardStopPct > 0 && this.config.hardStopPct < 1)) throw new Error("invalid hardStopPct");
    if (!(this.config.trailActivationPct >= 0) || !(this.config.trailGapPct > 0 && this.config.trailGapPct < 1)) throw new Error("invalid trail configuration");
    if (!(this.config.maxHoldSeconds > 0)) throw new Error("maxHoldSeconds must be positive");
    this.peakPrice = entryPrice;
    this.lastTimestampMs = entryTimestampMs;
  }
  onBar(bar: ExitBar, migrating = false): ExitDecision {
    if (this.closed) throw new Error("Position is already closed");
    if (!(bar.timestampMs > this.lastTimestampMs)) throw new Error("Bars must be strictly chronological");
    if (!(bar.low > 0 && bar.high >= bar.low && bar.open > 0 && bar.close > 0)) throw new Error("Invalid OHLC bar");
    const ageSeconds = (bar.timestampMs - this.entryTimestampMs) / 1000;
    const priorPeak = this.peakPrice;
    const peakGain = priorPeak / this.entryPrice - 1;
    const floorGain = this.protectedGain(peakGain);
    const floorPrice = floorGain > 0 ? this.entryPrice * (1 + floorGain) : 0;
    if (migrating) return this.close("migration", bar.close, priorPeak, floorPrice);
    const hardStop = this.entryPrice * (1 - this.config.hardStopPct);
    let activeStop = hardStop;
    let stopReason: ExitReason = "hard_stop";
    if (peakGain >= this.config.trailActivationPct) {
      const wideTrail = priorPeak * (1 - this.config.trailGapPct);
      activeStop = Math.max(hardStop, wideTrail, floorPrice);
      if (floorPrice >= wideTrail && floorPrice >= hardStop) stopReason = "profit_floor";
      else if (wideTrail >= hardStop) stopReason = "trailing_stop";
    }
    if (bar.low <= activeStop) {
      const fill = bar.open < activeStop ? bar.open : activeStop;
      return this.close(stopReason, fill, priorPeak, floorPrice);
    }
    if (ageSeconds >= this.config.maxHoldSeconds) {
      return this.close("max_hold", bar.close, priorPeak, floorPrice);
    }
    this.peakPrice = Math.max(priorPeak, bar.high);
    this.lastTimestampMs = bar.timestampMs;
    return {
      action: "hold",
      peakPrice: this.peakPrice,
      peakGainPct: (this.peakPrice / this.entryPrice - 1) * 100,
      protectedFloorPrice: floorPrice,
      stopPrice: activeStop
    };
  }
  private protectedGain(peakGain: number): number {
    let floor = 0;
    for (const [trigger, lock] of this.config.profitLocks) {
      if (peakGain >= trigger) floor = Math.max(floor, lock);
    }
    return floor;
  }
  private close(reason: ExitReason, exitPrice: number, peakPrice: number, protectedFloorPrice: number): ExitDecision {
    this.closed = true;
    return {
      action: "sell", reason, exitPrice,
      peakPrice, peakGainPct: (peakPrice / this.entryPrice - 1) * 100,
      protectedFloorPrice
    };
  }
}
