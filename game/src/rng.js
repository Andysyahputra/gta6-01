// Neon Harbor — deterministic seeded random number generator.
// The city layout, traffic and pedestrians all draw from seeded streams,
// so a run is reproducible. No Math.random() is used for layout.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededRandom {
  constructor(seed) { this.next = mulberry32(seed); }
  float(min = 0, max = 1) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(this.float(min, max + 1)); }
  pick(list) { return list[Math.floor(this.next() * list.length)]; }
  chance(p) { return this.next() < p; }
}
