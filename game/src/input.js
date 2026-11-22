// Neon Harbor — input.js
// One job: keyboard + mouse state, edge-triggered presses, and the
// debug/shot query params. The game reads only this module for input.
(function (global) {
  'use strict';

  var NH = global.NH || (global.NH = {});

  function Input(canvas) {
    this.keys = {};
    this.pressed = {};
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.canvas = canvas;
    var self = this;

    global.addEventListener('keydown', function (e) {
      var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].indexOf(e.key) >= 0) e.preventDefault();
      if (!self.keys[k]) self.pressed[k] = true;
      self.keys[k] = true;
    });
    global.addEventListener('keyup', function (e) {
      var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      self.keys[k] = false;
    });
    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      self.mouseX = e.clientX - r.left;
      self.mouseY = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', function (e) {
      self.mouseDown = true;
      self.mouseClicked = true;
      var r = canvas.getBoundingClientRect();
      self.mouseX = e.clientX - r.left;
      self.mouseY = e.clientY - r.top;
    });
    global.addEventListener('mouseup', function () { self.mouseDown = false; });
    global.addEventListener('blur', function () { self.keys = {}; });
  }

  Input.prototype.down = function () {
    for (var i = 0; i < arguments.length; i++) {
      if (this.keys[arguments[i]]) return true;
    }
    return false;
  };

  Input.prototype.wasPressed = function () {
    for (var i = 0; i < arguments.length; i++) {
      if (this.pressed[arguments[i]]) return true;
    }
    return false;
  };

  // Movement axes: -1..1 for on-foot and driving.
  Input.prototype.moveX = function () {
    return (this.down('d', 'ArrowRight') ? 1 : 0) - (this.down('a', 'ArrowLeft') ? 1 : 0);
  };

  Input.prototype.moveY = function () {
    return (this.down('s', 'ArrowDown') ? 1 : 0) - (this.down('w', 'ArrowUp') ? 1 : 0);
  };

  Input.prototype.endFrame = function () {
    this.pressed = {};
    this.mouseClicked = false;
  };

  // ?shot=start|drive|chase|mission&seed=N — used by the screenshot run
  // to jump the game straight into a real state.
  Input.queryParams = function () {
    var out = {};
    var q = global.location ? global.location.search.replace(/^\?/, '') : '';
    if (!q) return out;
    var pairs = q.split('&');
    for (var i = 0; i < pairs.length; i++) {
      var kv = pairs[i].split('=');
      if (kv[0]) out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    }
    return out;
  };

  NH.Input = Input;
})(typeof window !== 'undefined' ? window : globalThis);
