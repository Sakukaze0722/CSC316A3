// ============================================================
// Hero Landing — Aurora Neon blobs + animations
// ============================================================
(function () {
  "use strict";

  const canvas = document.getElementById("hero-canvas");
  const ctx = canvas.getContext("2d");
  let W = 0;
  let H = 0;
  let blobs = [];
  let animId = null;
  let mouse = { x: -10000, y: -10000 };

  const COLORS = ["#58a6ff", "#4ade80", "#fb923c", "#c084fc"];

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  }

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createBlobs() {
    blobs = [];
    const count = Math.min(12, Math.max(8, Math.round((W * H) / 200000)));
    for (let i = 0; i < count; i++) {
      blobs.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        radius: 80 + Math.random() * 120,
        alpha: 0.1 + Math.random() * 0.1,
        phase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.3 + Math.random() * 0.45,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }
  }

  function drawBlobs() {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "screen";

    const now = performance.now() * 0.001;
    blobs.forEach((b) => {
      // Subtle mouse response for depth.
      const dx = mouse.x - b.x;
      const dy = mouse.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 260) {
        b.vx += (dx / (d || 1)) * 0.003;
        b.vy += (dy / (d || 1)) * 0.003;
      }

      b.x += b.vx;
      b.y += b.vy;
      b.vx *= 0.995;
      b.vy *= 0.995;

      if (b.x < -220) b.x = W + 220;
      if (b.x > W + 220) b.x = -220;
      if (b.y < -220) b.y = H + 220;
      if (b.y > H + 220) b.y = -220;

      const pulse = 1 + Math.sin(now * b.pulseSpeed + b.phase) * 0.08;
      const r = b.radius * pulse;
      const [cr, cg, cb] = hexToRgb(b.color);
      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},${b.alpha})`);
      grad.addColorStop(0.55, `rgba(${cr},${cg},${cb},${b.alpha * 0.45})`);
      grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalCompositeOperation = "source-over";
    animId = requestAnimationFrame(drawBlobs);
  }

  function animateCounters() {
    document.querySelectorAll(".stat-num").forEach((el) => {
      const target = parseInt(el.dataset.target, 10);
      const duration = 1500;
      const start = performance.now();

      function tick(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * eased);
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  function animateHeroText() {
    const lines = document.querySelectorAll(".hero-line");
    lines.forEach((line, i) => {
      setTimeout(() => line.classList.add("visible"), 300 + i * 200);
    });

    setTimeout(() => {
      document.querySelector(".hero-tag").classList.add("visible");
    }, 100);

    setTimeout(() => {
      document.querySelector(".hero-sub").classList.add("visible");
    }, 800);

    setTimeout(() => {
      document.querySelector(".hero-stats").classList.add("visible");
      animateCounters();
    }, 1100);

    setTimeout(() => {
      document.getElementById("hero-cta").classList.add("visible");
    }, 1500);

    setTimeout(() => {
      document.querySelector(".scroll-hint").classList.add("visible");
    }, 2000);
  }

  document.getElementById("hero").addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  document.getElementById("hero-cta").addEventListener("click", () => {
    document.getElementById("app").scrollIntoView({ behavior: "smooth" });
  });

  resize();
  createBlobs();
  drawBlobs();
  animateHeroText();

  window.addEventListener("resize", () => {
    resize();
    createBlobs();
  });

  const heroSection = document.getElementById("hero");
  const heroObserver = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) {
        cancelAnimationFrame(animId);
        animId = null;
      } else if (!animId) {
        drawBlobs();
      }
    },
    { threshold: 0 }
  );
  heroObserver.observe(heroSection);
})();
