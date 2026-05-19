/** Exfer genesis block ID */
export const GENESIS_BLOCK_ID =
  'd7b6805c8fd793703db88102b5aed2600af510b79e3cb340ca72c1f762d1e051'

/** 1 EXFER = 100,000,000 exfers (base units) */
export const EXFERS_PER_EXFER = 100_000_000n

/** Dust threshold in exfers */
export const DUST_THRESHOLD = 200n

/** Default transaction fee in exfers (0.001 EXFER) */
export const DEFAULT_FEE = 100_000n

/** Block reward formula constants */
export const REWARD_BASE      = 1n * EXFERS_PER_EXFER        // 1 EXFER
export const REWARD_DECAY     = 99n * EXFERS_PER_EXFER       // 99 EXFER
export const REWARD_HALF_LIFE = 6_307_200                     // blocks (~2 years)
