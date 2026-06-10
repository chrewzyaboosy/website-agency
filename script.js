/* =================================================================
   MORTAR WEB — site behavior
   -----------------------------------------------------------------
   Everything here is progressive enhancement: with JS disabled the
   page still reads, the form still posts, and the FAQ still opens.
   No third-party trackers, no eval, no inline handlers tied to data.
   ================================================================= */
(function () {
  "use strict";

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Footer year ---- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* =============================================================
     NAV — scrolled state, mobile menu toggle
     ============================================================= */
  var nav = document.querySelector(".nav");
  var navToggle = document.getElementById("navToggle");
  var mobileMenu = document.getElementById("mobileMenu");

  function onScrollNav() {
    if (!nav) return;
    nav.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScrollNav, { passive: true });
  onScrollNav();

  function closeMenu() {
    if (!mobileMenu || !navToggle) return;
    mobileMenu.hidden = true;
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Open menu");
  }
  function openMenu() {
    if (!mobileMenu || !navToggle) return;
    mobileMenu.hidden = false;
    navToggle.setAttribute("aria-expanded", "true");
    navToggle.setAttribute("aria-label", "Close menu");
  }
  if (navToggle && mobileMenu) {
    navToggle.addEventListener("click", function () {
      if (mobileMenu.hidden) openMenu(); else closeMenu();
    });
    // Close after picking a link
    mobileMenu.addEventListener("click", function (e) {
      if (e.target.closest("a")) closeMenu();
    });
    // Close on Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !mobileMenu.hidden) {
        closeMenu();
        navToggle.focus();
      }
    });
    // If resized up to desktop, ensure menu is closed/clean
    window.matchMedia("(min-width: 860px)").addEventListener("change", function (ev) {
      if (ev.matches) closeMenu();
    });
  }

  /* =============================================================
     ACTIVE SECTION HIGHLIGHT (nav links follow scroll position)
     ============================================================= */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav__link"));
  var sectionMap = {};
  navLinks.forEach(function (link) {
    var id = link.getAttribute("href");
    if (id && id.charAt(0) === "#") {
      var sec = document.querySelector(id);
      if (sec) sectionMap[id] = { link: link, section: sec };
    }
  });
  var sectionEls = Object.keys(sectionMap).map(function (k) { return sectionMap[k].section; });

  if ("IntersectionObserver" in window && sectionEls.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (l) { l.classList.remove("is-active"); });
        var active = sectionMap["#" + entry.target.id];
        if (active) active.link.classList.add("is-active");
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
    sectionEls.forEach(function (s) { spy.observe(s); });
  }

  /* =============================================================
     SCROLL REVEAL (only animates if motion is allowed)
     ============================================================= */
  var revealEls = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
  if (!prefersReduced && "IntersectionObserver" in window && revealEls.length) {
    document.documentElement.classList.add("js-anim");

    // Small stagger between siblings that reveal together (capped at 6 steps).
    var staggerParents = [], staggerCounts = [];
    revealEls.forEach(function (el) {
      var p = el.parentElement || document.body;
      var i = staggerParents.indexOf(p);
      if (i === -1) { staggerParents.push(p); staggerCounts.push(0); i = staggerParents.length - 1; }
      el.style.setProperty("--rd", Math.min(staggerCounts[i]++, 5) * 70 + "ms");
    });

    var revealObs = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          el.classList.add("is-in");
          obs.unobserve(el);
          // Once the entrance finishes, drop the reveal styling so each
          // component's own hover transitions take over cleanly.
          setTimeout(function () {
            el.classList.remove("reveal", "is-in");
            el.style.removeProperty("--rd");
          }, 1100);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    revealEls.forEach(function (el) { revealObs.observe(el); });
  }
  // If JS runs but motion is reduced / no IO, .reveal stays fully visible.

  /* =============================================================
     FLOATING MOBILE CTA — appear after leaving the hero
     ============================================================= */
  var mobileCta = document.querySelector(".mobile-cta");
  if (mobileCta) {
    function onScrollCta() {
      var show = window.scrollY > window.innerHeight * 0.35;
      mobileCta.classList.toggle("is-visible", show);
    }
    window.addEventListener("scroll", onScrollCta, { passive: true });
    onScrollCta();
  }

  /* =============================================================
     INSTANT ESTIMATE WIDGET
     Pure front-end math driven off the published tiers.
     ============================================================= */
  var estForm = document.getElementById("estimateForm");
  var estOnce = document.getElementById("estOnce");
  var estMonthlyVal = document.getElementById("estMonthlyVal");
  var estimateCta = document.getElementById("estimateCta");

  var BASE = {
    launch: { once: 490,  mo: 99,  label: "Single-page" },
    growth: { once: 1190, mo: 199, label: "Multi-section" },
    engine: { once: 2490, mo: 299, label: "Full site" }
  };

  function money(n) { return "$" + n.toLocaleString("en-US"); }

  function computeEstimate() {
    if (!estForm) return null;
    var typeInput = estForm.querySelector('input[name="siteType"]:checked');
    var type = typeInput ? typeInput.value : "launch";
    var base = BASE[type] || BASE.launch;

    var once = base.once;
    var mo = base.mo;
    var addonLabels = [];

    var checks = estForm.querySelectorAll('input[name="addon"]:checked');
    Array.prototype.forEach.call(checks, function (c) {
      once += parseInt(c.getAttribute("data-once"), 10) || 0;
      mo += parseInt(c.getAttribute("data-mo"), 10) || 0;
      var nameEl = c.parentElement.querySelector(".opt__name");
      if (nameEl) addonLabels.push(nameEl.textContent.trim());
    });

    // Present as an honest range (final quote after a call).
    var onceHigh = Math.round((once * 1.2) / 10) * 10;
    var moHigh = Math.round((mo * 1.2) / 10) * 10;

    return {
      type: base.label,
      onceLow: once, onceHigh: onceHigh,
      moLow: mo, moHigh: moHigh,
      addons: addonLabels
    };
  }

  function renderEstimate() {
    var e = computeEstimate();
    if (!e) return;
    // textContent only — no innerHTML anywhere, so there is no HTML-injection
    // sink even though these values are author-controlled numbers.
    if (estOnce) estOnce.textContent = money(e.onceLow) + " – " + money(e.onceHigh);
    if (estMonthlyVal) estMonthlyVal.textContent = money(e.moLow) + " – " + money(e.moHigh);
  }

  if (estForm) {
    estForm.addEventListener("change", renderEstimate);
    renderEstimate();

    // CTA carries the chosen estimate into the lead form.
    if (estimateCta) {
      estimateCta.addEventListener("click", function () {
        var e = computeEstimate();
        if (!e) return;
        var need = document.getElementById("need");
        var msg = document.getElementById("message");
        if (need) {
          // Map estimate to the closest dropdown option.
          need.value = e.addons.length ? "Website + automation" : "New website";
        }
        if (msg && !msg.value.trim()) {
          var line = "I'm interested in the " + e.type + " option (" +
            money(e.onceLow) + "–" + money(e.onceHigh) + " one-time, " +
            money(e.moLow) + "–" + money(e.moHigh) + "/mo care)";
          if (e.addons.length) line += ", plus: " + e.addons.join(", ");
          msg.value = line + ".";
        }
      });
    }
  }

  /* =============================================================
     PRICING TIER CTAs — preselect the matching need
     ============================================================= */
  Array.prototype.forEach.call(document.querySelectorAll(".tier__cta[data-plan]"), function (btn) {
    btn.addEventListener("click", function () {
      var need = document.getElementById("need");
      var msg = document.getElementById("message");
      var plan = btn.getAttribute("data-plan");
      if (need && need.value === "") need.value = "New website";
      if (msg && !msg.value.trim()) {
        msg.value = "I'd like to go with the " + plan + " plan.";
      }
    });
  });

  /* =============================================================
     LEAD FORM — validation, sanitize, honeypot, throttle, states
     ============================================================= */
  var form = document.getElementById("leadForm");
  if (!form) return;

  var submitBtn = document.getElementById("leadSubmit");
  var statusEl = document.getElementById("formStatus");
  var formLoadedAt = Date.now();
  var lastSubmitAt = 0;

  // Trim + cap stray whitespace; basic length guard mirrors maxlength.
  function clean(value, max) {
    var v = (value == null ? "" : String(value)).replace(/\s+/g, " ").trim();
    if (max && v.length > max) v = v.slice(0, max);
    return v;
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setError(name, message) {
    var field = form.querySelector('[name="' + name + '"]');
    if (!field) return;
    var wrap = field.closest(".field");
    var errEl = form.querySelector('[data-error-for="' + name + '"]');
    if (wrap) wrap.classList.toggle("is-invalid", !!message);
    // textContent is inherently XSS-safe; messages are static strings.
    if (errEl) errEl.textContent = message || "";
    if (field) field.setAttribute("aria-invalid", message ? "true" : "false");
  }

  // NOTE: use form.elements[...] — `form.name` would return the form's
  // name attribute (a built-in HTMLFormElement property), not the input.
  function el(n) { return form.elements[n]; }

  function validate() {
    var ok = true;
    var name = clean(el("name").value, 80);
    var email = clean(el("email").value, 120);
    var need = el("need").value;

    if (!name) { setError("name", "Please tell me your name."); ok = false; }
    else setError("name", "");

    if (!email) { setError("email", "An email so I can reply."); ok = false; }
    else if (!EMAIL_RE.test(email)) { setError("email", "That email doesn't look right."); ok = false; }
    else setError("email", "");

    if (!need) { setError("need", "Pick what you need."); ok = false; }
    else setError("need", "");

    return ok;
  }

  // Live-clear errors as the user fixes them.
  form.addEventListener("input", function (e) {
    var t = e.target;
    if (t && t.name && t.closest(".field.is-invalid")) {
      setError(t.name, "");
    }
  });

  function showStatus(kind, message) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.className = "form-status is-" + kind;
    statusEl.textContent = message; // textContent — never innerHTML for user/network text
  }

  function setSending(on) {
    form.classList.toggle("is-sending", on);
    if (submitBtn) {
      submitBtn.disabled = on;
      var txt = submitBtn.querySelector(".lead-form__submit-text");
      if (txt) txt.textContent = on ? "Sending…" : "Send my free quote request";
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    // --- Honeypot: real users never fill this hidden field ---
    if (el("company_url") && el("company_url").value.trim() !== "") {
      // Pretend success so bots don't learn anything.
      showStatus("success", "Thanks! Your message is on its way.");
      return;
    }

    // --- Throttle: block instant bot submits & rapid double-fires ---
    var now = Date.now();
    if (now - formLoadedAt < 2500) {
      showStatus("error", "That was quick — give it a moment and try again.");
      return;
    }
    if (now - lastSubmitAt < 4000) {
      return; // ignore accidental double submit
    }

    if (!validate()) {
      showStatus("error", "Please fix the highlighted fields.");
      var firstBad = form.querySelector(".field.is-invalid input, .field.is-invalid select, .field.is-invalid textarea");
      if (firstBad) firstBad.focus();
      return;
    }

    lastSubmitAt = now;

    // Build a sanitized payload (we never lose the user's typed data).
    var payload = {
      name: clean(el("name").value, 80),
      email: clean(el("email").value, 120),
      phone: clean(el("phone").value, 25),
      business: clean(el("business").value, 100),
      need: el("need").value,
      message: clean(el("message").value, 1200),
      _subject: "New quote request from the Mortar Web site"
    };

    // --- Pre-filled email fallback: a lead is NEVER silently lost. ---
    var FALLBACK_EMAIL = "hello@mortarweb.com";
    var fallbackWrap = document.getElementById("formFallback");
    var fallbackLink = document.getElementById("formFallbackLink");
    function buildMailto() {
      var body = [
        "Name: " + payload.name,
        "Email: " + payload.email,
        "Phone: " + (payload.phone || "—"),
        "Business: " + (payload.business || "—"),
        "Looking for: " + payload.need,
        "",
        payload.message || "(no extra details)"
      ].join("\n");
      return "mailto:" + FALLBACK_EMAIL +
        "?subject=" + encodeURIComponent(payload._subject) +
        "&body=" + encodeURIComponent(body);
    }
    function showFallback() {
      if (fallbackLink) fallbackLink.setAttribute("href", buildMailto());
      if (fallbackWrap) fallbackWrap.hidden = false;
    }
    function hideFallback() { if (fallbackWrap) fallbackWrap.hidden = true; }
    hideFallback();

    // --- Choose a delivery method from the form's own attributes. ---
    // Netlify Forms works zero-config (data-netlify="true"); to use Formspree
    // instead, set the form's action to your Formspree URL.
    var action = form.getAttribute("action") || "";
    var toFormspree = action.indexOf("formspree.io") !== -1 && !/YOUR_FORM_ID|YOUR_ID/.test(action);
    var toFormSubmit = action.indexOf("formsubmit.co") !== -1;
    var toNetlify = form.getAttribute("data-netlify") === "true";

    // No backend wired up at all → go straight to the email fallback.
    if (!toFormspree && !toFormSubmit && !toNetlify) {
      setSending(false);
      showStatus("error", "Email is the fastest way to reach us right now — tap below and your details are already filled in.");
      showFallback();
      return;
    }

    setSending(true);
    showStatus("success", "Sending…");

    var request;
    if (toFormspree || toFormSubmit) {
      var url = action;
      if (toFormSubmit && action.indexOf("/ajax/") === -1) {
        // FormSubmit's JSON endpoint lives under /ajax/<email>
        url = action.replace("formsubmit.co/", "formsubmit.co/ajax/");
        payload._template = "table";
        payload._captcha = "false";
      }
      request = fetch(url, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      // Netlify Forms: url-encoded POST to the current path, including form-name.
      var fields = {
        "form-name": "contact",
        name: payload.name, email: payload.email, phone: payload.phone,
        business: payload.business, need: payload.need, message: payload.message
      };
      var encoded = Object.keys(fields).map(function (k) {
        return encodeURIComponent(k) + "=" + encodeURIComponent(fields[k]);
      }).join("&");
      request = fetch(action || "/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encoded
      });
    }

    request
      .then(function (res) {
        // FormSubmit can answer 200 with success:"false" (e.g. before the
        // one-time activation click) — treat that as a failure too.
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok || (toFormSubmit && data && String(data.success) === "false")) {
            throw new Error("Bad response " + res.status);
          }
          return data;
        });
      })
      .then(function () {
        setSending(false);
        form.reset();
        if (typeof renderEstimate === "function") renderEstimate();
        showStatus("success", "Thanks — got it! We'll reply within one business day.");
      })
      .catch(function () {
        setSending(false);
        // Data is preserved (we never reset on failure) and we surface a
        // one-tap, pre-filled email so the lead is never lost.
        showStatus("error", "Couldn't send that automatically. Tap below to email it instead — your details are already filled in.");
        showFallback();
      });
  });
})();

