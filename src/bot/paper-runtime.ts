import { PaperEngine, DEFAULT_PAPER_CONFIG } from "./paper-engine.js";
import type { PaperConfig } from "./paper-engine.js";
import { buildMarketSnapshot } from "./market-snapshot-pipeline.js";
import type { MarketSnapshotPipelineInput } from "./market-snapshot-pipeline.js";
import { evaluateEntry } from "./rules.js";
import type { Decision, MarketSnapshot } from "./types.js";

/**
 * Deterministic paper-only runtime coordinator.
 * It consumes verified feed frames, builds snapshots, evaluates entries,
 * waits for the next completed one-second frame, and delegates adaptive exits
 * to PaperEngine. It has no wallet, signer, RPC submitter or live-order path.
 */
export class PaperTradingRuntime {
  private readonly pendingEntries = new Map<string, Decision>();
  readonly engine: PaperEngine;

  constructor(config: PaperConfig = DEFAULT_PAPER_CONFIG) {
    this.engine = new PaperEngine(config);
  }

  onMarketFrame(input: MarketSnapshotPipelineInput): {
    snapshot: MarketSnapshot;
    decision: Decision;
    opened: boolean;
    closedTrade: ReturnType<PaperEngine["mark"]>;
    state: ReturnType<PaperEngine["getState"]>;
  } {
    const snapshot = buildMarketSnapshot(input);
    const closedTrade = this.engine.mark(snapshot);

    let opened = false;
    const pending = this.pendingEntries.get(snapshot.mint);
    if (pending) {
      this.pendingEntries.delete(snapshot.mint);
      opened = this.engine.open(pending, snapshot);
    }

    const decision = evaluateEntry(snapshot);
    this.engine.recordDecision(decision);

    const alreadyOpen = this.engine.getState().openPositions.some(position => position.mint === snapshot.mint);
    if (!opened && !alreadyOpen && decision.action === "buy" &&
        !this.pendingEntries.has(snapshot.mint)) {
      this.pendingEntries.set(snapshot.mint, decision);
    }

    return { snapshot, decision, opened, closedTrade, state: this.engine.getState() };
  }

  clearPendingEntry(mint: string): void {
    this.pendingEntries.delete(mint);
  }

  getPendingMints(): string[] {
    return [...this.pendingEntries.keys()];
  }
}
