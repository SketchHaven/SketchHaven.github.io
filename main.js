/* Sketch Haven — public site script (v2)
   Content (gallery, prices, settings) is read from data/site.json, which the admin dashboard edits.
   Every page also ships with static fallback content, so it still works if the file can't load. */
(function () {
  "use strict";

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "text") e.textContent = v;
        else if (k === "class") e.className = v;
        else e.setAttribute(k, v === true ? "" : v);
      });
    }
    (kids || []).forEach(function (c) { e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function money(n) { return "₹" + Number(n).toLocaleString("en-IN"); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // Only allow real Instagram / YouTube links coming from the data file.
  function safeSocial(url, kind) {
    try {
      var u = new URL(url);
      if (u.protocol !== "https:") return null;
      var host = u.hostname.replace(/^www\./, "");
      var ok = kind === "instagram" ? host === "instagram.com" : (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com");
      return ok ? u.href : null;
    } catch (e) { return null; }
  }
  function handleOf(url) {
    try {
      var seg = new URL(url).pathname.split("/").filter(Boolean)[0] || "";
      return seg ? "@" + seg.replace(/^@/, "") : "";
    } catch (e) { return ""; }
  }

  /* ---------- Mobile navigation ---------- */
  var toggle = $(".nav-toggle");
  var menu = $("#nav-menu");
  if (toggle && menu) {
    var setMenu = function (open) {
      menu.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    toggle.addEventListener("click", function () { setMenu(toggle.getAttribute("aria-expanded") !== "true"); });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("open")) { setMenu(false); toggle.focus(); }
    });
    document.addEventListener("click", function (e) {
      if (menu.classList.contains("open") && !menu.contains(e.target) && !toggle.contains(e.target)) setMenu(false);
    });
  }

  // The site was first made in 2023, so the footer shows a range: 2023–<this year>.
  var yr = $("#year");
  if (yr) { var now = new Date().getFullYear(); yr.textContent = now > 2023 ? "2023\u2013" + now : "2023"; }

  /* ---------- Scroll reveal ---------- */
  var io = null;
  if ("IntersectionObserver" in window && !reduceMotion) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.1 });
  }
  function observeReveals() {
    $$(".reveal:not(.in)").forEach(function (el) { if (io) io.observe(el); else el.classList.add("in"); });
  }
  observeReveals();

  /* ---------- Typing effect (home) ---------- */
  var typingEl = $("[data-typing]");
  function startTyping(text) {
    if (!typingEl) return;
    typingEl.setAttribute("data-typing", text);
    typingEl.textContent = text;                 // the real heading text is always in the page
    typingEl.style.setProperty("--n", String(Math.max(1, text.length)));
    typingEl.style.animation = "none";           // restart the CSS reveal
    void typingEl.offsetWidth;
    typingEl.style.animation = "";
  }

  /* ---------- Site data ---------- */
  var DATA = null;
  var dataReady = fetch("data/site.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (d) { DATA = d && typeof d === "object" ? d : null; return DATA; })
    .catch(function () { return null; });

  function activePricing(d) { return (d.pricing || []).filter(function (p) { return p && p.active !== false && p.name; }); }

  var renderers = {
    banner: function (d) {
      var el = $("#site-banner"), b = d.settings && d.settings.banner;
      if (!el) return;
      if (b && b.enabled && b.text) { el.querySelector("span").textContent = b.text; el.hidden = false; } else { el.hidden = true; }
    },
    social: function (d) {
      var s = d.settings || {};
      ["instagram", "youtube"].forEach(function (kind) {
        var href = s[kind] && safeSocial(s[kind], kind);
        if (!href) return;
        $$('[data-social="' + kind + '"]').forEach(function (a) { a.setAttribute("href", href); });
        if (kind === "instagram") {
          var hd = handleOf(href);
          if (hd) $$("[data-handle]").forEach(function (n) { n.textContent = hd; });
        }
      });
    },
    hero: function (d) {
      var s = d.settings || {};
      var l1 = $("[data-hero-line1]"), lead = $("[data-hero-text]");
      if (l1 && s.heroLine1) l1.textContent = s.heroLine1;
      if (lead && s.heroText) lead.textContent = s.heroText;
      if (typingEl && s.heroLine2 && s.heroLine2 !== typingEl.getAttribute("data-typing")) startTyping(s.heroLine2);
    },
    pricing: function (d) {
      var list = activePricing(d);
      var grid = $("#pricing-grid");
      if (grid) {
        clear(grid);
        list.forEach(function (p) {
          grid.appendChild(h("div", { class: "card price-card reveal" }, [
            h("h3", { text: p.name }),
            h("div", { class: "amount" }, [money(p.price), h("small", { text: " onwards" })]),
            h("p", { text: p.description || "" }),
            h("a", { class: "btn small", href: "book.html?type=" + encodeURIComponent(p.id || "") , text: "Book this" })
          ]));
        });
        if (!list.length) grid.appendChild(h("p", { class: "price-note", text: "Prices will be listed here soon — message me on Instagram for a quote." }));
      }
      var min = list.reduce(function (m, p) { return Math.min(m, Number(p.price)); }, Infinity);
      $$("[data-price-from]").forEach(function (n) { n.textContent = isFinite(min) ? money(min) : "—"; });
      var tp = $("#terms-prices");
      if (tp) {
        clear(tp);
        list.forEach(function (p) { tp.appendChild(h("li", {}, [p.name + ": ", h("strong", { text: money(p.price) })])); });
      }
      var dl = d.settings && d.settings.deliveryTime;
      if (dl) $$("[data-delivery]").forEach(function (n) { n.textContent = dl; });
    },
    about: function (d) {
      var box = $("#about-text"), paras = d.settings && d.settings.about;
      if (!box || !Array.isArray(paras) || !paras.length) return;
      var cta = $("#about-cta");
      $$("p.about-p", box).forEach(function (p) { p.remove(); });
      paras.forEach(function (t) { var p = h("p", { class: "about-p", text: t }); box.insertBefore(p, cta || null); });
      var lead = $("[data-artist-blurb]");
      if (lead) lead.textContent = paras[0];
    },
    featured: function (d) {
      var wall = $("#featured-wall");
      var items = (d.gallery || []);
      var feat = items.filter(function (i) { return i.featured; });
      if (!feat.length) feat = items;
      feat = feat.slice(0, 6);
      var a = $("#hero-art-a"), b = $("#hero-art-b");
      [a, b].forEach(function (fig, idx) {
        var it = feat[idx]; if (!fig || !it) return;
        var img = fig.querySelector("img"), cap = fig.querySelector("figcaption");
        if (img.getAttribute("src") !== (it.thumb || it.full)) { img.removeAttribute("srcset"); img.src = it.thumb || it.full; } img.alt = it.caption || it.title || ""; if (cap) cap.textContent = it.title || "";
      });
      if (!wall) return;
      clear(wall);
      feat.forEach(function (it) {
        var ar = it.w && it.h ? it.w + " / " + it.h : "4 / 5";
        wall.appendChild(h("a", { class: "frame reveal", href: "gallery.html#" + encodeURIComponent(it.id), style: "--ar:" + ar }, [
          h("img", { src: it.thumb || it.full, alt: it.caption || it.title || "Artwork", loading: "lazy", width: it.w ? 480 : null, height: it.w ? Math.round(480 * it.h / it.w) : null }),
          h("figcaption", { text: it.title || "" })
        ]));
      });
      observeReveals();
    },
    // Keep the JSON-LD structured data in step with what the dashboard published.
    ld: function (d) {
      var s = d.settings || {};
      function abs(p) { try { return new URL(p, document.baseURI).href; } catch (e) { return p; } }
      function edit(key, fn) {
        var el = $('script[type="application/ld+json"][data-ld="' + key + '"]');
        if (!el) return;
        try { var o = JSON.parse(el.textContent); fn(o); el.textContent = JSON.stringify(o); } catch (e) {}
      }
      var sameAs = [safeSocial(s.instagram, "instagram"), safeSocial(s.youtube, "youtube")].filter(Boolean);
      edit("site", function (o) {
        (o["@graph"] || []).forEach(function (n) { if (n.sameAs && sameAs.length) n.sameAs = sameAs; });
      });
      edit("about", function (o) { if (o.mainEntity && sameAs.length) o.mainEntity.sameAs = sameAs; });
      edit("gallery", function (o) {
        o.associatedMedia = (d.gallery || []).map(function (it) {
          var m = { "@type": "ImageObject", contentUrl: abs(it.full), thumbnailUrl: abs(it.thumb || it.full), name: it.title || "Artwork",
            encodingFormat: "image/jpeg", creator: { "@type": "Person", name: "Anmol Dubey" },
            creditText: "Anmol Dubey / Sketch Haven", copyrightNotice: "\u00a9 Anmol Dubey", acquireLicensePage: abs("tnc.html#copyright") };
          if (it.caption) m.caption = it.caption;
          if (it.w && it.h) { m.width = it.w; m.height = it.h; }
          return m;
        });
      });
      edit("service", function (o) {
        var open = !(s.commissions && s.commissions.open === false);
        o.hasOfferCatalog = o.hasOfferCatalog || { "@type": "OfferCatalog", name: "Sketch types" };
        o.hasOfferCatalog.itemListElement = activePricing(d).map(function (p) {
          return { "@type": "Offer", name: p.name, description: p.description || undefined, price: String(p.price), priceCurrency: "INR",
            url: abs("book.html"), availability: open ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            itemOffered: { "@type": "Service", name: p.name } };
        });
      });
    }
  };

  /* ---------- Lightbox ---------- */
  var Lightbox = (function () {
    var lb = null, items = [], cur = 0, lastFocus = null, startX = null;
    var els = {};

    function build() {
      lb = h("div", { class: "lb", role: "dialog", "aria-modal": "true", "aria-label": "Artwork viewer" });
      lb.innerHTML =
        '<div class="lb-top"><span class="lb-count" aria-live="polite"></span><div class="lb-actions">' +
        '<a class="lb-cta" href="book.html">Request a sketch like this</a>' +
        '<button type="button" class="lb-btn lb-zoom" aria-label="Zoom in" title="Zoom">&#8981;</button>' +
        '<button type="button" class="lb-btn lb-close" aria-label="Close viewer">&times;</button></div></div>' +
        '<div class="lb-stage"><button type="button" class="lb-btn lb-prev" aria-label="Previous artwork">&#8249;</button>' +
        '<img alt=""><button type="button" class="lb-btn lb-next" aria-label="Next artwork">&#8250;</button></div>' +
        '<div class="lb-info"><span class="cat"></span><h3></h3><p></p></div>' +
        '<div class="lb-thumbs" role="group" aria-label="All artworks"></div>';
      document.body.appendChild(lb);
      els.count = $(".lb-count", lb); els.cta = $(".lb-cta", lb); els.zoom = $(".lb-zoom", lb);
      els.close = $(".lb-close", lb); els.stage = $(".lb-stage", lb); els.img = $(".lb-stage img", lb);
      els.prev = $(".lb-prev", lb); els.next = $(".lb-next", lb);
      els.cat = $(".lb-info .cat", lb); els.title = $(".lb-info h3", lb); els.cap = $(".lb-info p", lb);
      els.thumbs = $(".lb-thumbs", lb);

      els.close.addEventListener("click", close);
      els.prev.addEventListener("click", function () { go(cur - 1); });
      els.next.addEventListener("click", function () { go(cur + 1); });
      els.zoom.addEventListener("click", toggleZoom);
      els.img.addEventListener("click", function (e) { toggleZoom(e); });
      els.stage.addEventListener("pointermove", function (e) {
        if (!els.stage.classList.contains("zoomed")) return;
        var r = els.img.getBoundingClientRect();
        var x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
        var y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
        els.img.style.transformOrigin = x + "% " + y + "%";
      });
      lb.addEventListener("click", function (e) { if (e.target === lb || e.target === els.stage) close(); });
      lb.addEventListener("touchstart", function (e) { startX = e.changedTouches[0].clientX; }, { passive: true });
      lb.addEventListener("touchend", function (e) {
        if (startX === null || els.stage.classList.contains("zoomed")) { startX = null; return; }
        var dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 50) go(cur + (dx < 0 ? 1 : -1));
        startX = null;
      }, { passive: true });
      document.addEventListener("keydown", onKey);
    }

    function toggleZoom(e) {
      var z = els.stage.classList.toggle("zoomed");
      els.zoom.setAttribute("aria-label", z ? "Zoom out" : "Zoom in");
      if (z && e && e.clientX !== undefined && e.currentTarget === els.img) {
        var r = els.img.getBoundingClientRect();
        els.img.style.transformOrigin = ((e.clientX - r.left) / r.width) * 100 + "% " + ((e.clientY - r.top) / r.height) * 100 + "%";
      }
    }

    function onKey(e) {
      if (!lb || !lb.classList.contains("open")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") go(cur - 1);
      else if (e.key === "ArrowRight") go(cur + 1);
      else if (e.key === "+" || e.key === "=") { if (!els.stage.classList.contains("zoomed")) toggleZoom(); }
      else if (e.key === "-") { if (els.stage.classList.contains("zoomed")) toggleZoom(); }
      else if (e.key === "Tab") {
        var f = $$("button, a[href]", lb).filter(function (n) { return n.offsetParent !== null; });
        if (!f.length) return;
        var i = f.indexOf(document.activeElement);
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (i === f.length - 1 || i === -1)) { e.preventDefault(); first.focus(); }
      }
    }

    function go(n) {
      if (!items.length) return;
      cur = (n + items.length) % items.length;
      var it = items[cur];
      els.stage.classList.remove("zoomed");
      els.img.style.transformOrigin = "";
      els.zoom.setAttribute("aria-label", "Zoom in");
      els.img.src = it.full || it.thumb;
      els.img.alt = (it.title || "Artwork") + (it.caption ? " — " + it.caption : "");
      els.title.textContent = it.title || "";
      els.cap.textContent = it.caption || "";
      els.cat.textContent = it.category || "";
      els.cat.hidden = !it.category;
      els.count.textContent = (cur + 1) + " / " + items.length;
      els.cta.setAttribute("href", "book.html?ref=" + encodeURIComponent(it.id || ""));
      $$("button", els.thumbs).forEach(function (b, i) {
        if (i === cur) { b.setAttribute("aria-current", "true"); b.scrollIntoView({ block: "nearest", inline: "center" }); }
        else b.removeAttribute("aria-current");
      });
      els.prev.hidden = els.next.hidden = items.length < 2;
      [cur + 1, cur - 1].forEach(function (k) { var n2 = items[(k + items.length) % items.length]; if (n2 && n2.full) { var p = new Image(); p.src = n2.full; } });
      try { history.replaceState(null, "", "#" + encodeURIComponent(it.id)); } catch (e) {}
    }

    function open(list, index) {
      if (!lb) build();
      items = list; lastFocus = document.activeElement;
      clear(els.thumbs);
      items.forEach(function (it, i) {
        var b = h("button", { type: "button", "aria-label": "View " + (it.title || "artwork " + (i + 1)) }, [h("img", { src: it.thumb || it.full, alt: "" })]);
        b.addEventListener("click", function () { go(i); });
        els.thumbs.appendChild(b);
      });
      els.thumbs.hidden = items.length < 2;
      lb.classList.add("open");
      document.body.style.overflow = "hidden";
      go(index);
      els.close.focus();
    }

    function close() {
      if (!lb) return;
      lb.classList.remove("open");
      document.body.style.overflow = "";
      els.stage.classList.remove("zoomed");
      els.img.removeAttribute("src");
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    return { open: open, close: close };
  })();

  /* ---------- Gallery page ---------- */
  function initGallery(d) {
    var grid = $("#g-grid");
    if (!grid) return;
    var items = (d && d.gallery) || null;
    var chipsBox = $("#g-chips"), count = $("#g-count"), empty = $("#g-empty");
    var filter = "All";

    // Fallback: if the data file couldn't load, keep the pre-rendered gallery and just wire it up.
    if (!items) { bindStatic(); return; }
    var cats = (d.categories || []).filter(function (c) { return items.some(function (i) { return i.category === c; }); });

    function visible() { return filter === "All" ? items : items.filter(function (i) { return i.category === filter; }); }

    function renderChips() {
      clear(chipsBox);
      if (!cats.length) { chipsBox.hidden = true; return; }
      chipsBox.hidden = false;
      ["All"].concat(cats).forEach(function (c) {
        var n = c === "All" ? items.length : items.filter(function (i) { return i.category === c; }).length;
        var b = h("button", { type: "button", class: "chip", "aria-pressed": String(c === filter) }, [c, h("span", { class: "n", text: String(n) })]);
        b.addEventListener("click", function () { filter = c; renderChips(); renderGrid(); });
        chipsBox.appendChild(b);
      });
    }
    function renderGrid() {
      var list = visible();
      clear(grid);
      list.forEach(function (it, idx) {
        var img = h("img", { src: it.thumb || it.full, alt: (it.title || "Artwork") + (it.caption ? " — " + it.caption : ""), loading: idx < 6 ? "eager" : "lazy", decoding: "async", width: it.w ? 480 : null, height: it.w ? Math.round(480 * it.h / it.w) : null });
        var btn = h("button", { type: "button", class: "g-item", "data-id": it.id }, [
          img,
          h("span", { class: "g-cap" }, [h("strong", { text: it.title || "Untitled" }), h("small", { text: it.category || "" })])
        ]);
        btn.addEventListener("click", function () { Lightbox.open(list, idx); });
        grid.appendChild(btn);
      });
      empty.hidden = list.length > 0;
      count.textContent = list.length + (list.length === 1 ? " artwork" : " artworks");
    }
    renderChips(); renderGrid();

    watchHash(function () { return items; });
  }
  // Opens the artwork named in the URL hash (#art-3), on first load and whenever the hash changes later.
  function watchHash(getItems) {
    function fromHash() {
      var id = "";
      try { id = decodeURIComponent((location.hash || "").slice(1)); } catch (e) { return; }
      if (!id) return;
      var list = getItems();
      var idx = list.findIndex(function (i) { return i.id === id; });
      if (idx > -1) Lightbox.open(list, idx);
    }
    fromHash();
    window.addEventListener("hashchange", fromHash);
  }
  function bindStatic() {
    var buttons = $$("#g-grid .g-item");
    var list = buttons.map(function (b) {
      return { id: b.getAttribute("data-id"), title: b.getAttribute("data-title"), caption: b.getAttribute("data-caption"), category: b.getAttribute("data-cat"), full: b.getAttribute("data-full"), thumb: $("img", b).getAttribute("src") };
    });
    buttons.forEach(function (b, i) { b.addEventListener("click", function () { Lightbox.open(list, i); }); });
    watchHash(function () { return list; });
  }

  /* ---------- Booking page ---------- */
  function initBook(d) {
    var type = $("#sketch-type"), size = $("#size");
    if (!type || !size || !d) return;
    var list = activePricing(d);
    var sizes = (d.settings && d.settings.sizes) || [];
    var wanted = new URLSearchParams(location.search).get("type");

    if (list.length) {
      clear(type);
      type.appendChild(h("option", { value: "", text: "Choose a sketch type" }));
      list.forEach(function (p) {
        type.appendChild(h("option", { value: p.name, "data-price": String(p.price), "data-id": p.id || "", text: p.name + " — " + money(p.price) }));
      });
    }
    if (sizes.length) {
      clear(size);
      size.appendChild(h("option", { value: "", text: "Choose a size" }));
      sizes.forEach(function (s) { size.appendChild(h("option", { value: s, text: s })); });
    }
    var prev = $("#price-preview"), shown = $("#price-shown");
    function update() {
      var o = type.options[type.selectedIndex];
      var price = o && o.getAttribute("data-price");
      if (price) { prev.hidden = false; $("strong", prev).textContent = money(price); shown.value = money(price); }
      else { prev.hidden = true; shown.value = ""; }
    }
    type.addEventListener("change", update);
    if (wanted) {
      var opt = $$("option", type).filter(function (o) { return o.getAttribute("data-id") === wanted; })[0];
      if (opt) type.value = opt.value;
    }
    update();

    var c = d.settings && d.settings.commissions;
    if (c && c.open === false) {
      $("#book-fieldset").disabled = true;
      var btn = $("#book-submit"); if (btn) btn.disabled = true;
      var note = $("#commission-closed");
      note.querySelector("span").textContent = c.message || "Commissions are currently closed. Please check back soon.";
      note.hidden = false;
    }

    var ref = new URLSearchParams(location.search).get("ref");
    if (ref) {
      var it = (d.gallery || []).filter(function (g) { return g.id === ref; })[0];
      if (it) {
        $("#ref-note span").textContent = "You're asking for a sketch inspired by “" + it.title + "”.";
        $("#ref-note").hidden = false;
        $("#ref-field").value = it.title;
      }
    }
  }

  /* ---------- Run page renderers once data is in ---------- */
  dataReady.then(function (d) {
    if (d) {
      ["banner", "social", "hero", "pricing", "about", "featured", "ld"].forEach(function (k) {
        try { renderers[k](d); } catch (e) { if (window.console) console.error(k, e); }
      });
      observeReveals();
    }
    try { initGallery(d); } catch (e) { if (window.console) console.error("gallery", e); }
    try { initBook(d); } catch (e) { if (window.console) console.error("book", e); }
  });

  /* ---------- Forms ---------- */
  var MAX_FILE = 5 * 1024 * 1024; // FormSubmit attachment limit
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var IG_RE = /^[A-Za-z0-9._]{1,30}$/;

  function setError(field, msg) {
    var wrap = field.closest(".field");
    if (!wrap) return;
    var out = wrap.querySelector(".error-msg");
    wrap.classList.toggle("invalid", !!msg);
    field.setAttribute("aria-invalid", msg ? "true" : "false");
    if (out) out.textContent = msg || "";
    var form = field.closest("form"), box = form && $(".form-notice", form);
    if (box && !box.hidden && !$(".field.invalid", form)) box.hidden = true;
  }
  // Accepts "@name", "name", or a pasted instagram.com link and returns just the username.
  function cleanInstagram(v) {
    v = (v || "").trim();
    var m = v.match(/instagram\.com\/([^/?#\s]+)/i);
    if (m) v = m[1];
    return v.replace(/^@+/, "").replace(/\/+$/, "");
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
    if (field.getAttribute("data-kind") === "instagram") {
      var u = cleanInstagram(field.value);
      if (!u) { setError(field, ""); return true; }
      if (!IG_RE.test(u) || /\.\.|\.$/.test(u)) { setError(field, "Instagram usernames use only letters, numbers, periods and underscores."); return false; }
      setError(field, ""); return true;
    }
    if (field.required && !v) { setError(field, "This field is required."); return false; }
    if (field.type === "email" && v && !EMAIL_RE.test(v)) { setError(field, "Please enter a valid email address."); return false; }
    if (field.minLength > 0 && v && v.length < field.minLength) { setError(field, "Please write at least " + field.minLength + " characters."); return false; }
    setError(field, ""); return true;
  }

  $$("form[data-validate]").forEach(function (form) {
    var fields = $$("input:not([type=hidden]), select, textarea", form).filter(function (f) { return f.name && f.name.charAt(0) !== "_"; });
    fields.forEach(function (f) {
      f.addEventListener("blur", function () {
        if (f.type === "file") return;
        if (f.getAttribute("data-kind") === "instagram") f.value = cleanInstagram(f.value);
        validateField(f);
      });
      f.addEventListener("input", function () { if (f.closest(".field").classList.contains("invalid")) validateField(f); });
      f.addEventListener("change", function () { validateField(f); });
    });
    form.addEventListener("submit", function (e) {
      var firstBad = null;
      fields.forEach(function (f) { if (!f.matches(":disabled") && !validateField(f) && !firstBad) firstBad = f; });
      var box = $(".form-notice", form);
      if (firstBad) {
        e.preventDefault();
        firstBad.focus();
        if (box) { box.hidden = false; box.textContent = "Please fix the highlighted fields and try again."; }
        return;
      }
      if (box) box.hidden = true;
      $$("[data-kind=instagram]", form).forEach(function (f) { var u = cleanInstagram(f.value); f.value = u ? "@" + u : ""; });
      var btn = $("button[type=submit]", form);
      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    });
  });

  /* ---------- Reference photo picker ---------- */
  var dz = $(".dropzone");
  if (dz) {
    var input = $("input[type=file]", dz), body = $(".dz-body", dz), removeBtn = $(".remove-file");
    var defaultNodes = body.cloneNode(true);
    var render = function () {
      var file = input.files && input.files[0];
      if (!file || !/^image\//.test(file.type)) {
        clear(body);
        Array.prototype.slice.call(defaultNodes.childNodes).forEach(function (n) { body.appendChild(n.cloneNode(true)); });
        if (removeBtn) removeBtn.hidden = true;
        return;
      }
      var url = URL.createObjectURL(file);
      clear(body);
      var img = h("img", { class: "preview", alt: "Preview of your reference photo", src: url });
      img.onload = function () { URL.revokeObjectURL(url); };
      body.appendChild(img);
      body.appendChild(h("span", { text: file.name + " (" + (file.size / 1048576).toFixed(1) + " MB)" }));
      if (removeBtn) removeBtn.hidden = false;
    };
    input.addEventListener("change", render);
    if (removeBtn) removeBtn.addEventListener("click", function () { input.value = ""; render(); validateField(input); });
    ["dragenter", "dragover"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("drag"); }); });
    ["dragleave", "drop"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("drag"); }); });
    dz.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files.length) { input.files = e.dataTransfer.files; render(); validateField(input); }
    });
  }
})();