/* =================================================================
   IMAGE SKELETON LOADERS
   Fade each image in once it loads; if it fails, hide it and stop
   the shimmer so the themed background shows (no broken-image icon).
   ================================================================= */
(function () {
  "use strict";
  function markLoaded(img) {
    img.classList.add("is-loaded");
    var m = img.closest(".media");
    if (m) m.classList.add("is-loaded");
  }
  function markFailed(img) {
    img.classList.add("is-failed");
    var m = img.closest(".media");
    if (m) m.classList.add("is-failed");
  }
  var imgs = document.querySelectorAll(".ph-img");
  Array.prototype.forEach.call(imgs, function (img) {
    if (img.complete) {
      if (img.naturalWidth > 0) markLoaded(img);
      else markFailed(img);
    }
    img.addEventListener("load", function () { markLoaded(img); });
    img.addEventListener("error", function () { markFailed(img); });
  });
})();

/* =================================================================
   SCROLL PROGRESS BAR
   ================================================================= */
(function () {
  "use strict";
  var bar = document.getElementById("scrollProgress");
  if (!bar) return;
  function update() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    var top = h.scrollTop || window.pageYOffset || 0;
    bar.style.width = (max > 0 ? (top / max) * 100 : 0) + "%";
  }
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
})();

/* =================================================================
   LIVE MOCKUP GENERATOR — type a name + pick a trade, see a preview
   ================================================================= */
