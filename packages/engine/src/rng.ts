/**
 * Deterministic mulberry32 generator. Its whole state is a single uint32 stored in
 * GameState, so the server can replay any client action and get identical draws.
 * (Card trade-ups in phase 6 must use a secure server RNG instead.)
 */
export class Rng {
  constructor(public seed: number) {}

  next(): number {
    this.seed = (this.seed + 0x6d2b79f5) >>> 0;
    let r = Math.imul(this.seed ^ (this.seed >>> 15), this.seed | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  pick<T>(list: readonly T[]): T {
    if (list.length === 0) throw new Error('Cannot pick from an empty list');
    return list[this.int(list.length)] as T;
  }

  pickWeighted<T extends { weight: number }>(list: readonly T[]): T {
    const total = list.reduce((sum, e) => sum + e.weight, 0);
    let roll = this.next() * total;
    for (const entry of list) {
      roll -= entry.weight;
      if (roll < 0) return entry;
    }
    return list[list.length - 1] as T;
  }
}
