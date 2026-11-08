/**
 * Mainnet program registry for October 2026 research.
 * The Pump bonding-curve scan includes token creation plus buy/sell instruction
 * families. Other DEX scans intentionally include all instructions so pool
 * creation, liquidity changes, migration-adjacent activity and swaps survive
 * the first lifecycle research pass.
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
    instructions: ["create", "create_v2", "buy", "buy_exact_sol_in", "buy_v2", "buy_exact_quote_in_v2", "sell", "sell_v2"],
    market: "bonding_curve"
  },
  {
    name: "pump_swap",
    programId: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    market: "migrated_or_routed"
  },
  {
    name: "raydium_amm_v4",
    programId: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    market: "migrated_or_routed"
  },
  {
    name: "raydium_cpmm",
    programId: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
    market: "migrated_or_routed"
  },
  {
    name: "raydium_clmm",
    programId: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
    market: "migrated_or_routed"
  },
  {
    name: "meteora_dlmm",
    programId: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    market: "migrated_or_routed"
  },
  {
    name: "meteora_damm_v1",
    programId: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
    market: "migrated_or_routed"
  },
  {
    name: "meteora_damm_v2",
    programId: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
    market: "migrated_or_routed"
  },
  {
    name: "jupiter_v6_router",
    programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    instructions: ["route", "shared_accounts_route", "route_v2", "shared_accounts_route_v2"],
    market: "migrated_or_routed"
  }
];
