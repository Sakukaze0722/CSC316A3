// ============================================================
// Hero Landing — Particle canvas + animations
// ============================================================
(function () {
  "use strict";

  const canvas = document.getElementById("hero-canvas");
  const ctx = canvas.getContext("2d");
  let W, H;
  let particles = [];
  let mouse = { x: -1000, y: -1000 };
  let animId;

  // Colors: warm (fossil) → cool (renewable) palette
  const COLORS = [
    "#e65100", "#ff8f00", "#f4511e", // warm
    "#0288d1", "#43a047", "#26a69a", // cool
    "#7b1fa2", "#5d4037",            // accent
  ];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createParticles() {
    particles = [];
    const count = Math.floor((W * H) / 6000);
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        r: Math.random() * 2.5 + 1,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        alpha: Math.random() * 0.5 + 0.2,
        pulse: Math.random() * Math.PI * 2,
      });
    }
  }

  function drawParticles() {
    ctx.clearRect(0, 0, W, H);

    // Connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(100,140,180,${0.12 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    // Particles
    const time = Date.now() * 0.002;
    particles.forEach((p) => {
      // Mouse repulsion
      const dmx = p.x - mouse.x;
      const dmy = p.y - mouse.y;
      const dm = Math.sqrt(dmx * dmx + dmy * dmy);
      if (dm < 150) {
        const force = (150 - dm) / 150 * 0.8;
        p.vx += (dmx / dm) * force;
        p.vy += (dmy / dm) * force;
      }

      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.99;
      p.vy *= 0.99;

      // Wrap around edges
      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10;
      if (p.y > H + 10) p.y = -10;

      // Pulsing glow
      const pulseAlpha = p.alpha + Math.sin(time + p.pulse) * 0.15;

      // Glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace(")", `,${pulseAlpha * 0.15})`).replace("rgb", "rgba").replace("#", "");
      // Use hex-to-rgba for glow
      const [gr, gg, gb] = hexToRgb(p.color);
      ctx.fillStyle = `rgba(${gr},${gg},${gb},${pulseAlpha * 0.15})`;
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${gr},${gg},${gb},${pulseAlpha})`;
      ctx.fill();
    });

    animId = requestAnimationFrame(drawParticles);
  }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  }

  // Mouse tracking
  document.getElementById("hero").addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  // Counter animation
  function animateCounters() {
    document.querySelectorAll(".stat-num").forEach((el) => {
      const target = parseInt(el.dataset.target);
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

  // Stagger text lines
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

  // CTA click → smooth scroll to app
  document.getElementById("hero-cta").addEventListener("click", () => {
    document.getElementById("app").scrollIntoView({ behavior: "smooth" });
  });

  // Init
  resize();
  createParticles();
  drawParticles();
  animateHeroText();

  window.addEventListener("resize", () => {
    resize();
    createParticles();
  });

  // Stop animation when hero is out of view
  const heroSection = document.getElementById("hero");
  const heroObserver = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) {
        cancelAnimationFrame(animId);
      } else {
        drawParticles();
      }
    },
    { threshold: 0 }
  );
  heroObserver.observe(heroSection);
})();
