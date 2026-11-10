import test from "node:test";
import assert from "node:assert/strict";
import { AdaptiveExitManager } from "./adaptive-exit-manager.js";
const bar = (t: number, o: number, h: number, l: number, c: number) =>
  ({ timestampMs: t, open: o, high: h, low: l, close: c });
test("keeps the initial 5% hard stop active before trail activation", () => {
  const m = new AdaptiveExitManager(100, 0);
  const d = m.onBar(bar(1_000, 100, 102, 94, 96));
  assert.equal(d.action, "sell");
  assert.equal(d.reason, "hard_stop");
  assert.equal(d.exitPrice, 95);
});
test("locks +5% gross after a prior completed bar reaches +10%", () => {
  const m = new AdaptiveExitManager(100, 0);
  assert.equal(m.onBar(bar(1_000, 100, 111, 101, 108)).action, "hold");
  const d = m.onBar(bar(2_000, 108, 109, 104, 106));
  assert.equal(d.action, "sell");
  assert.equal(d.reason, "profit_floor");
  assert.equal(d.exitPrice, 105);
});
test("wide 40% trail gives a runner room before exiting", () => {
  const m = new AdaptiveExitManager(100, 0);
  assert.equal(m.onBar(bar(1_000, 100, 150, 130, 145)).action, "hold");
  assert.equal(m.onBar(bar(2_000, 145, 146, 100, 110)).action, "hold");
  const d = m.onBar(bar(3_000, 110, 112, 89, 95));
  assert.equal(d.action, "sell");
  assert.equal(d.reason, "trailing_stop");
  assert.equal(d.exitPrice, 90);
});
test("300 seconds is a ceiling, not an automatic 60-second exit", () => {
  const m = new AdaptiveExitManager(100, 0);
  assert.equal(m.onBar(bar(60_000, 100, 102, 99, 101)).action, "hold");
  const d = m.onBar(bar(300_000, 101, 102, 100, 101));
  assert.equal(d.action, "sell");
  assert.equal(d.reason, "max_hold");
});
test("migration forces an exit and bars must be chronological", () => {
  const m = new AdaptiveExitManager(100, 0);
  assert.throws(() => m.onBar(bar(0, 100, 100, 100, 100)), /chronological/);
  const d = m.onBar(bar(1_000, 100, 101, 99, 100), true);
  assert.equal(d.action, "sell");
  assert.equal(d.reason, "migration");
});
