// Neon Harbor — keyboard + mouse input. One job: track what is held,
// what was just pressed, and where the mouse points in world space.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseX = 0; this.mouseY = 0;
    this.mouseDown = false;
    this.mousePressed = false;
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouseY = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true; this.mousePressed = true;
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouseY = (e.clientY - r.top) * (canvas.height / r.height);
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
  }
  down(...names) { return names.some((n) => this.keys.has(n)); }
  wasPressed(...names) { return names.some((n) => this.pressed.has(n)); }
  endFrame() { this.pressed.clear(); this.mousePressed = false; }
}
