// Neon Harbor — keyboard and mouse input with edge detection (justPressed).
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since last poll
    this.mouseX = 0; this.mouseY = 0;
    this.mouseDown = false;
    this.clicked = false; // mouse click since last poll
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (!e.repeat) { this.keys.add(e.key.toLowerCase()); this.pressed.add(e.key.toLowerCase()); }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left; this.mouseY = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseDown = true; this.clicked = true; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
  }
  down(...names) { return names.some((n) => this.keys.has(n)); }
  justPressed(...names) { return names.some((n) => this.pressed.has(n)); }
  endFrame() { this.pressed.clear(); this.clicked = false; }
  // WASD / arrows movement vector, normalised.
  moveVector() {
    let x = 0, y = 0;
    if (this.down('a', 'arrowleft')) x -= 1;
    if (this.down('d', 'arrowright')) x += 1;
    if (this.down('w', 'arrowup')) y -= 1;
    if (this.down('s', 'arrowdown')) y += 1;
    if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  }
}