(function () {
  "use strict";
  var TYPES = {
    contractor: { tag: "Licensed & insured · Milwaukee", btn: "Get a free quote" },
    restaurant: { tag: "Wood-fired · Local favorite", btn: "Reserve a table" },
    salon:      { tag: "Book your chair in seconds", btn: "Book now" },
    gym:        { tag: "Train with the best in town", btn: "Start free trial" },
    dentist:    { tag: "Gentle, modern dental care", btn: "Book a visit" },
    cafe:       { tag: "Coffee, done right", btn: "See the menu" }
  };
  var nameEl = document.getElementById("bizName");
  if (!nameEl) return;
  var urlEl = document.getElementById("bzUrl");
  var screenEl = document.getElementById("bzScreen");
  var tagEl = document.getElementById("bzTag");
  var titleEl = document.getElementById("bzTitle");
  var btnEl = document.getElementById("bzBtn");
  var ctaEl = document.getElementById("builderCta");
  var chips = document.querySelectorAll(".builder__chips .chip");
  var current = "contractor";

  function slug(s) {
    s = (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24);
    return (s || "yourbusiness") + ".com";
  }
  function updateText() {
    var name = (nameEl.value || "").trim();
    if (titleEl) titleEl.textContent = name || "Your Business";
    if (urlEl) urlEl.textContent = slug(name);
  }
  function updateType(t) {
    current = TYPES[t] ? t : "contractor";
    var d = TYPES[current];
    if (tagEl) tagEl.textContent = d.tag;
    if (btnEl) btnEl.textContent = d.btn;
    // Re-theme the vector preview (palette + industry icon via CSS) —
    // instant, on-brand, and no image request at all.
    if (screenEl) screenEl.setAttribute("data-industry", current);
  }
  nameEl.addEventListener("input", updateText);
  Array.prototype.forEach.call(chips, function (chip) {
    chip.addEventListener("click", function () {
      Array.prototype.forEach.call(chips, function (c) { c.classList.remove("is-active"); });
      chip.classList.add("is-active");
      updateType(chip.getAttribute("data-type"));
    });
  });
  if (ctaEl) {
    ctaEl.addEventListener("click", function () {
      var name = (nameEl.value || "").trim();
      var need = document.getElementById("need");
      var msg = document.getElementById("message");
      var biz = document.getElementById("business");
      if (biz && name && !biz.value) biz.value = name;
      if (need && !need.value) need.value = "New website";
      if (msg && !msg.value.trim()) {
        msg.value = "I tried the live preview" + (name ? " for " + name : "") + " (" + current + ") and I'd like one built.";
      }
    });
  }
  updateText();
})();

