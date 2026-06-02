/** Exfer genesis block ID */
export const GENESIS_BLOCK_ID =
  'd7b6805c8fd793703db88102b5aed2600af510b79e3cb340ca72c1f762d1e051'

/** 1 EXFER = 100,000,000 exfers (base units) */
export const EXFERS_PER_EXFER = 100_000_000n

/** Dust threshold in exfers */
export const DUST_THRESHOLD = 200n

/**
 * Absolute minimum fee for a standard 1-in 2-out transaction (88 exfers).
 * Derived from the Exfer consensus cost formula (cost.rs).
 */
export const MIN_FEE = 88n

/**
 * Default transaction fee in exfers.
 * Matches the "average" tier on the network (MIN_FEE × 10 = 880 exfers).
 * Previously 100_000 — corrected to reflect real network costs.
 */
export const DEFAULT_FEE = MIN_FEE * 10n   // 880 exfers ≈ 0.0000088 EXFER

/** Block reward formula constants */
export const REWARD_BASE      = 1n * EXFERS_PER_EXFER        // 1 EXFER
export const REWARD_DECAY     = 99n * EXFERS_PER_EXFER       // 99 EXFER
export const REWARD_HALF_LIFE = 6_307_200                     // blocks (~2 years)
