// Neon Harbor — rng.js
// One job: a small seeded random generator (mulberry32) plus helpers, so
// the city layout, traffic and pedestrians are deterministic per seed.
// No Math.random() is used anywhere in the game.
(function (global) {
  'use strict';

  var NH = global.NH || (global.NH = {});

  // mulberry32: tiny, fast, deterministic.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function SeededRng(seed) {
    this.next = mulberry32(seed);
  }

  SeededRng.prototype.float = function (min, max) {
    if (max === undefined) { max = min; min = 0; }
    return min + this.next() * (max - min);
  };

  SeededRng.prototype.int = function (min, max) {
    return Math.floor(this.float(min, max + 1));
  };

  SeededRng.prototype.pick = function (arr) {
    return arr[Math.floor(this.next() * arr.length)];
  };

  SeededRng.prototype.chance = function (p) {
    return this.next() < p;
  };

  SeededRng.prototype.shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(this.next() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  NH.SeededRng = SeededRng;
  NH.mulberry32 = mulberry32;
})(typeof window !== 'undefined' ? window : globalThis);