/* =================================================================
   WEBSITE GRADER — 5 quick questions -> score + tailored CTA
   ================================================================= */
(function () {
  "use strict";
  var form = document.getElementById("graderForm");
  if (!form) return;
  var go = document.getElementById("graderGo");
  var result = document.getElementById("graderResult");
  var scoreEl = document.getElementById("graderScore");
  var verdictEl = document.getElementById("graderVerdict");
  var ctaEl = document.getElementById("graderCta");
  var opts = form.querySelectorAll(".grader__opt");
  var answers = {};

  function total() { var r = 0; for (var k in answers) r += answers[k]; return r * 20; }

  Array.prototype.forEach.call(opts, function (opt) {
    opt.addEventListener("click", function () {
      var q = opt.getAttribute("data-q");
      Array.prototype.forEach.call(form.querySelectorAll('.grader__opt[data-q="' + q + '"]'), function (o) {
        o.classList.remove("is-sel"); o.setAttribute("aria-pressed", "false");
      });
      opt.classList.add("is-sel"); opt.setAttribute("aria-pressed", "true");
      answers[q] = parseInt(opt.getAttribute("data-val"), 10) || 0;
      if (go && Object.keys(answers).length >= 5) go.disabled = false;
    });
  });

  function verdict(score) {
    if (score >= 80) return "Strong foundation — but there's still room to turn more visitors into calls. A few tweaks could tip it.";
    if (score >= 50) return "Leaky. You're likely losing inquiries every week to slow load times, missing calls-to-action, or no follow-up. Very fixable.";
    return "Your website is quietly costing you customers. The good news: this is exactly what we fix — usually within a week.";
  }

  if (go) go.addEventListener("click", function () {
    if (Object.keys(answers).length < 5) return;
    var score = total();
    result.hidden = false;
    verdictEl.textContent = verdict(score);
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { scoreEl.textContent = score; }
    else {
      var n = 0, step = Math.max(1, Math.round(score / 30));
      var id = setInterval(function () {
        n += step; if (n >= score) { n = score; clearInterval(id); } scoreEl.textContent = n;
      }, 28);
    }
    result.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
  });

  if (ctaEl) ctaEl.addEventListener("click", function () {
    var need = document.getElementById("need");
    var msg = document.getElementById("message");
    if (need && !need.value) need.value = "Free website audit";
    if (msg && !msg.value.trim()) msg.value = "I scored " + total() + "/100 on the website grader — please send my free fix plan.";
  });
})();

