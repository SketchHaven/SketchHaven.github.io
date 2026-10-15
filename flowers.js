/* Sketch Haven — home page flower animation.
   1) Line-art flowers that "draw themselves" in the hero, then sway.
   2) Soft petals drifting down the page background. */
(function () {
  "use strict";
  var host = document.querySelector(".hero-flora");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Line-art flowers ---------- */
  // Every flower lives in a 200 x 360 box; the base is at the bottom, the bloom centre at (100, 100).
  function leaf(d) { return '<path class="fill leaf" d="' + d + '"/><path class="d" pathLength="1" d="' + d + '"/>'; }
  function stemAndLeaves(delay) {
    var stem = "M100 352 C 88 290 116 220 100 104";
    return '<path class="d" pathLength="1" d="' + stem + '" style="--delay:' + delay + 's"/>' +
      '<g style="--delay:' + (delay + 0.5) + 's">' +
      leaf("M97 286 C 58 276 38 246 34 220 C 70 222 92 246 97 286 Z") +
      leaf("M105 232 C 142 226 166 200 170 176 C 134 178 110 200 105 232 Z") +
      "</g>";
  }
  function petals(path, n, delay) {
    var out = "";
    for (var i = 0; i < n; i++) {
      var a = Math.round((360 / n) * i);
      var t = 'transform="translate(100 100) rotate(' + a + ')"';
      out += '<path class="fill petal" ' + t + ' d="' + path + '"/>';
    }
    out += '<g style="--delay:' + delay + 's">';
    for (var j = 0; j < n; j++) {
      var b = Math.round((360 / n) * j);
      out += '<path class="d" pathLength="1" transform="translate(100 100) rotate(' + b + ')" d="' + path + '"/>';
    }
    return out + "</g>";
  }
  function core(r, delay) {
    var d = "M-" + r + " 0 a" + r + " " + r + " 0 1 0 " + 2 * r + " 0 a" + r + " " + r + " 0 1 0 -" + 2 * r + " 0";
    return '<g transform="translate(100 100)" style="--delay:' + delay + 's"><path class="fill core" d="' + d + '"/><path class="d" pathLength="1" d="' + d + '"/></g>';
  }
  var BLOOMS = {
    daisy: function (delay) {
      return petals("M0 -14 C -9 -30 -9 -64 0 -78 C 9 -64 9 -30 0 -14 Z", 12, delay) + core(13, delay + 1.4);
    },
    bloom: function (delay) {
      return petals("M0 -10 C -28 -22 -32 -60 0 -68 C 32 -60 28 -22 0 -10 Z", 5, delay) + core(10, delay + 1.4);
    },
    tulip: function (delay) {
      var mid = "M-22 -2 C -30 -40 -14 -76 0 -94 C 14 -76 30 -40 22 -2 C 10 8 -10 8 -22 -2 Z";
      var left = "M-22 -2 C -44 -34 -38 -72 -16 -86 C -14 -52 -10 -26 -2 -4 Z";
      var right = "M22 -2 C 44 -34 38 -72 16 -86 C 14 -52 10 -26 2 -4 Z";
      var all = [left, right, mid], out = "", i;
      for (i = 0; i < all.length; i++) out += '<path class="fill petal" transform="translate(100 100)" d="' + all[i] + '"/>';
      out += '<g style="--delay:' + delay + 's">';
      for (i = 0; i < all.length; i++) out += '<path class="d" pathLength="1" transform="translate(100 100)" d="' + all[i] + '"/>';
      return out + "</g>";
    }
  };
  var SPECS = [
    { cls: "fl-1", type: "daisy", pc: "#fff3c4", cc: "#f2b84b", delay: 0.2, sway: "0s" },
    { cls: "fl-2", type: "bloom", pc: "#fbe4ea", cc: "#f7d774", delay: 1.0, sway: "-2s" },
    { cls: "fl-3", type: "tulip", pc: "#f9d3dc", cc: "#f7d774", delay: 0.6, sway: "-4s" },
    { cls: "fl-4", type: "daisy", pc: "#e3eefc", cc: "#f7d774", delay: 1.5, sway: "-1s" },
    { cls: "fl-5", type: "bloom", pc: "#eadcf6", cc: "#f7d774", delay: 2.0, sway: "-3s" }
  ];

  if (host) {
    var html = "";
    SPECS.forEach(function (s) {
      html += '<svg class="flower ' + s.cls + '" viewBox="0 0 200 360" style="--pc:' + s.pc + ";--cc:" + s.cc + ";--sway:" + s.sway + '" xmlns="http://www.w3.org/2000/svg">' +
        stemAndLeaves(s.delay) + BLOOMS[s.type](s.delay + 1.0) + "</svg>";
    });
    host.innerHTML = html;
  }

  /* ---------- Drifting petals (canvas) ---------- */
  var canvas = document.getElementById("petals");
  if (!canvas || reduce || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var COLORS = ["#f4b6c2", "#f9d5c7", "#fbe3a9", "#cfe0f8", "#e4cdf0", "#f7c6d3"];
  var W = 0, H = 0, dpr = 1, petalsArr = [], raf = 0, last = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var want = W < 700 ? 12 : Math.min(30, Math.round(W / 55));
    while (petalsArr.length < want) petalsArr.push(make(true));
    if (petalsArr.length > want) petalsArr.length = want;
  }
  function make(anywhere) {
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : -20 - Math.random() * 60,
      s: 5 + Math.random() * 7,
      vy: 18 + Math.random() * 28,       // px per second
      sway: 18 + Math.random() * 34,
      ph: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 1.6,
      flip: Math.random() * Math.PI * 2,
      c: COLORS[(Math.random() * COLORS.length) | 0],
      a: 0.5 + Math.random() * 0.35
    };
  }
  function draw(p) {
    var sx = Math.abs(Math.cos(p.flip)) * 0.8 + 0.2;
    ctx.save();
    ctx.translate(p.x + Math.sin(p.ph) * p.sway, p.y);
    ctx.rotate(p.rot);
    ctx.scale(sx, 1);
    ctx.globalAlpha = p.a;
    ctx.fillStyle = p.c;
    var s = p.s;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.9, -s * 0.6, s * 0.7, s * 0.6, 0, s);
    ctx.bezierCurveTo(-s * 0.7, s * 0.6, -s * 0.9, -s * 0.6, 0, -s);
    ctx.fill();
    ctx.restore();
  }
  function frame(t) {
    var dt = Math.min((t - last) / 1000, 0.05) || 0.016;
    last = t;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < petalsArr.length; i++) {
      var p = petalsArr[i];
      p.y += p.vy * dt; p.ph += dt * 0.9; p.rot += p.vr * dt; p.flip += dt * 1.6;
      if (p.y > H + 30) petalsArr[i] = make(false);
      draw(p);
    }
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  resize();
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
  start();
})();
