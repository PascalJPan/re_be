export function initWigglyBackground() {
  const canvas = document.getElementById('wiggly-bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const curves = [
    { color: '#d4c8b8', speed: 0.0003, yOffset: 0.2, amp: 40, freq: 0.003, phase: 0 },
    { color: '#c9b8a7', speed: 0.0005, yOffset: 0.35, amp: 35, freq: 0.004, phase: 1.2 },
    { color: '#d0c4b0', speed: 0.0004, yOffset: 0.5, amp: 45, freq: 0.0025, phase: 2.5 },
    { color: '#c4b8a8', speed: 0.0007, yOffset: 0.65, amp: 30, freq: 0.0035, phase: 3.8 },
    { color: '#d8ccbc', speed: 0.0003, yOffset: 0.8, amp: 38, freq: 0.003, phase: 5.1 },
  ];

  let time = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width;
    const h = canvas.height;

    for (const c of curves) {
      c.phase += c.speed;
      ctx.beginPath();
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 1.5;

      for (let x = 0; x <= w; x += 3) {
        const baseY = h * c.yOffset;
        const y = baseY
          + Math.sin(x * c.freq + c.phase) * c.amp
          + Math.sin(x * c.freq * 0.6 + c.phase * 1.3) * (c.amp * 0.4)
          + Math.sin(x * c.freq * 1.8 + c.phase * 0.7) * (c.amp * 0.2);

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    time++;
    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
}