/* =================================================================
   AI ASSISTANT — a self-contained knowledge assistant (no backend,
   no API key). Answers from a curated knowledge base built from the
   site's real info, and routes people to a quote/call. Easy to
   upgrade to a live LLM later (swap respond() for a fetch to your
   serverless endpoint).
   ================================================================= */
(function () {
  "use strict";
  var root = document.getElementById("chat");
  if (!root) return;
  var launch = document.getElementById("chatLaunch");
  var panel = document.getElementById("chatPanel");
  var closeBtn = document.getElementById("chatClose");
  var log = document.getElementById("chatLog");
  var quick = document.getElementById("chatQuick");
  var form = document.getElementById("chatForm");
  var input = document.getElementById("chatInput");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var TEL = "tel:+14146878929";
  /* REPLACE CAL with your Calendly/Cal.com URL to enable real scheduling. Until
     it's a valid https URL, the "Book a free call" action scrolls to the quote
     form instead of opening a broken page. */
  var CAL = "";
  var BOOK = /^https?:\/\//.test(CAL) ? { href: CAL } : { nav: "#contact" };
  var greeted = false;

  // ----- Knowledge base (your "fed" info). Edit freely. -----
  var KB = [
    { k: ["price","cost","much","pricing","expensive","cheap","afford","rate","fee","budget","$"],
      a: "Our pricing is flat and published: Launch is $490 one-time + $99/mo care, Growth is $1,190 + $199/mo with smart lead automation included, and Engine is $2,490 + $299/mo with the full automation suite. Every build includes a free logo, business email and Google setup — and you always own your site and can cancel anytime.",
      c: [["See full pricing", {nav: "#pricing"}], ["Build an estimate", {nav: "#estimate"}], ["Get a free quote", {nav: "#contact"}]] },
    { k: ["time","long","fast","week","quick","turnaround","launch","when","soon","days","timeline"],
      a: "Most single-page sites go live within about a week — often just a few days once we have your details. Bigger builds with automation take a little longer, and we give you an exact timeline up front.",
      c: [["Get a free quote", {nav: "#contact"}], ["See our work", {nav: "#work"}]] },
    { k: ["include","included","logo","email","google","hosting","domain","ssl","seo","copywriting","photos","what do i get","whats included"],
      a: "Every build includes a custom logo & brand kit, a professional email (you@yourbusiness.com), Google Business + Maps setup, copywriting, domain + secure hosting, photos, click-to-call & smart forms, and ongoing edits. Most agencies charge extra for all of that.",
      c: [["What's included", {nav: "#included"}], ["Pricing", {q: "pricing"}], ["Get a free quote", {nav: "#contact"}]] },
    { k: ["automation","automate","ai","auto-reply","autoreply","bot","booking","follow up","followup","lead","missed call","reply"],
      a: "Our smart lead automation replies to new inquiries in seconds, captures the details, books appointments and follows up automatically — even after hours. It's the difference between catching a customer and losing them to whoever answered first.",
      c: [["Get a free quote", {nav: "#contact"}], ["What's included?", {q: "included"}]] },
    { k: ["own","ownership","keep","mine","cancel","contract","locked","leave"],
      a: "You own everything — your site, domain and content. No long contracts; cancel the care plan anytime and keep your files. No hostage situations.",
      c: [["Pricing", {q: "pricing"}], ["Get a free quote", {nav: "#contact"}]] },
    { k: ["where","area","location","milwaukee","located","serve","local","near","wisconsin"],
      a: "We're based in Milwaukee and serve the Greater Milwaukee area and surrounding towns. If you serve local customers, we can help.",
      c: [["Get a free quote", {nav: "#contact"}], ["Call or text", {href: TEL}]] },
    { k: ["audit","grade","score","check my","review my","analyze","current site","existing site"],
      a: "Want to know how your current site stacks up? Take our free 60-second grader — five quick questions and you get a score plus what to fix first.",
      c: [["Grade my website", {nav: "#grader"}], ["Get a free quote", {nav: "#contact"}]] },
    { k: ["example","examples","demo","demos","portfolio","sample","previous","see your work","past work"],
      a: "Sure — take a look at sites we've built for a contractor, a restaurant and a salon. You can also build a live preview of your own in seconds.",
      c: [["See our work", {nav: "#work"}], ["Try the live preview", {nav: "#try"}]] },
    { k: ["book","schedule","appointment","meeting","consult","calendar","call back","15 min"],
      a: "Happy to. Book a free 15-minute call and we'll talk through exactly what you need — no pressure.",
      c: [["Book a free call", BOOK], ["Call/text us", {href: TEL}], ["Get a free quote", {nav: "#contact"}]] },
    { k: ["call","phone","number","text","reach","contact you"],
      a: "Call or text us at 414-687-8929 — a real human, usually same day. Prefer email? hello@mortarweb.com.",
      c: [["Call 414-687-8929", {href: TEL}], ["Book a 15-min call", {href: CAL}], ["Get a free quote", {nav: "#contact"}]] },
    { k: ["service","services","do you","offer","build","make me","help me","website","site"],
      a: "We do three things for local businesses: build fast, modern websites; set up smart lead automation so you never miss an inquiry; and keep it all running with a care plan (hosting, updates, monitoring).",
      c: [["Lead automation", {q: "automation"}], ["Pricing", {q: "pricing"}], ["Get a free quote", {nav: "#contact"}]] },
    { k: ["quote","start","started","hire","sign up","ready","work with","buy","purchase","get one","sign me"],
      a: "Love it. The fastest way is a free quote — tell us a bit about your business and we'll reply within one business day with honest advice and a fixed price.",
      c: [["Open the quote form", {nav: "#contact"}], ["Try the live preview", {nav: "#try"}], ["Call/text us", {href: TEL}]] },
    { k: ["human","person","real","agent","someone","talk to","manager","owner"],
      a: "Of course — you'll always deal with a real person here. Call or text 414-687-8929, email hello@mortarweb.com, or drop your details in the quote form and we'll reach out fast.",
      c: [["Get a free quote", {nav: "#contact"}], ["Call/text", {href: TEL}]] },
    { k: ["thank","thanks","appreciate","cheers","awesome","perfect","great","cool"],
      a: "Anytime! When you're ready, a free quote is just a tap away — or call/text 414-687-8929.",
      c: [["Get a free quote", {nav: "#contact"}]] }
  ];
  var FALLBACK = {
    a: "Good question — I want to get you the right answer. The quickest way is to ask a real person: call or text 414-687-8929, or grab a free quote and we'll reply within a business day.",
    c: [["Get a free quote", {nav: "#contact"}], ["Call/text us", {href: TEL}], ["See pricing", {nav: "#pricing"}]]
  };
  var GREETING = {
    a: "Hi! 👋 I'm the Mortar Web assistant. Ask me about pricing, timelines or what's included — or I can get you a free quote. What can I help with?",
    c: [["Pricing", {q: "pricing"}], ["How fast?", {q: "timeline"}], ["What's included?", {q: "included"}], ["Get a free quote", {nav: "#contact"}]]
  };

  function match(text) {
    var t = " " + text.toLowerCase() + " ";
    var best = null, bestScore = 0;
    KB.forEach(function (item) {
      var score = 0;
      item.k.forEach(function (kw) { if (t.indexOf(kw) !== -1) score += kw.length > 4 ? 2 : 1; });
      if (score > bestScore) { bestScore = score; best = item; }
    });
    return bestScore > 0 ? best : FALLBACK;
  }

  function scrollLog() { log.scrollTop = log.scrollHeight; }
  function clearEl(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function addMsg(role, text) {
    var el = document.createElement("div");
    el.className = "chat__msg chat__msg--" + role;
    el.textContent = text;
    log.appendChild(el);
    scrollLog();
  }

  function renderChips(chips) {
    clearEl(quick);
    (chips || []).forEach(function (c) {
      var label = c[0], action = c[1];
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chat__chip";
      b.textContent = label;
      b.addEventListener("click", function () {
        if (action.q) { handleUser(label, action.q); }
        else if (action.nav) { closeChat(); var el = document.querySelector(action.nav); if (el) el.scrollIntoView({ behavior: reduced ? "auto" : "smooth" }); }
        else if (action.href) { window.location.href = action.href; }
      });
      quick.appendChild(b);
    });
  }

  function botReply(item) {
    var typing = document.createElement("div");
    typing.className = "chat__typing";
    typing.appendChild(document.createElement("i"));
    typing.appendChild(document.createElement("i"));
    typing.appendChild(document.createElement("i"));
    log.appendChild(typing); scrollLog();
    clearEl(quick);
    var delay = reduced ? 0 : 480;
    setTimeout(function () {
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      addMsg("bot", item.a);
      renderChips(item.c);
    }, delay);
  }

  function handleUser(displayText, queryText) {
    addMsg("user", displayText);
    botReply(match(queryText || displayText));
  }

  function openChat() {
    panel.hidden = false;
    root.classList.add("is-open");
    launch.setAttribute("aria-expanded", "true");
    if (!greeted) { greeted = true; addMsg("bot", GREETING.a); renderChips(GREETING.c); }
    setTimeout(function () { input.focus(); }, 50);
  }
  function closeChat() {
    panel.hidden = true;
    root.classList.remove("is-open");
    launch.setAttribute("aria-expanded", "false");
  }

  launch.addEventListener("click", openChat);
  if (closeBtn) closeBtn.addEventListener("click", function () { closeChat(); launch.focus(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) { closeChat(); launch.focus(); } });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = (input.value || "").trim();
    if (!v) return;
    input.value = "";
    handleUser(v);
  });
})();

