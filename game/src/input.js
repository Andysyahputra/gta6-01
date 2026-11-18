// Keyboard + mouse input, with edge-triggered "pressed" state for one-shot actions.
export class Input {
  constructor(canvas) {
    this.keys = {};
    this.pressed = {};
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys[k] = true;
      this.pressed[k] = true;
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys[k] = false;
    });
    window.addEventListener('blur', () => { this.keys = {}; });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
  }

  down(k) { return !!this.keys[k]; }
  wasPressed(k) { return !!this.pressed[k]; }
  // Axis helpers: WASD or arrows.
  axis() {
    let x = 0, y = 0;
    if (this.down('a') || this.down('ArrowLeft')) x -= 1;
    if (this.down('d') || this.down('ArrowRight')) x += 1;
    if (this.down('w') || this.down('ArrowUp')) y -= 1;
    if (this.down('s') || this.down('ArrowDown')) y += 1;
    return { x, y };
  }
  endFrame() { this.pressed = {}; this.mouse.clicked = false; }
}
