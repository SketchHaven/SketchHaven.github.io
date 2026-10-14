/* Sketch Haven — shared behaviour (nav, typing, reveal, lightbox, forms) */
(function () {
  "use strict";

  /* ---------- Mobile navigation ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var menu = document.getElementById("nav-menu");
  if (toggle && menu) {
    function setMenu(open) {
      menu.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
    toggle.addEventListener("click", function () {
      setMenu(toggle.getAttribute("aria-expanded") !== "true");
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("open")) {
        setMenu(false);
        toggle.focus();
      }
    });
    document.addEventListener("click", function (e) {
      if (!menu.classList.contains("open")) return;
      if (!menu.contains(e.target) && !toggle.contains(e.target)) setMenu(false);
    });
  }

  /* ---------- Footer year ---------- */
  var yr = document.getElementById("year");
  if (yr) yr.textContent = new Date().getFullYear();

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Typing effect (home) ---------- */
  var typing = document.querySelector("[data-typing]");
  if (typing) {
    var text = typing.getAttribute("data-typing");
    if (reduceMotion) {
      typing.textContent = text;
    } else {
      var i = 0;
      typing.textContent = "";
      (function tick() {
        typing.textContent = text.slice(0, ++i);
        if (i < text.length) setTimeout(tick, 45);
      })();
    }
  }

  /* ---------- Scroll reveal ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if (reveals.length) {
    if ("IntersectionObserver" in window && !reduceMotion) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
        });
      }, { threshold: 0.12 });
      reveals.forEach(function (el) { io.observe(el); });
    } else {
      reveals.forEach(function (el) { el.classList.add("in"); });
    }
  }

  /* ---------- Gallery lightbox ---------- */
  var items = Array.prototype.slice.call(document.querySelectorAll(".gallery-item"));
  if (items.length) {
    var lb = document.createElement("div");
    lb.className = "lightbox";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb.setAttribute("aria-label", "Artwork viewer");
    lb.innerHTML =
      '<button class="lb-btn lb-close" aria-label="Close viewer">&times;</button>' +
      '<button class="lb-btn lb-prev" aria-label="Previous artwork">&#8249;</button>' +
      '<figure><img alt=""><figcaption></figcaption></figure>' +
      '<button class="lb-btn lb-next" aria-label="Next artwork">&#8250;</button>';
    document.body.appendChild(lb);

    var lbImg = lb.querySelector("img");
    var lbCap = lb.querySelector("figcaption");
    var btnClose = lb.querySelector(".lb-close");
    var btnPrev = lb.querySelector(".lb-prev");
    var btnNext = lb.querySelector(".lb-next");
    var current = 0;
    var lastFocus = null;

    function show(n) {
      current = (n + items.length) % items.length;
      var it = items[current];
      lbImg.src = it.getAttribute("data-full");
      lbImg.alt = it.getAttribute("data-alt") || "";
      lbCap.textContent = (current + 1) + " / " + items.length + " — " + (it.getAttribute("data-alt") || "");
      // preload neighbours
      [current + 1, current - 1].forEach(function (k) {
        var p = new Image();
        p.src = items[(k + items.length) % items.length].getAttribute("data-full");
      });
    }
    function open(n) {
      lastFocus = document.activeElement;
      show(n);
      lb.classList.add("open");
      document.body.style.overflow = "hidden";
      btnClose.focus();
    }
    function close() {
      lb.classList.remove("open");
      document.body.style.overflow = "";
      lbImg.removeAttribute("src");
      if (lastFocus) lastFocus.focus();
    }

    items.forEach(function (it, idx) {
      it.addEventListener("click", function () { open(idx); });
    });
    btnClose.addEventListener("click", close);
    btnPrev.addEventListener("click", function () { show(current - 1); });
    btnNext.addEventListener("click", function () { show(current + 1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) close(); });

    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") show(current - 1);
      else if (e.key === "ArrowRight") show(current + 1);
      else if (e.key === "Tab") {
        // keep focus inside the dialog
        var f = [btnClose, btnPrev, btnNext];
        var idx = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(idx + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    });

    // swipe on touch screens
    var startX = null;
    lb.addEventListener("touchstart", function (e) { startX = e.changedTouches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
      startX = null;
    }, { passive: true });
  }

  /* ---------- Forms ---------- */
  var MAX_FILE = 5 * 1024 * 1024; // FormSubmit's attachment limit is 5 MB
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function setError(field, msg) {
    var wrap = field.closest(".field");
    if (!wrap) return;
    var out = wrap.querySelector(".error-msg");
    wrap.classList.toggle("invalid", !!msg);
    field.setAttribute("aria-invalid", msg ? "true" : "false");
    if (out) out.textContent = msg || "";
  }

  function validateField(field) {
    var v = (field.value || "").trim();
    if (field.type === "checkbox") {
      setError(field, field.checked ? "" : field.getAttribute("data-error") || "This is required.");
      return field.checked;
    }
    if (field.type === "file") {
      var file = field.files && field.files[0];
      if (field.required && !file) { setError(field, "Please add a reference photo."); return false; }
      if (file) {
        if (!/^image\//.test(file.type)) { setError(field, "Please choose an image file (JPG, PNG, WebP…)."); return false; }
        if (file.size > MAX_FILE) { setError(field, "That image is over 5 MB. Please choose a smaller one."); return false; }
      }
      setError(field, ""); return true;
    }
    if (field.required && !v) { setError(field, "This field is required."); return false; }
    if (field.type === "email" && v && !EMAIL_RE.test(v)) { setError(field, "Please enter a valid email address."); return false; }
    if (field.minLength > 0 && v && v.length < field.minLength) { setError(field, "Please write at least " + field.minLength + " characters."); return false; }
    setError(field, ""); return true;
  }

  document.querySelectorAll("form[data-validate]").forEach(function (form) {
    var fields = Array.prototype.slice.call(form.querySelectorAll("input:not([type=hidden]), select, textarea"))
      .filter(function (f) { return f.name && f.name.charAt(0) !== "_"; });

    fields.forEach(function (f) {
      f.addEventListener("blur", function () { if (f.type !== "file") validateField(f); });
      f.addEventListener("input", function () { if (f.closest(".field").classList.contains("invalid")) validateField(f); });
      f.addEventListener("change", function () { validateField(f); });
    });

    form.addEventListener("submit", function (e) {
      var firstBad = null;
      fields.forEach(function (f) { if (!validateField(f) && !firstBad) firstBad = f; });
      if (firstBad) {
        e.preventDefault();
        firstBad.focus();
        var box = form.querySelector(".form-notice");
        if (box) { box.hidden = false; box.textContent = "Please fix the highlighted fields and try again."; }
        return;
      }
      var btn = form.querySelector("button[type=submit]");
      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    });
  });

  /* ---------- Reference-photo picker with preview + drag & drop ---------- */
  var dz = document.querySelector(".dropzone");
  if (dz) {
    var input = dz.querySelector("input[type=file]");
    var body = dz.querySelector(".dz-body");
    var removeBtn = document.querySelector(".remove-file");
    var defaultHTML = body.innerHTML;

    function render() {
      var file = input.files && input.files[0];
      if (!file || !/^image\//.test(file.type)) {
        body.innerHTML = defaultHTML;
        if (removeBtn) removeBtn.hidden = true;
        return;
      }
      var url = URL.createObjectURL(file);
      body.innerHTML = "";
      var img = document.createElement("img");
      img.className = "preview";
      img.alt = "Preview of your reference photo";
      img.src = url;
      img.onload = function () { URL.revokeObjectURL(url); };
      var name = document.createElement("span");
      name.textContent = file.name + " (" + (file.size / 1048576).toFixed(1) + " MB)";
      body.appendChild(img);
      body.appendChild(name);
      if (removeBtn) removeBtn.hidden = false;
    }

    input.addEventListener("change", render);
    if (removeBtn) removeBtn.addEventListener("click", function () {
      input.value = "";
      render();
      validateField(input);
    });
    ["dragenter", "dragover"].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("drag"); });
    });
    dz.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files.length) {
        input.files = e.dataTransfer.files;
        render();
        validateField(input);
      }
    });
  }
})();