/* =================================================================
   BACK-TO-TOP BUTTON (created on every page that loads this script)
   ================================================================= */
(function () {
  "use strict";
  if (!document.body) return;
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "to-top";
  btn.setAttribute("aria-label", "Back to top");
  btn.textContent = "↑";
  document.body.appendChild(btn);
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  btn.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }); });
  function onScroll() { btn.classList.toggle("is-visible", (window.scrollY || window.pageYOffset || 0) > 600); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();

/* =================================================================
   DARK MODE TOGGLE  (theme.js already set the initial theme in <head>)
   ================================================================= */
(function () {
  "use strict";
  var root = document.documentElement;
  var navInner = document.querySelector(".nav__inner");
  if (!navInner) return;

  function isDark() { return root.getAttribute("data-theme") === "dark"; }

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "theme-toggle";

  function sync() {
    var d = isDark();
    btn.textContent = d ? "☀" : "☾";        /* ☀ / ☾ */
    btn.setAttribute("aria-label", d ? "Switch to light mode" : "Switch to dark mode");
    btn.setAttribute("aria-pressed", d ? "true" : "false");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", d ? "#14110d" : "#171311");
  }
  sync();

  btn.addEventListener("click", function () {
    var next = isDark() ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("msw-theme", next); } catch (e) { /* ignore */ }
    sync();
  });

  navInner.appendChild(btn);  /* rightmost item; hamburger's auto-margin pushes the group right */
})();
