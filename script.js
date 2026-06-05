/* =================================================================
   RIVET — site behavior
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
    var revealObs = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          obs.unobserve(entry.target);
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
      var show = window.scrollY > window.innerHeight * 0.7;
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
    starter: { once: 149, mo: 99,  label: "Single-page" },
    growth:  { once: 349, mo: 149, label: "Multi-section" },
    pro:     { once: 699, mo: 249, label: "Full site" }
  };

  function money(n) { return "$" + n.toLocaleString("en-US"); }

  function computeEstimate() {
    if (!estForm) return null;
    var typeInput = estForm.querySelector('input[name="siteType"]:checked');
    var type = typeInput ? typeInput.value : "starter";
    var base = BASE[type] || BASE.starter;

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

    var endpoint = form.getAttribute("action") || "";
    var usingPlaceholder = /YOUR_FORM_ID/.test(endpoint);

    // Build a sanitized payload (we never lose the user's typed data).
    var payload = {
      name: clean(el("name").value, 80),
      email: clean(el("email").value, 120),
      phone: clean(el("phone").value, 25),
      business: clean(el("business").value, 100),
      need: el("need").value,
      message: clean(el("message").value, 1200),
      _subject: "New quote request from the Rivet site"
    };

    // If the endpoint hasn't been configured yet, fail gracefully
    // instead of POSTing to a dead URL — and keep the user's data.
    if (usingPlaceholder) {
      setSending(false);
      showStatus("error",
        "Form isn't connected yet. Add your Formspree/Netlify endpoint (see README), or email hello@clearroutecarrier.com.");
      return;
    }

    setSending(true);
    showStatus("success", "Sending…");

    fetch(endpoint, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (res.ok) return res.json().catch(function () { return {}; });
        throw new Error("Bad response " + res.status);
      })
      .then(function () {
        setSending(false);
        form.reset();
        renderEstimate();
        showStatus("success", "Thanks — got it! I'll reply within one business day.");
      })
      .catch(function () {
        setSending(false);
        // Data is preserved (we never reset on failure).
        showStatus("error",
          "Something went wrong sending that. Please try again, or email hello@clearroutecarrier.com directly.");
      });
  });
})();
