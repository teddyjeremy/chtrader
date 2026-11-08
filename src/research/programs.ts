/**
 * Mainnet program registry used by the October 2026 research collector.
 * Pump IDs are documented by Helius/Pump docs. Jupiter captures routed swaps
 * that may execute against multiple underlying DEXs; the parsed inner
 * instructions identify the actual venue where available.
 */
export type ProgramTarget = {
  name: string;
  programId: string;
  instructions?: string[];
  market: "bonding_curve" | "migrated_or_routed";
};

export const PROGRAMS: ProgramTarget[] = [
  {
    name: "pump_bonding_curve",
    programId: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    instructions: [
      "buy", "buy_exact_sol_in", "buy_v2", "buy_exact_quote_in_v2",
      "sell", "sell_v2"
    ],
    market: "bonding_curve"
  },
  {
    name: "pump_swap",
    programId: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    instructions: [
      "buy", "buy_exact_quote_in", "sell", "sell_exact_base_in"
    ],
    market: "migrated_or_routed"
  },
  {
    name: "jupiter_v6_router",
    programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    instructions: [
      "route", "shared_accounts_route", "route_v2", "shared_accounts_route_v2"
    ],
    market: "migrated_or_routed"
  }
];
