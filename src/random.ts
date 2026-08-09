export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state += 0x6d2b79f5;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  chance(probability: number): boolean {
    const bounded = Math.max(0, Math.min(1, probability));
    return this.next() < bounded;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty collection");
    }
    const index = Math.min(items.length - 1, Math.floor(this.next() * items.length));
    return items[index] as T;
  }
}
