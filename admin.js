/* Sketch Haven — admin dashboard.
   Login: your GitHub token is encrypted (AES-GCM, key from your password via PBKDF2) and kept in this browser only.
   Publish: edits are committed to your GitHub repo in ONE atomic commit through the Git Data API.
   The public website reads data/site.json, so published changes go live after GitHub Pages rebuilds (~1-2 min). */
(function () {
  "use strict";

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "text") e.textContent = v;
      else if (k === "class") e.className = v;
      else if (k === "value") e.value = v;
      else e.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  var enc = new TextEncoder(), dec = new TextDecoder();
  function bytesToB64(bytes) {
    var s = "", chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(s);
  }
  function b64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // canonical JSON (sorted keys) so comparisons ignore key order
  function canon(v) {
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + canon(v[k]); }).join(",") + "}";
    return JSON.stringify(v);
  }
  var toastTimer = null;
  function toast(msg, isErr) {
    var t = $("#toast");
    t.textContent = msg; t.className = "toast" + (isErr ? " err" : ""); t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, isErr ? 6000 : 3500);
  }
  function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function safeImg(p) { return typeof p === "string" && /^images\/[\w./-]+$/.test(p) && p.indexOf("..") === -1 ? p : ""; }

  /* ---------- state ---------- */
  var STORE_KEY = "sh_admin_v1", FAIL_KEY = "sh_admin_fail";
  var S = { repo: "", branch: "", token: "", data: null, original: "", dirty: false, pending: {}, removed: [], previews: {} };

  function getStore() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      return s && s.ct && s.salt && s.iv && s.repo ? s : null;
    } catch (e) { return null; }
  }

  /* ---------- crypto ---------- */
  function deriveKey(pw, salt, iter) {
    return crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    });
  }
  function encryptToken(token, pw) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 250000;
    return deriveKey(pw, salt, iter).then(function (key) {
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(token));
    }).then(function (ct) {
      return { salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)), iter: iter };
    });
  }
  function decryptToken(store, pw) {
    return deriveKey(pw, b64ToBytes(store.salt), store.iter || 250000).then(function (key) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(store.iv) }, key, b64ToBytes(store.ct));
    }).then(function (pt) { return dec.decode(pt); });
  }

  /* ---------- GitHub API ---------- */
  function gh(method, path, body) {
    var headers = { Authorization: "Bearer " + S.token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (body) headers["Content-Type"] = "application/json";
    return fetch("https://api.github.com" + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store" })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
          if (!res.ok) {
            var err = new Error((json && json.message) || "HTTP " + res.status);
            err.status = res.status;
            throw err;
          }
          return json;
        });
      });
  }
  function friendly(err) {
    if (!err) return "Something went wrong.";
    if (err.status === 401) return "GitHub rejected the token (it may be wrong or expired). Use “Forgot password or changing token?” to set up again with a new token.";
    if (err.status === 403) return "GitHub refused the request. The token may lack “Contents: Read and write” permission for this repository, or you hit a rate limit. (" + err.message + ")";
    if (err.status === 404) return "Not found on GitHub. Check the repository name, that the token can access it, and that the new website files (including data/site.json) have been uploaded.";
    if (err.status === 409 || err.status === 422) return "GitHub reported a conflict (" + err.message + "). Please try again.";
    if (err instanceof TypeError) return "Network error. Please check your internet connection and try again.";
    return err.message || "Something went wrong.";
  }
  function rp(path) { return "/repos/" + S.repo + path; }

  function readJsonFile() {
    return gh("GET", rp("/contents/data/site.json?ref=" + encodeURIComponent(S.branch))).then(function (f) {
      var text = dec.decode(b64ToBytes(String(f.content || "").replace(/\s/g, "")));
      return JSON.parse(text);
    });
  }

  /* ---------- data ---------- */
  function normalize(d) {
    d = d && typeof d === "object" ? d : {};
    var st = Object.assign({ heroLine1: "", heroLine2: "", heroText: "", banner: {}, commissions: {}, deliveryTime: "", instagram: "", youtube: "", sizes: [], about: [] }, d.settings || {});
    st.banner = Object.assign({ enabled: false, text: "" }, st.banner);
    st.commissions = Object.assign({ open: true, message: "" }, st.commissions);
    st.sizes = Array.isArray(st.sizes) ? st.sizes : [];
    st.about = Array.isArray(st.about) ? st.about : [];
    return {
      version: 1,
      settings: st,
      pricing: Array.isArray(d.pricing) ? d.pricing : [],
      categories: Array.isArray(d.categories) ? d.categories : [],
      gallery: (Array.isArray(d.gallery) ? d.gallery : []).map(function (it) {
        return Object.assign({ id: uid("a"), title: "", caption: "", category: "", full: "", thumb: "", w: 0, h: 0, featured: false, added: "" }, it, { featured: !!(it && it.featured) });
      })
    };
  }
  function resetOriginal() { S.original = canon(S.data); }

  /* ---------- views ---------- */
  function show(view) {
    ["setup", "login", "app"].forEach(function (v) { $("#view-" + v).hidden = v !== view; });
    var first = { setup: "#s-repo", login: "#l-pass" }[view];
    if (first) setTimeout(function () { $(first).focus(); }, 30);
  }

  /* ---------- setup ---------- */
  $("#setup-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var repo = $("#s-repo").value.trim(), token = $("#s-token").value.trim(), p1 = $("#s-pass").value, p2 = $("#s-pass2").value;
    var err = $("#setup-error"); err.textContent = "";
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { err.textContent = "Repository must look like owner/name, e.g. SketchHaven/SketchHaven.github.io"; return; }
    if (token.length < 20) { err.textContent = "Please paste your GitHub token."; return; }
    if (p1.length < 8) { err.textContent = "Choose a password with at least 8 characters."; return; }
    if (p1 !== p2) { err.textContent = "The two passwords don’t match."; return; }
    var btn = $("#setup-btn"); btn.disabled = true; btn.textContent = "Checking…";
    S.repo = repo; S.token = token;
    gh("GET", "/repos/" + repo).then(function (info) {
      if (info.permissions && info.permissions.push === false) throw Object.assign(new Error("This token can only read the repository"), { status: 403 });
      S.branch = info.default_branch || "main";
      return encryptToken(token, p1);
    }).then(function (encd) {
      localStorage.setItem(STORE_KEY, JSON.stringify(Object.assign({ repo: repo }, encd)));
      localStorage.removeItem(FAIL_KEY);
      return enterApp();
    }).then(function () {
      $("#setup-form").reset(); $("#s-repo").value = repo;
    }).catch(function (ex) {
      S.token = "";
      err.textContent = friendly(ex);
    }).then(function () { btn.disabled = false; btn.textContent = "Save & continue"; });
  });

  /* ---------- login ---------- */
  function failState() { try { return JSON.parse(localStorage.getItem(FAIL_KEY)) || { n: 0, until: 0 }; } catch (e) { return { n: 0, until: 0 }; } }
  $("#login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("#login-error"); err.textContent = "";
    var st = getStore(), pw = $("#l-pass").value;
    if (!st) { show("setup"); return; }
    var f = failState();
    if (Date.now() < f.until) { err.textContent = "Too many wrong attempts. Please wait " + Math.ceil((f.until - Date.now()) / 1000) + " seconds."; return; }
    if (!pw) { err.textContent = "Please enter your password."; return; }
    var btn = $("#login-btn"); btn.disabled = true; btn.textContent = "Checking…";
    decryptToken(st, pw).then(function (token) {
      localStorage.removeItem(FAIL_KEY);
      S.token = token; S.repo = st.repo;
      return gh("GET", "/repos/" + S.repo).then(function (info) {
        S.branch = info.default_branch || "main";
        return enterApp();
      }).catch(function (ex) { S.token = ""; err.textContent = friendly(ex); });
    }, function () {
      var n = f.n + 1;
      localStorage.setItem(FAIL_KEY, JSON.stringify({ n: n, until: n >= 5 ? Date.now() + 30000 * (n - 4) : 0 }));
      err.textContent = "Wrong password.";
    }).then(function () { btn.disabled = false; btn.textContent = "Log in"; $("#l-pass").value = ""; });
  });
  $("#reset-btn").addEventListener("click", function () {
    if (!confirm("This removes the saved GitHub token from this browser so you can set up again with a new token and password. Your website is not affected. Continue?")) return;
    localStorage.removeItem(STORE_KEY); localStorage.removeItem(FAIL_KEY);
    $("#login-error").textContent = "";
    show("setup");
  });

  function logout() {
    S.token = ""; S.data = null; S.pending = {}; S.removed = [];
    Object.keys(S.previews).forEach(function (k) { try { URL.revokeObjectURL(S.previews[k]); } catch (e) {} });
    S.previews = {};
    show("login");
  }
  $("#btn-logout").addEventListener("click", function () {
    if (S.dirty && !confirm("You have unpublished changes that will be lost. Log out anyway?")) return;
    S.dirty = false; logout();
  });

  // auto log-out after 30 idle minutes (never while there are unpublished changes)
  var idleTimer = null;
  function resetIdle() {
    clearTimeout(idleTimer);
    if (S.token) idleTimer = setTimeout(function () { if (!S.dirty) { logout(); } else { resetIdle(); } }, 30 * 60 * 1000);
  }
  ["click", "keydown", "pointermove"].forEach(function (ev) { document.addEventListener(ev, resetIdle, { passive: true }); });
  window.addEventListener("beforeunload", function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- enter app ---------- */
  function enterApp() {
    return readJsonFile().then(function (raw) {
      S.data = normalize(raw); S.pending = {}; S.removed = [];
      resetOriginal();
      renderAll();
      selectTab("gallery");
      show("app");
      resetIdle();
    });
  }

  /* ---------- tabs ---------- */
  var TABS = ["gallery", "pricing", "settings", "help"];
  function selectTab(name, focus) {
    TABS.forEach(function (t) {
      var on = t === name, btn = $("#tab-" + t);
      btn.setAttribute("aria-selected", String(on));
      btn.tabIndex = on ? 0 : -1;
      $("#panel-" + t).hidden = !on;
      if (on && focus) btn.focus();
    });
  }
  TABS.forEach(function (t, i) {
    var btn = $("#tab-" + t);
    btn.addEventListener("click", function () { selectTab(t); });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); selectTab(TABS[(i + 1) % TABS.length], true); }
      if (e.key === "ArrowLeft") { e.preventDefault(); selectTab(TABS[(i + TABS.length - 1) % TABS.length], true); }
    });
  });

  /* ---------- status ---------- */
  function updateStatus() {
    S.dirty = !!S.data && canon(S.data) !== S.original;
    var pill = $("#save-status");
    pill.textContent = S.dirty ? "Unpublished changes" : "All changes published";
    pill.classList.toggle("dirty", S.dirty);
    $("#btn-publish").disabled = !S.dirty;
    $("#btn-discard").disabled = !S.dirty;
  }

  /* ---------- settings bindings ---------- */
  function paragraphs(v) { return v.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function csv(v, max, len) {
    var out = [];
    v.split(",").forEach(function (s) { s = s.trim().slice(0, len); if (s && out.indexOf(s) === -1 && out.length < max) out.push(s); });
    return out;
  }
  var BINDINGS = [
    { id: "st-open", type: "check", get: function () { return S.data.settings.commissions.open !== false; }, set: function (v) { S.data.settings.commissions.open = v; } },
    { id: "st-closed-msg", get: function () { return S.data.settings.commissions.message; }, set: function (v) { S.data.settings.commissions.message = v; } },
    { id: "st-delivery", get: function () { return S.data.settings.deliveryTime; }, set: function (v) { S.data.settings.deliveryTime = v; } },
    { id: "st-banner-on", type: "check", get: function () { return !!S.data.settings.banner.enabled; }, set: function (v) { S.data.settings.banner.enabled = v; } },
    { id: "st-banner-text", get: function () { return S.data.settings.banner.text; }, set: function (v) { S.data.settings.banner.text = v; } },
    { id: "st-h1", get: function () { return S.data.settings.heroLine1; }, set: function (v) { S.data.settings.heroLine1 = v; } },
    { id: "st-h2", get: function () { return S.data.settings.heroLine2; }, set: function (v) { S.data.settings.heroLine2 = v; } },
    { id: "st-htext", get: function () { return S.data.settings.heroText; }, set: function (v) { S.data.settings.heroText = v; } },
    { id: "st-ig", get: function () { return S.data.settings.instagram; }, set: function (v) { S.data.settings.instagram = v.trim(); } },
    { id: "st-yt", get: function () { return S.data.settings.youtube; }, set: function (v) { S.data.settings.youtube = v.trim(); } },
    { id: "st-about", get: function () { return S.data.settings.about.join("\n\n"); }, set: function (v) { S.data.settings.about = paragraphs(v); } },
    { id: "sizes-input", get: function () { return S.data.settings.sizes.join(", "); }, set: function (v) { S.data.settings.sizes = csv(v, 8, 20); } },
    { id: "cat-input", get: function () { return S.data.categories.join(", "); }, set: function (v) { S.data.categories = csv(v, 12, 30); scheduleGalleryRender(); } }
  ];
  BINDINGS.forEach(function (b) {
    var el = document.getElementById(b.id);
    el.addEventListener(b.type === "check" ? "change" : "input", function () {
      b.set(b.type === "check" ? el.checked : el.value);
      el.classList.remove("bad");
      updateStatus();
    });
  });
  function fillSettings() {
    BINDINGS.forEach(function (b) {
      var el = document.getElementById(b.id);
      if (b.type === "check") el.checked = !!b.get(); else el.value = b.get() || "";
      el.classList.remove("bad");
    });
  }

  /* ---------- gallery ---------- */
  var galleryTimer = null;
  function scheduleGalleryRender() { clearTimeout(galleryTimer); galleryTimer = setTimeout(renderGallery, 250); }

  function move(arr, i, dir) {
    var j = i + dir;
    if (j < 0 || j >= arr.length) return false;
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    return true;
  }

  function renderGallery() {
    var list = $("#g-list"); clear(list);
    var items = S.data.gallery;
    $("#g-empty").hidden = items.length > 0;
    $("#g-total").textContent = items.length ? "(" + items.length + ")" : "";
    items.forEach(function (it, i) {
      var isNew = !!S.pending[it.id];
      var src = S.previews[it.id] || safeImg(it.thumb);
      var thumb = h("div", { class: "g-thumb" }, [h("img", { src: src || null, alt: "", loading: "lazy" })]);
      if (isNew) thumb.appendChild(h("span", { class: "badge", text: "NEW" }));

      var title = h("input", { type: "text", maxlength: "80", value: it.title, id: "g-title-" + i, "aria-label": "Title" });
      title.addEventListener("input", function () { it.title = title.value; updateStatus(); });
      var cap = h("textarea", { rows: "2", maxlength: "200", "aria-label": "Caption" });
      cap.value = it.caption || "";
      cap.addEventListener("input", function () { it.caption = cap.value; updateStatus(); });

      var sel = h("select", { "aria-label": "Category" });
      var cats = S.data.categories.slice();
      if (it.category && cats.indexOf(it.category) === -1) cats.push(it.category);
      sel.appendChild(h("option", { value: "", text: "No category" }));
      cats.forEach(function (c) { sel.appendChild(h("option", { value: c, text: c })); });
      sel.value = it.category || "";
      sel.addEventListener("change", function () { it.category = sel.value; updateStatus(); });

      var feat = h("input", { type: "checkbox" }); feat.checked = !!it.featured;
      feat.addEventListener("change", function () { it.featured = feat.checked; updateStatus(); });

      var up = h("button", { type: "button", class: "btn sm", "aria-label": "Move up", text: "↑ Up" });
      var down = h("button", { type: "button", class: "btn sm", "aria-label": "Move down", text: "↓ Down" });
      up.disabled = i === 0; down.disabled = i === items.length - 1;
      up.addEventListener("click", function () { if (move(items, i, -1)) { renderGallery(); updateStatus(); } });
      down.addEventListener("click", function () { if (move(items, i, 1)) { renderGallery(); updateStatus(); } });
      var del = h("button", { type: "button", class: "btn sm danger", text: "Delete" });
      del.addEventListener("click", function () {
        if (!confirm("Delete “" + (it.title || "this artwork") + "” from the gallery? It will be removed from the site when you publish.")) return;
        items.splice(i, 1);
        if (S.pending[it.id]) { delete S.pending[it.id]; if (S.previews[it.id]) { URL.revokeObjectURL(S.previews[it.id]); delete S.previews[it.id]; } }
        else S.removed.push({ full: it.full, thumb: it.thumb });
        renderGallery(); updateStatus();
      });

      var fields = h("div", { class: "g-fields" }, [
        h("div", {}, [h("label", { for: "g-title-" + i, text: "Title" }), title]),
        h("div", {}, [h("label", { text: "Category" }), sel]),
        h("div", { class: "full" }, [h("label", { text: "Caption" }), cap]),
        h("div", { class: "g-actions" }, [
          h("label", { class: "check" }, [feat, h("span", { text: "Featured on home page" })]),
          h("span", { class: "spacer" }), up, down, del
        ])
      ]);
      list.appendChild(h("article", { class: "g-card" + (isNew ? " new" : "") }, [thumb, fields]));
    });
  }

  function loadBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () { return viaImg(file); });
    }
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("unreadable image")); };
      img.src = url;
    });
  }
  function toJpeg(src, max, q) {
    var sw = src.width, sh = src.height, k = Math.min(1, max / Math.max(sw, sh));
    var w = Math.max(1, Math.round(sw * k)), hh = Math.max(1, Math.round(sh * k));
    var c = document.createElement("canvas"); c.width = w; c.height = hh;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, hh);
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, 0, 0, w, hh);
    return new Promise(function (res, rej) {
      c.toBlob(function (b) { b ? res({ blob: b, w: w, h: hh }) : rej(new Error("could not encode image")); }, "image/jpeg", q);
    });
  }
  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(",")[1]); };
      r.onerror = function () { rej(new Error("read failed")); };
      r.readAsDataURL(blob);
    });
  }
  function titleFromName(name) {
    var t = name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Untitled";
  }

  function addFiles(fileList) {
    var all = Array.prototype.slice.call(fileList);
    var files = all.filter(function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name); });
    var notImages = all.length - files.length;
    if (files.length > 30) { files = files.slice(0, 30); toast("Only the first 30 photos were added in one go."); }
    var prog = $("#g-progress"), added = 0, failed = [];
    var chain = Promise.resolve();
    files.forEach(function (file, idx) {
      chain = chain.then(function () {
        prog.textContent = "Processing photo " + (idx + 1) + " of " + files.length + "…";
        if (file.size > 40 * 1024 * 1024) throw new Error("over 40 MB");
        return loadBitmap(file).then(function (bmp) {
          return Promise.all([toJpeg(bmp, 1600, 0.82), toJpeg(bmp, 720, 0.8)]);
        }).then(function (r) {
          return Promise.all([blobToB64(r[0].blob), blobToB64(r[1].blob)]).then(function (b64) {
            var id = uid("a");
            S.pending[id] = { full: b64[0], thumb: b64[1] };
            S.previews[id] = URL.createObjectURL(r[1].blob);
            S.data.gallery.unshift({
              id: id, title: titleFromName(file.name), caption: "", category: S.data.categories[0] || "",
              full: "images/gallery/" + id + ".jpg", thumb: "images/gallery/" + id + "-thumb.jpg",
              w: r[0].w, h: r[0].h, featured: false, added: new Date().toISOString().slice(0, 10)
            });
            added++;
          });
        });
      }).catch(function () { failed.push(file.name); });
    });
    return chain.then(function () {
      prog.textContent = "";
      renderGallery(); updateStatus();
      if (added) toast(added + (added === 1 ? " photo added" : " photos added") + " — press Publish when you’re ready.");
      if (failed.length || notImages) toast("Couldn’t add: " + failed.concat(notImages ? [notImages + " non-image file(s)"] : []).join(", ") + ". Try JPG, PNG or WebP.", true);
    });
  }
  var fileInput = $("#g-files"), drop = $("#g-drop");
  fileInput.addEventListener("change", function () { addFiles(fileInput.files).then(function () { fileInput.value = ""; }); });
  ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("drag"); }); });
  ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("drag"); }); });
  drop.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

  /* ---------- pricing ---------- */
  function renderPricing() {
    var list = $("#p-list"); clear(list);
    var items = S.data.pricing;
    if (!items.length) list.appendChild(h("p", { class: "muted", text: "No sketch types yet. Add one so visitors can book." }));
    items.forEach(function (p, i) {
      var active = h("input", { type: "checkbox", "aria-label": "Active" }); active.checked = p.active !== false;
      active.addEventListener("change", function () { p.active = active.checked; updateStatus(); });
      var name = h("input", { type: "text", maxlength: "60", value: p.name, "aria-label": "Name", id: "p-name-" + i });
      name.addEventListener("input", function () { p.name = name.value; name.classList.remove("bad"); updateStatus(); });
      var price = h("input", { type: "number", min: "0", step: "1", value: p.price === undefined || p.price === "" ? "" : String(p.price), "aria-label": "Price in rupees", id: "p-price-" + i });
      price.addEventListener("input", function () { p.price = price.value === "" ? "" : Number(price.value); price.classList.remove("bad"); updateStatus(); });
      var desc = h("input", { type: "text", maxlength: "200", value: p.description || "", "aria-label": "Description" });
      desc.addEventListener("input", function () { p.description = desc.value; updateStatus(); });
      var up = h("button", { type: "button", class: "btn sm", "aria-label": "Move up", text: "↑" });
      var down = h("button", { type: "button", class: "btn sm", "aria-label": "Move down", text: "↓" });
      var del = h("button", { type: "button", class: "btn sm danger", text: "Delete" });
      up.disabled = i === 0; down.disabled = i === items.length - 1;
      up.addEventListener("click", function () { if (move(items, i, -1)) { renderPricing(); updateStatus(); } });
      down.addEventListener("click", function () { if (move(items, i, 1)) { renderPricing(); updateStatus(); } });
      del.addEventListener("click", function () {
        if (!confirm("Delete “" + (p.name || "this type") + "”?")) return;
        items.splice(i, 1); renderPricing(); updateStatus();
      });
      list.appendChild(h("div", { class: "p-row" }, [
        h("label", { class: "check" }, [active, h("span", { text: "Active" })]),
        h("div", {}, [h("label", { for: "p-name-" + i, text: "Name" }), name]),
        h("div", {}, [h("label", { for: "p-price-" + i, text: "Price (₹)" }), price]),
        h("div", { class: "wide" }, [h("label", { text: "Description" }), desc]),
        h("div", { class: "p-actions" }, [up, down, del])
      ]));
    });
  }
  $("#p-add").addEventListener("click", function () {
    S.data.pricing.push({ id: uid("p"), name: "", price: "", description: "", active: true });
    renderPricing(); updateStatus();
    var n = $("#p-name-" + (S.data.pricing.length - 1)); if (n) n.focus();
  });

  function renderAll() { fillSettings(); renderGallery(); renderPricing(); updateStatus(); }

  /* ---------- validation ---------- */
  function validate() {
    var errs = [], st = S.data.settings, bad = [];
    function mark(id) { var el = document.getElementById(id); if (el) el.classList.add("bad"); }
    S.data.pricing.forEach(function (p, i) {
      if (!String(p.name || "").trim()) { errs.push("Pricing: type #" + (i + 1) + " needs a name."); bad.push("p-name-" + i); }
      var n = Number(p.price);
      if (p.price === "" || !isFinite(n) || n < 0 || n > 1000000) { errs.push("Pricing: “" + (p.name || "type #" + (i + 1)) + "” needs a valid price (0 or more)."); bad.push("p-price-" + i); }
    });
    var open = st.commissions.open !== false;
    var activeCount = S.data.pricing.filter(function (p) { return p.active !== false; }).length;
    if (open && !activeCount) errs.push("Pricing: keep at least one active sketch type, or switch commissions to “not accepting” in Site settings.");
    if (open && !st.sizes.length) { errs.push("Pricing: add at least one canvas size (e.g. A4)."); bad.push("sizes-input"); }
    if (!st.heroLine1.trim()) { errs.push("Site settings: the home page heading (first line) can’t be empty."); bad.push("st-h1"); }
    if (!st.heroLine2.trim()) { errs.push("Site settings: the typed second line can’t be empty."); bad.push("st-h2"); }
    if (!st.deliveryTime.trim()) { errs.push("Site settings: please enter a typical delivery time."); bad.push("st-delivery"); }
    if (st.banner.enabled && !st.banner.text.trim()) { errs.push("Site settings: the banner is switched on but has no text."); bad.push("st-banner-text"); }
    function host(url, ok) { try { var u = new URL(url); return u.protocol === "https:" && ok.indexOf(u.hostname.replace(/^www\./, "")) > -1; } catch (e) { return false; } }
    if (!host(st.instagram, ["instagram.com"])) { errs.push("Site settings: the Instagram link must be a https://instagram.com/… address."); bad.push("st-ig"); }
    if (!host(st.youtube, ["youtube.com", "youtu.be", "m.youtube.com"])) { errs.push("Site settings: the YouTube link must be a https://youtube.com/… address."); bad.push("st-yt"); }
    if (!st.about.length) { errs.push("Site settings: the About text can’t be empty."); bad.push("st-about"); }
    bad.forEach(mark);
    return errs;
  }

  /* ---------- publish ---------- */
  function logLine(text, cls) { var li = h("li", { class: cls || "", text: text }); $("#pub-log").appendChild(li); return li; }
  function openModal(title) { clear($("#pub-log")); $("#pub-title").textContent = title; $("#pub-close").hidden = true; $("#pub-modal").hidden = false; }
  function endModal(title) { $("#pub-title").textContent = title; $("#pub-close").hidden = false; $("#pub-close").focus(); }
  $("#pub-close").addEventListener("click", function () { $("#pub-modal").hidden = true; });

  function commitAtomic(entries, deletions, message) {
    // entries: [{path, blobSha}], deletions: [path]. Retries when the branch moved underneath us.
    var attempt = 0;
    function run() {
      attempt++;
      return gh("GET", rp("/git/ref/heads/" + encodeURIComponent(S.branch))).then(function (ref) {
        var commitSha = ref.object.sha;
        return gh("GET", rp("/git/commits/" + commitSha)).then(function (c) {
          var tree = entries.map(function (e) { return { path: e.path, mode: "100644", type: "blob", sha: e.blobSha }; })
            .concat(deletions.map(function (p) { return { path: p, mode: "100644", type: "blob", sha: null }; }));
          return gh("POST", rp("/git/trees"), { base_tree: c.tree.sha, tree: tree });
        }).then(function (t) {
          return gh("POST", rp("/git/commits"), { message: message, tree: t.sha, parents: [commitSha] });
        });
      }).then(function (commit) {
        return gh("PATCH", rp("/git/refs/heads/" + encodeURIComponent(S.branch)), { sha: commit.sha, force: false });
      }).catch(function (err) {
        if (attempt < 3 && (err.status === 422 || err.status === 409)) return run();
        throw err;
      });
    }
    return run();
  }

  function publish() {
    var errs = validate();
    if (errs.length) {
      openModal("Please fix these first");
      errs.forEach(function (m) { logLine(m, "fail"); });
      endModal("Please fix these first");
      return;
    }
    // tidy the data a little before saving
    S.data.pricing.forEach(function (p) { p.name = p.name.trim(); p.price = Math.round(Number(p.price)); p.description = (p.description || "").trim(); if (!p.id) p.id = uid("p"); p.active = p.active !== false; });
    S.data.gallery.forEach(function (it) { it.title = (it.title || "").trim() || "Untitled"; it.caption = (it.caption || "").trim(); });
    updateStatus();

    var btn = $("#btn-publish"); btn.disabled = true;
    openModal("Publishing…");
    var pendingIds = S.data.gallery.filter(function (it) { return S.pending[it.id]; }).map(function (it) { return it.id; });
    var entries = [], deletions = [];
    var payload = JSON.stringify(S.data, null, 2) + "\n";
    var summary = [];

    logLine("Checking for newer changes…");
    readJsonFile().then(function (remote) {
      if (canon(normalize(remote)) !== S.original && !confirm("The site data was changed somewhere else since you opened the dashboard (maybe from another device). Publishing now will overwrite those changes. Continue?")) {
        throw Object.assign(new Error("Cancelled — nothing was changed."), { cancelled: true });
      }
      var chain = Promise.resolve();
      pendingIds.forEach(function (id, n) {
        var it = S.data.gallery.filter(function (g) { return g.id === id; })[0];
        chain = chain.then(function () {
          logLine("Uploading photo " + (n + 1) + " of " + pendingIds.length + "…");
          return gh("POST", rp("/git/blobs"), { content: S.pending[id].full, encoding: "base64" }).then(function (b1) {
            entries.push({ path: it.full, blobSha: b1.sha });
            return gh("POST", rp("/git/blobs"), { content: S.pending[id].thumb, encoding: "base64" });
          }).then(function (b2) { entries.push({ path: it.thumb, blobSha: b2.sha }); });
        });
      });
      return chain;
    }).then(function () {
      logLine("Saving site content…");
      return gh("POST", rp("/git/blobs"), { content: bytesToB64(enc.encode(payload)), encoding: "base64" });
    }).then(function (b) {
      entries.push({ path: "data/site.json", blobSha: b.sha });
      // work out which removed image files can be deleted
      var inUse = {};
      S.data.gallery.forEach(function (it) { inUse[it.full] = 1; inUse[it.thumb] = 1; });
      var wanted = [];
      S.removed.forEach(function (r) { [r.full, r.thumb].forEach(function (p) { if (safeImg(p) && !inUse[p] && wanted.indexOf(p) === -1) wanted.push(p); }); });
      if (!wanted.length) return;
      logLine("Cleaning up removed photos…");
      return gh("GET", rp("/git/ref/heads/" + encodeURIComponent(S.branch))).then(function (ref) {
        return gh("GET", rp("/git/commits/" + ref.object.sha));
      }).then(function (c) {
        return gh("GET", rp("/git/trees/" + c.tree.sha + "?recursive=1"));
      }).then(function (t) {
        if (t.truncated) return;
        var existing = {}; (t.tree || []).forEach(function (n) { existing[n.path] = 1; });
        deletions = wanted.filter(function (p) { return existing[p]; });
      }).catch(function () { /* cleanup is best-effort */ });
    }).then(function () {
      var added = pendingIds.length, removed = S.removed.length;
      if (added) summary.push("+" + added + " photo" + (added === 1 ? "" : "s"));
      if (removed) summary.push("-" + removed + " photo" + (removed === 1 ? "" : "s"));
      logLine("Committing to GitHub…");
      return commitAtomic(entries, deletions, "Dashboard: update site content" + (summary.length ? " (" + summary.join(", ") + ")" : ""));
    }).then(function () {
      resetOriginal(); S.pending = {}; S.removed = [];
      renderGallery(); updateStatus();
      $$("#pub-log li").forEach(function (li) { li.classList.add("ok"); });
      logLine("Published! GitHub Pages will update the live site in about 1–2 minutes.", "ok");
      endModal("Published");
    }).catch(function (err) {
      if (err && err.cancelled) { logLine(err.message, "fail"); endModal("Cancelled"); }
      else { logLine(friendly(err), "fail"); endModal("Publishing failed"); }
      updateStatus();
    });
  }
  $("#btn-publish").addEventListener("click", publish);

  $("#btn-discard").addEventListener("click", function () {
    if (!confirm("Discard all unpublished changes and reload the published version?")) return;
    Object.keys(S.pending).forEach(function (id) { if (S.previews[id]) { URL.revokeObjectURL(S.previews[id]); delete S.previews[id]; } });
    readJsonFile().then(function (raw) {
      S.data = normalize(raw); S.pending = {}; S.removed = []; resetOriginal(); renderAll(); toast("Changes discarded.");
    }).catch(function (ex) { toast(friendly(ex), true); });
  });

  /* ---------- boot ---------- */
  if (!window.crypto || !crypto.subtle) {
    $("#login-error").textContent = "This page needs a secure (https) connection to work.";
    show("login");
  } else {
    show(getStore() ? "login" : "setup");
  }
})();
