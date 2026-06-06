/* =================================================================
   Main Street Web — React + Tailwind (no build step)
   -----------------------------------------------------------------
   Uses React + htm (Hyperscript Tagged Markup) so there's no JSX
   compile step and no eval. Tailwind is loaded via the Play CDN.
   Note: React props use camelCase (className, htmlFor) — htm forwards
   them straight to React.createElement. To move to a production build
   later, paste these components into a Vite + React + Tailwind app.
   ================================================================= */
(function () {
  "use strict";

  var html = htm.bind(React.createElement);
  var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef;
  var Fragment = React.Fragment;

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var PHONE = "414-687-8929";
  var TEL = "tel:+14146878929";
  var EMAIL = "hello@clearroutecarrier.com";
  /* REPLACE: your form endpoint (Formspree id or Netlify). No secrets here. */
  var FORM_ENDPOINT = "https://formspree.io/f/YOUR_FORM_ID";

  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(" "); }
  function money(n) { return "$" + n.toLocaleString("en-US"); }

  /* ---------- Hooks ---------- */
  function useScrolled(threshold) {
    var t = threshold || 8;
    var s = useState(false), val = s[0], set = s[1];
    useEffect(function () {
      var on = function () { set(window.scrollY > t); };
      on();
      window.addEventListener("scroll", on, { passive: true });
      return function () { window.removeEventListener("scroll", on); };
    }, []);
    return val;
  }

  function useScrollSpy(ids) {
    var s = useState(""), active = s[0], set = s[1];
    useEffect(function () {
      if (!("IntersectionObserver" in window)) return;
      var els = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) set(e.target.id); });
      }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
      els.forEach(function (el) { io.observe(el); });
      return function () { io.disconnect(); };
    }, []);
    return active;
  }

  /* ---------- Reveal-on-scroll wrapper (tasteful fade + rise) ---------- */
  function Reveal(props) {
    var Tag = props.tag || "div";
    var ref = useRef(null);
    var s = useState(REDUCED), shown = s[0], set = s[1];
    useEffect(function () {
      if (REDUCED || !("IntersectionObserver" in window)) { set(true); return; }
      var el = ref.current; if (!el) { set(true); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { set(true); io.disconnect(); } });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
      io.observe(el);
      return function () { io.disconnect(); };
    }, []);
    var rest = {};
    for (var k in props) {
      if (["tag", "delay", "className", "children", "style"].indexOf(k) === -1) rest[k] = props[k];
    }
    return html`<${Tag} ref=${ref} ...${rest}
      style=${{ transitionDelay: (shown && props.delay) ? props.delay + "ms" : "0ms" }}
      className=${cx(
        "transition-all duration-700 ease-out will-change-transform motion-reduce:transition-none",
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        props.className
      )}>${props.children}<//>`;
  }

  /* ---------- Image with graceful fallback ---------- */
  function Img(props) {
    var s = useState(false), failed = s[0], set = s[1];
    if (failed) return null;
    return html`<img src=${props.src} alt=${props.alt || ""}
      loading=${props.eager ? "eager" : "lazy"} decoding="async"
      onError=${function () { set(true); }} className=${props.className} />`;
  }

  /* ---------- Button ---------- */
  function Btn(props) {
    var base = "inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all duration-200 whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
    var sizes = { md: "px-5 py-3 text-[0.97rem]", lg: "px-7 py-3.5 text-base" };
    var variants = {
      accent: "bg-accent text-white hover:bg-accentDeep hover:-translate-y-0.5 shadow-sm hover:shadow-xl shadow-black/10",
      ghost: "border-2 border-white/30 text-paper hover:border-white hover:bg-white/5 hover:-translate-y-0.5",
      outline: "border-2 border-ink text-ink hover:bg-ink hover:text-paper hover:-translate-y-0.5",
      outlineLight: "border-2 border-white/40 text-paper hover:bg-paper hover:text-ink hover:-translate-y-0.5"
    };
    return html`<a href=${props.href || "#"} onClick=${props.onClick}
      className=${cx(base, sizes[props.size || "md"], variants[props.variant || "accent"], props.className)}>${props.children}</a>`;
  }

  function Kicker(props) {
    return html`<p className=${cx("inline-flex items-center gap-2.5 text-[0.78rem] font-semibold uppercase tracking-[0.16em]", props.light ? "text-accentBright" : "text-accentDeep", props.className)}>
      <span className=${cx("inline-block h-0.5 w-5", props.light ? "bg-accentBright" : "bg-accent")}></span>${props.children}</p>`;
  }

  function Icon(props) {
    var paths = {
      monitor: html`<${Fragment}><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 8h18M8 21h8M12 18v3"/><//>`,
      bolt: html`<${Fragment}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.4"/><//>`,
      shield: html`<${Fragment}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9.3 12l1.8 1.8 3.6-3.7"/><//>`,
      phone: html`<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>`
    };
    return html`<svg viewBox="0 0 24 24" width=${props.size || 24} height=${props.size || 24} fill="none"
      stroke="currentColor" strokeWidth=${props.sw || 1.7} strokeLinecap="round" strokeLinejoin="round"
      className=${props.className} aria-hidden="true">${paths[props.name]}</svg>`;
  }

  /* =============================================================
     NAV
     ============================================================= */
  var NAV_LINKS = [
    { href: "#services", label: "Services", id: "services" },
    { href: "#work", label: "Our Work", id: "work" },
    { href: "#pricing", label: "Pricing", id: "pricing" },
    { href: "#reviews", label: "Reviews", id: "reviews" },
    { href: "#faq", label: "FAQ", id: "faq" }
  ];

  function Brand(props) {
    return html`<a href="#top" aria-label="Main Street Web — home" className=${cx("inline-flex items-center gap-2.5 font-bold tracking-tight", props.className)}>
      <span className="h-3.5 w-3.5 rounded-full bg-accent shadow-[0_0_0_4px_rgba(204,61,24,0.18)]" aria-hidden="true"></span>
      <span className="whitespace-nowrap text-[1.2rem] leading-none">Main Street Web</span>
    </a>`;
  }

  function Nav() {
    var scrolled = useScrolled(8);
    var o = useState(false), isOpen = o[0], setOpen = o[1];
    var active = useScrollSpy(["services", "work", "pricing", "reviews", "faq"]);

    useEffect(function () {
      function onKey(e) { if (e.key === "Escape") setOpen(false); }
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("keydown", onKey); };
    }, []);

    return html`<header id="top" className=${cx(
      "sticky top-0 z-50 transition-all duration-300 backdrop-blur-md",
      scrolled ? "bg-paper/90 border-b border-line shadow-sm" : "bg-paper/70 border-b border-transparent"
    )}>
      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
        <div className="flex items-center gap-5 min-h-[68px]">
          <${Brand} />
          <nav className="ml-auto hidden lg:flex items-center gap-1" aria-label="Primary">
            ${NAV_LINKS.map(function (l) {
              var on = active === l.id;
              return html`<a key=${l.id} href=${l.href}
                className=${cx("relative px-3 py-2 rounded-lg text-[0.96rem] font-medium transition-colors",
                  on ? "text-accentDeep" : "text-ink hover:text-accentDeep")}>
                ${l.label}
                ${on ? html`<span className="absolute left-3 right-3 bottom-0.5 h-0.5 rounded bg-accent"></span>` : null}
              </a>`;
            })}
          </nav>
          <a href=${TEL} className="hidden lg:inline-flex items-center gap-2 text-[0.95rem] font-semibold text-ink hover:text-accentDeep transition-colors" aria-label=${"Call or text " + PHONE}>
            <${Icon} name="phone" size=${16} sw=${1.9} /> <span>${PHONE}</span>
          </a>
          <${Btn} href="#contact" className="hidden sm:inline-flex">Get a Free Quote<//>

          <button onClick=${function () { setOpen(!isOpen); }}
            className="lg:hidden ml-auto inline-flex flex-col justify-center gap-[5px] w-11 h-11 p-2.5 rounded-[10px] border border-line"
            aria-expanded=${isOpen} aria-controls="mobileMenu" aria-label=${isOpen ? "Close menu" : "Open menu"}>
            <span className=${cx("block h-0.5 w-full bg-ink rounded transition-transform duration-300", isOpen && "translate-y-[7px] rotate-45")}></span>
            <span className=${cx("block h-0.5 w-full bg-ink rounded transition-opacity duration-200", isOpen && "opacity-0")}></span>
            <span className=${cx("block h-0.5 w-full bg-ink rounded transition-transform duration-300", isOpen && "-translate-y-[7px] -rotate-45")}></span>
          </button>
        </div>
      </div>

      <div id="mobileMenu" className=${cx("lg:hidden overflow-hidden border-t transition-all duration-300",
        isOpen ? "max-h-[480px] border-line" : "max-h-0 border-transparent")}>
        <nav className="flex flex-col px-5 sm:px-8 pb-5 pt-2" aria-label="Mobile">
          ${NAV_LINKS.map(function (l) {
            return html`<a key=${l.id} href=${l.href} onClick=${function () { setOpen(false); }}
              className="py-3.5 px-1 border-b border-line text-[1.08rem] font-medium">${l.label}</a>`;
          })}
          <a href=${TEL} onClick=${function () { setOpen(false); }} className="py-3.5 px-1 border-b border-line text-[1.08rem] font-medium text-accentDeep">📞 Call or text ${PHONE}</a>
          <${Btn} href="#contact" className="mt-4" onClick=${function () { setOpen(false); }}>Get a Free Quote<//>
        </nav>
      </div>
    </header>`;
  }

  /* =============================================================
     HERO
     ============================================================= */
  function Hero() {
    return html`<section className="relative overflow-hidden bg-ink text-paper isolate">
      <div className="pointer-events-none absolute inset-y-0 right-[-10%] w-[min(58vw,620px)] text-paper/40 z-0" aria-hidden="true">
        <svg viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
          <path d="M40 560 C 200 520, 220 300, 360 280 S 540 180, 560 40" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="6 10" opacity="0.5"/>
          <circle cx="40" cy="560" r="7" fill="rgba(247,244,239,.35)"/>
          <circle cx="360" cy="280" r="9" fill="#f0673c"/>
          <circle cx="560" cy="40" r="11" fill="#f0673c"/>
        </svg>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1120px] px-5 sm:px-8 py-16 sm:py-20 lg:py-28">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-10 items-center">
          <div>
            <${Reveal} tag="p" delay=${0} className="inline-flex items-center gap-2.5 text-[0.82rem] font-medium text-mutedDk border border-white/15 rounded-full px-3.5 py-1.5 mb-6">
              <span className="h-2 w-2 rounded-full bg-accentBright shadow-[0_0_0_4px_rgba(240,103,60,0.22)]"></span>
              Web &amp; AI studio · Greater Milwaukee
            <//>
            <${Reveal} tag="h1" delay=${80} className="text-[2.3rem] leading-[1.05] sm:text-5xl lg:text-[4.2rem] lg:leading-[1.02] font-bold tracking-[-0.035em] mb-5">
              Your next customer is${" "}<br/>looking you up <span className="text-accentBright">right now.</span>
            <//>
            <${Reveal} tag="p" delay=${160} className="text-[1.05rem] sm:text-xl text-mutedDk max-w-[54ch] mb-8">
              We build fast, modern websites and AI automation for local businesses — so you get
              more calls, more booked jobs, and a whole lot less busywork. Most sites launch in about a week.
            <//>
            <${Reveal} delay=${240} className="flex flex-wrap gap-3.5 mb-5">
              <${Btn} href="#contact" size="lg">Get my free quote<//>
              <${Btn} href="#work" size="lg" variant="ghost">See our work<//>
            <//>
            <${Reveal} tag="p" delay=${300} className="text-mutedDk text-[0.95rem] mb-8">
              Prefer to talk? Call or text <a href=${TEL} className="text-accentBright font-semibold underline-offset-2 hover:underline">${PHONE}</a> — real human, same day.
            <//>
            <${Reveal} tag="ul" delay=${360} className="flex flex-wrap gap-x-6 gap-y-2.5 text-[0.95rem] text-mutedDk">
              ${["Launch in ~7 days", "You own your site & domain", "No long contracts"].map(function (t) {
                return html`<li key=${t} className="inline-flex items-center gap-2.5">
                  <span className="grid place-items-center h-[18px] w-[18px] rounded-full bg-accentBright/20 text-accentBright text-xs">✓</span>${t}</li>`;
              })}
            <//>
          </div>

          <${Reveal} delay=${200} className="relative hidden sm:block">
            <div className="rounded-xl overflow-hidden shadow-2xl shadow-black/40 ring-1 ring-white/10 animate-floaty">
              <div className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white/[0.06]">
                <i className="h-2 w-2 rounded-full bg-white/25"></i><i className="h-2 w-2 rounded-full bg-white/25"></i><i className="h-2 w-2 rounded-full bg-white/25"></i>
                <span className="ml-2 text-[0.7rem] text-white/40">yourbusiness.com</span>
              </div>
              <div className="relative aspect-[16/11] bg-gradient-to-br from-inkSoft to-[#3a2f28]">
                <${Img} src="https://loremflickr.com/760/520/cafe,interior?lock=3" className="absolute inset-0 w-full h-full object-cover" />
                <span className="absolute top-3 left-3 text-[0.7rem] font-bold bg-black/55 text-white rounded-full px-2.5 py-1">★★★★★ “Booked solid”</span>
                <span className="absolute bottom-3 right-3 text-[0.72rem] font-bold bg-accent text-white rounded-md px-3 py-1.5">Book now</span>
              </div>
            </div>
            <div className="absolute -bottom-8 -left-2 w-28 sm:w-32 rounded-[1.4rem] overflow-hidden shadow-2xl shadow-black/50 ring-1 ring-white/10 bg-ink animate-floatySlow">
              <div className="relative aspect-[1/2]">
                <${Img} src="https://loremflickr.com/320/640/barbershop?lock=5" className="absolute inset-0 w-full h-full object-cover" />
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[0.6rem] font-bold bg-white text-ink rounded px-2 py-1 whitespace-nowrap">Get a quote</span>
              </div>
            </div>
          <//>
        </div>
      </div>
    </section>`;
  }

  function TrustBar() {
    var items = [["~7 days", "typical launch"], ["You own it", "site, domain & content"], ["One contact", "plain English, no jargon"], ["Cancel anytime", "no long contracts"]];
    return html`<section aria-label="Why work with us" className="bg-paper2 border-b border-line">
      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8 py-7 grid grid-cols-2 md:grid-cols-4 gap-6">
        ${items.map(function (it, i) {
          return html`<${Reveal} key=${i} delay=${i * 70} className="text-center">
            <div className="text-xl font-bold tracking-tight">${it[0]}</div>
            <div className="text-[0.85rem] text-muted">${it[1]}</div>
          <//>`;
        })}
      </div>
    </section>`;
  }

  function Heading(props) {
    return html`<div className=${props.narrow ? "max-w-[760px]" : ""}>
      ${props.kicker ? html`<${Reveal}><${Kicker} light=${props.light}>${props.kicker}<//><//>` : null}
      <${Reveal} tag="h2" delay=${60} className=${cx("mt-3.5 font-bold tracking-tight text-[1.7rem] sm:text-4xl lg:text-[2.85rem] leading-[1.08] max-w-[20ch]", props.light ? "text-paper" : "text-ink")}>${props.title}<//>
      ${props.lede ? html`<${Reveal} tag="p" delay=${120} className=${cx("mt-4 max-w-[56ch] text-[1.02rem]", props.light ? "text-mutedDk" : "text-muted")}>${props.lede}<//>` : null}
    </div>`;
  }

  function Problems() {
    var data = [
      ["01", "An outdated site (or none at all)", "You get a sharp, modern site", " that loads fast, looks great on a phone, and makes you the obvious choice."],
      ["02", "Leads slip through the cracks", "Every inquiry gets caught", " — captured, auto-replied to in seconds, and followed up so no customer goes cold."],
      ["03", "Too much manual busywork", "Automation does the chasing", " — bookings, reminders, and review requests run themselves while you do the work."]
    ];
    return html`<section className="py-16 md:py-24">
      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
        <${Heading} title="If your website is quiet, you're leaving money on the table." lede="Most local businesses lose work to three silent problems. Here's what we do about each one." />
        <div className="mt-11 grid sm:grid-cols-3 gap-4 sm:gap-5">
          ${data.map(function (d, i) {
            return html`<${Reveal} key=${i} delay=${i * 90} className="bg-white border border-line rounded-2xl p-6 shadow-sm">
              <span className="text-[0.8rem] font-bold tracking-[0.1em] text-accentDeep">${d[0]}</span>
              <h3 className="text-[1.16rem] font-bold mt-2">${d[1]}</h3>
              <p className="text-accent font-bold my-2.5">↓</p>
              <p className="text-muted"><strong className="text-ink">${d[2]}</strong>${d[3]}</p>
            <//>`;
          })}
        </div>
      </div>
    </section>`;
  }

  function Services() {
    var cards = [
      { icon: "monitor", title: "Website Build", body: "A modern, fast, mobile-first site built to convert visitors into customers — not just sit there looking pretty.",
        list: ["Designed around your phone-first customers", "Clear calls-to-action that drive calls & forms", "Set up for Google & sharing out of the box"], feature: false },
      { icon: "bolt", title: "AI Automation", body: "Stop losing customers to slow replies. Automation handles the first response, so you never miss a lead again.",
        list: ["Instant auto-reply to new inquiries", "Lead capture, booking & reminders", "Automatic follow-ups & review requests"], feature: false },
      { icon: "shield", title: "Care Plan", body: "A site nobody updates or watches quietly loses customers. The care plan keeps yours fast, current, and working.",
        list: ["Hosting, security & uptime monitoring", "Updates & monthly tweaks — just ask", "One dedicated team that knows your site"], feature: true }
    ];
    return html`<section id="services" className="py-16 md:py-24 bg-paper2">
      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
        <${Heading} kicker="What we do" title="Three ways we get you more work." />
        <div className="mt-11 grid md:grid-cols-3 gap-5">
          ${cards.map(function (c, i) {
            var feat = c.feature;
            return html`<${Reveal} key=${i} delay=${i * 90}
              className=${cx("relative rounded-2xl p-7 border shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10",
                feat ? "bg-ink border-ink text-paper" : "bg-white border-line")}>
              ${feat ? html`<span className="absolute top-4 right-4 text-[0.7rem] font-bold uppercase tracking-wider bg-accent text-white px-2.5 py-1 rounded-full">The real value</span>` : null}
              <span className=${cx("inline-grid place-items-center w-[52px] h-[52px] rounded-[13px] mb-4", feat ? "bg-accentBright/15 text-accentBright" : "bg-accent/10 text-accentDeep")}>
                <${Icon} name=${c.icon} size=${28} />
              </span>
              <h3 className="text-[1.35rem] font-bold mb-2.5">${c.title}</h3>
              <p className=${cx("mb-4", feat ? "text-mutedDk" : "text-muted")}>${c.body}</p>
              <ul className="grid gap-2.5">
                ${c.list.map(function (li) {
                  return html`<li key=${li} className=${cx("relative pl-6 text-[0.96rem]", feat ? "text-mutedDk" : "text-muted")}>
                    <span className=${cx("absolute left-1 top-[0.55em] h-[7px] w-[7px] rounded-full", feat ? "bg-accentBright" : "bg-accent")}></span>${li}</li>`;
                })}
              </ul>
            <//>`;
          })}
        </div>
      </div>
    </section>`;
  }

  function Process() {
    var steps = [
      ["1", "Call", "A quick, no-pressure chat about your business and what you need. Plain English, no tech jargon."],
      ["2", "Plan", "We map out the site and any automation, with a clear price and timeline — before you commit a dollar."],
      ["3", "Build", "We build it fast and send you a preview. You give notes, we refine — usually within days."],
      ["4", "Launch & maintain", "We go live, then the care plan keeps it sharp and working while you get back to business."]
    ];
    return html`<section id="process" className="py-16 md:py-24">
      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
        <${Heading} kicker="How it works" title="Effortless on your end. That's the point." />
        <ol className="mt-11 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          ${steps.map(function (s, i) {
            return html`<${Reveal} tag="li" key=${i} delay=${i * 80} className="bg-white border border-line rounded-2xl p-6">
              <span className="inline-grid place-items-center w-[42px] h-[42px] rounded-full bg-ink text-paper font-bold text-[1.1rem] mb-3.5">${s[0]}</span>
              <h3 className="text-[1.2rem] font-bold mb-1.5">${s[1]}</h3>
              <p className="text-muted text-[0.98rem]">${s[2]}</p>
            <//>`;
          })}
        </ol>
      </div>
    </section>`;
  }

  /* ---------- Pricing + estimate + guarantee ---------- */
  var TIERS = [
    { name: "Starter", once: "$149", mo: "$99", popular: true, plan: "Starter", cta: "Start with Starter",
      desc: "A single-page site that turns lookups into leads. Perfect for getting found and getting calls.",
      list: ["One-page, mobile-first website", "Click-to-call & contact form", "Google Maps & basic SEO setup", "Care plan: hosting, updates, monitoring"] },
    { name: "Growth", once: "$349", mo: "$149", popular: false, plan: "Growth", cta: "Choose Growth",
      desc: "A multi-section site plus one AI automation to catch and reply to leads automatically.",
      list: ["Everything in Starter", "Multi-section site (services, about, gallery)", "1 AI automation (lead capture or auto-reply)", "Priority monthly tweaks"] },
    { name: "Pro", once: "$699", mo: "$249", popular: false, plan: "Pro", cta: "Go Pro",
      desc: "A full site with the works — the complete automation suite and priority support for busy operators.",
      list: ["Everything in Growth", "Full multi-page website", "Automation suite (booking, follow-ups, reviews)", "Priority support — front of the line"] }
  ];

  function Pricing(props) {
    return html`<section id="pricing" className="py-16 md:py-24 bg-ink text-paper">
      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
        <${Heading} light=${true} kicker="Pricing" title="Simple, honest pricing."
          lede=${html`Flat rates, no retainers, no surprises. The care plan is what keeps your site earning — hosting, security, updates, monitoring & monthly tweaks. <strong className="text-paper">Cancel anytime, and you always own your site.</strong>`} />

        <div className="mt-12 grid md:grid-cols-3 gap-5 items-start">
          ${TIERS.map(function (t, i) {
            return html`<${Reveal} key=${t.name} delay=${i * 90}
              className=${cx("relative flex flex-col rounded-2xl p-7 border",
                t.popular ? "bg-inkSoft border-accent shadow-[0_0_0_1px_#cc3d18,0_24px_50px_-24px_rgba(204,61,24,0.5)] lg:-translate-y-3" : "bg-inkSoft border-white/10")}>
              ${t.popular ? html`<span className="absolute -top-3 left-7 bg-accent text-white text-[0.72rem] font-bold uppercase tracking-wider px-3 py-1 rounded-full">Most Popular</span>` : null}
              <h3 className="text-[1.3rem] font-bold mb-3">${t.name}</h3>
              <p className="flex items-baseline gap-2"><span className="text-[2.5rem] font-bold tracking-tight">${t.once}</span><span className="text-mutedDk text-[0.9rem]">one-time</span></p>
              <p className="text-accentBright font-semibold mt-1"><span className="opacity-70">+</span> ${t.mo}<span className="text-mutedDk text-[0.9rem]">/mo care</span></p>
              <p className="text-mutedDk text-[0.98rem] my-4">${t.desc}</p>
              <ul className="grid gap-2.5 mb-6">
                ${t.list.map(function (li) {
                  return html`<li key=${li} className="relative pl-6 text-[0.95rem] text-paper">
                    <span className="absolute left-[3px] top-[0.5em] h-2 w-2 rounded-full bg-accentBright"></span>${li}</li>`;
                })}
              </ul>
              <${Btn} href="#contact" className="mt-auto w-full" variant=${t.popular ? "accent" : "outlineLight"}
                onClick=${function () { props.onChoose({ need: "A new website", message: "I'd like to go with the " + t.plan + " plan." }); }}>${t.cta}<//>
            <//>`;
          })}
        </div>

        <${Reveal} tag="p" className="mt-8 inline-flex items-center gap-2.5 text-mutedDk text-[0.95rem]">
          <span className="h-2 w-2 rounded-full bg-accentBright shadow-[0_0_0_4px_rgba(240,103,60,0.22)]"></span>
          We take a limited number of new builds each month so turnaround stays fast — most sites launch in about a week.
        <//>

        <${Reveal} className="mt-8 flex items-start gap-4 rounded-2xl bg-inkSoft border border-white/10 p-6">
          <span className="grid place-items-center h-12 w-12 shrink-0 rounded-xl bg-accentBright/15 text-accentBright"><${Icon} name="shield" size=${26} /></span>
          <div>
            <h3 className="text-[1.2rem] font-bold">The “love it” guarantee</h3>
            <p className="text-mutedDk mt-1">We don't stop refining until you're genuinely happy with your site — and if we haven't launched anything yet and it's not the right fit, you pay nothing. No risk, no pressure.</p>
          </div>
        <//>

        <${Estimate} onChoose=${props.onChoose} />
      </div>
    </section>`;
  }

  var BASE = { starter: { once: 149, mo: 99, label: "Single-page" }, growth: { once: 349, mo: 149, label: "Multi-section" }, pro: { once: 699, mo: 249, label: "Full site" } };
  var ADDONS = [
    { id: "autoreply", name: "Lead capture & auto-reply", once: 150, mo: 30, meta: "+$150 & $30/mo" },
    { id: "booking", name: "Online booking", once: 200, mo: 40, meta: "+$200 & $40/mo" },
    { id: "followups", name: "Follow-ups & reviews", once: 250, mo: 50, meta: "+$250 & $50/mo" },
    { id: "copy", name: "Copywriting & SEO", once: 200, mo: 0, meta: "+$200 one-time" }
  ];
  var SITE_OPTS = [
    { v: "starter", name: "Single-page", meta: "from $149 + $99/mo" },
    { v: "growth", name: "Multi-section", meta: "from $349 + $149/mo" },
    { v: "pro", name: "Full site", meta: "from $699 + $249/mo" }
  ];

  function Estimate(props) {
    var s1 = useState("starter"), site = s1[0], setSite = s1[1];
    var s2 = useState({}), picks = s2[0], setPicks = s2[1];
    var base = BASE[site], once = base.once, mo = base.mo, labels = [];
    ADDONS.forEach(function (a) { if (picks[a.id]) { once += a.once; mo += a.mo; labels.push(a.name); } });
    var onceHigh = Math.round((once * 1.2) / 10) * 10;
    var moHigh = Math.round((mo * 1.2) / 10) * 10;

    function toggle(id) { var n = Object.assign({}, picks); n[id] = !n[id]; setPicks(n); }
    function lockIn() {
      var line = "I'm interested in the " + base.label + " option (" + money(once) + "–" + money(onceHigh) + " one-time, " + money(mo) + "–" + money(moHigh) + "/mo care)";
      if (labels.length) line += ", plus: " + labels.join(", ");
      props.onChoose({ need: labels.length ? "Website + AI automation" : "A new website", message: line + "." });
    }
    var optBox = "flex flex-col gap-0.5 px-4 py-3.5 pl-11 border-[1.5px] rounded-[9px] bg-white transition-all cursor-pointer relative";

    return html`<${Reveal} id="estimate" className="mt-12 bg-paper text-ink rounded-2xl p-6 sm:p-9 shadow-2xl shadow-black/20">
      <div className="mb-5">
        <h3 className="text-[1.3rem] sm:text-2xl font-bold">Build your instant estimate</h3>
        <p className="text-muted mt-1.5">Pick what you need — see a ballpark in real time. No email required.</p>
      </div>

      <fieldset className="border-0 p-0 m-0 mb-5">
        <legend className="text-[0.92rem] font-semibold text-muted uppercase tracking-[0.08em] mb-3">1 · Choose your site</legend>
        <div className="grid sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Site type">
          ${SITE_OPTS.map(function (op) {
            var on = site === op.v;
            return html`<label key=${op.v} className=${cx(optBox, on ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-line hover:border-muted")}>
              <input type="radio" name="siteType" className="sr-only" checked=${on} onChange=${function () { setSite(op.v); }} />
              <span className=${cx("absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 grid place-items-center", on ? "border-accent bg-accent" : "border-line")}>
                ${on ? html`<span className="h-2 w-2 rounded-full bg-white"></span>` : null}
              </span>
              <span className="font-semibold">${op.name}</span>
              <span className="text-[0.88rem] text-muted">${op.meta}</span>
            </label>`;
          })}
        </div>
      </fieldset>

      <fieldset className="border-0 p-0 m-0">
        <legend className="text-[0.92rem] font-semibold text-muted uppercase tracking-[0.08em] mb-3">2 · Add automation (optional)</legend>
        <div className="grid sm:grid-cols-2 gap-3">
          ${ADDONS.map(function (a) {
            var on = !!picks[a.id];
            return html`<label key=${a.id} className=${cx(optBox, on ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-line hover:border-muted")}>
              <input type="checkbox" className="sr-only" checked=${on} onChange=${function () { toggle(a.id); }} />
              <span className=${cx("absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 rounded-md border-2 grid place-items-center text-white text-[11px]", on ? "border-accent bg-accent" : "border-line")}>${on ? "✓" : ""}</span>
              <span className="font-semibold">${a.name}</span>
              <span className="text-[0.88rem] text-muted">${a.meta}</span>
            </label>`;
          })}
        </div>
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 p-5 bg-ink text-paper rounded-2xl" aria-live="polite">
        <div className="flex gap-7 flex-wrap">
          <div className="flex flex-col">
            <span className="text-[0.78rem] uppercase tracking-[0.1em] text-mutedDk">One-time</span>
            <span className="text-2xl font-bold tracking-tight">${money(once)} – ${money(onceHigh)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[0.78rem] uppercase tracking-[0.1em] text-mutedDk">Care plan</span>
            <span className="text-2xl font-bold tracking-tight">${money(mo)} – ${money(moHigh)}<span className="text-[0.9rem] text-mutedDk font-medium">/mo</span></span>
          </div>
        </div>
        <${Btn} href="#contact" onClick=${lockIn}>Lock in this estimate<//>
      </div>
      <p className="text-muted text-[0.85rem] mt-3.5">Ballpark only — your exact quote is free after a quick call. No obligation, no pressure.</p>
    <//>`;
  }

  /* ---------- Work / portfolio ---------- */
  var DEMOS = [
    { href: "demos/contractor.html", tag: "Contractor / Trades", name: "Ironclad Builders", img: "https://loremflickr.com/640/420/roofing,construction?lock=21",
      desc: "Bold, rugged, and built on trust & reviews — with a quote form front and center.", grad: "from-[#1e2630] to-[#2c3947]" },
    { href: "demos/restaurant.html", tag: "Restaurant / Café", name: "Maple & Ember", img: "https://loremflickr.com/640/420/restaurant,food?lock=22",
      desc: "Warm and appetizing — menu, hours, and reservations that make people hungry.", grad: "from-[#3a2417] to-[#6b3f23]" },
    { href: "demos/salon.html", tag: "Salon / Studio", name: "Halo Studio", img: "https://loremflickr.com/640/420/salon,hair?lock=23",
      desc: "Sleek and modern, built around one thing: getting clients booked.", grad: "from-[#ece6e6] to-[#d8c9cb]" }
  ];

  function Work() {
    return html`<section id="work" className="py-16 md:py-24">
      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
        <${Heading} kicker="Our work" title="Sites built to bring in business."
          lede="A look at the kind of sites we build for local businesses — fast, mobile-first, and designed to turn visitors into calls and bookings. Tap any project to explore it live." />

        <div className="mt-11 grid sm:grid-cols-2 gap-5">
          ${DEMOS.map(function (d, i) {
            return html`<${Reveal} key=${d.name} delay=${i * 80} tag="a" href=${d.href}
              className="group block bg-white border border-line rounded-2xl overflow-hidden shadow-sm transition-all duration-200 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/10">
              <span className=${cx("block aspect-[16/10] p-5 bg-gradient-to-br", d.grad)}>
                <span className="block h-full rounded-lg overflow-hidden bg-white shadow-xl shadow-black/30">
                  <span className="flex gap-1.5 px-3 py-2.5 bg-black/5"><i className="h-2 w-2 rounded-full bg-black/20"></i><i className="h-2 w-2 rounded-full bg-black/20"></i><i className="h-2 w-2 rounded-full bg-black/20"></i></span>
                  <span className="block relative" style=${{ height: "calc(100% - 33px)" }}>
                    <${Img} src=${d.img} alt=${"Preview of the " + d.name + " website"} className="absolute inset-0 w-full h-full object-cover" />
                  </span>
                </span>
              </span>
              <span className="block p-6">
                <span className="block text-[0.74rem] font-bold uppercase tracking-[0.07em] text-accentDeep mb-2">${d.tag}</span>
                <span className="flex items-center gap-2 text-[1.3rem] font-bold tracking-tight">${d.name}
                  <span className="text-accent transition-transform group-hover:translate-x-1.5" aria-hidden="true">→</span></span>
                <span className="block text-muted mt-2 text-[0.96rem]">${d.desc}</span>
              </span>
            <//>`;
          })}

          <${Reveal} delay=${240} tag="a" href="#contact"
            className="group block bg-white border border-line rounded-2xl overflow-hidden shadow-sm transition-all duration-200 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/10">
            <span className="block aspect-[16/10] grid place-items-center bg-[repeating-linear-gradient(45deg,#efe9e0,#efe9e0_12px,#f7f4ef_12px,#f7f4ef_24px)]">
              <span className="grid place-items-center text-center">
                <span className="text-4xl text-accent leading-none">+</span>
                <span className="mt-2 font-bold text-muted">Your business here</span>
              </span>
            </span>
            <span className="block p-6">
              <span className="block text-[0.74rem] font-bold uppercase tracking-[0.07em] text-accentDeep mb-2">Your industry</span>
              <span className="flex items-center gap-2 text-[1.3rem] font-bold tracking-tight">Let's build yours
                <span className="text-accent transition-transform group-hover:translate-x-1.5" aria-hidden="true">→</span></span>
              <span className="block text-muted mt-2 text-[0.96rem]">Gym, dentist, landscaper, café — if you serve local customers, we'll build you a site that works as hard as you do.</span>
            </span>
          <//>
        </div>

        <${Reveal} className="mt-14 text-center">
          <p className="text-[0.76rem] uppercase tracking-[0.14em] text-muted font-semibold mb-5">Trusted by local businesses across Greater Milwaukee</p>
          <ul className="flex flex-wrap justify-center gap-3.5 sm:gap-x-8">
            ${[0, 1, 2, 3, 4].map(function (n) {
              return html`<li key=${n} className="font-bold text-muted tracking-wide border border-line rounded-lg px-5 py-3 bg-white text-[0.9rem]">[LOGO]</li>`;
            })}
          </ul>
        <//>
      </div>
    </section>`;
  }

  function Reviews() {
    var quotes = [
      "Had a sharp new website up in days, and the calls actually started coming in. Wish we'd done it sooner.",
      "The auto-reply alone paid for itself. No more leads going cold while we're out on a job.",
      "One point of contact, clear pricing, done fast. No agency runaround, no surprise invoices."
    ];
    return html`<section id="reviews" className="py-16 md:py-24 bg-paper2">
      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8">
        <div className="text-center max-w-[640px] mx-auto">
          <${Reveal}><${Kicker} className="justify-center">Reviews<//><//>
          <${Reveal} tag="h2" delay=${60} className="mt-3.5 text-[1.7rem] sm:text-4xl font-bold tracking-tight">What local owners say.<//>
          <${Reveal} tag="p" delay=${120} className="mt-3 text-muted"><span className="text-accent" aria-hidden="true">★★★★★</span> <strong>5.0</strong> average from local clients<//>
        </div>
        <div className="mt-10 grid md:grid-cols-3 gap-5">
          ${quotes.map(function (q, i) {
            return html`<${Reveal} tag="figure" key=${i} delay=${i * 90} className="bg-white border border-line rounded-2xl p-6 shadow-sm">
              <div className="text-accent tracking-[2px] mb-2.5" aria-hidden="true">★★★★★</div>
              <blockquote className="text-[1.04rem]">${"“" + q + "”"}</blockquote>
              <figcaption className="text-muted font-semibold text-[0.92rem] mt-3.5">— [CLIENT NAME, BUSINESS]</figcaption>
            <//>`;
          })}
        </div>
      </div>
    </section>`;
  }

  function FaqItem(props) {
    var s = useState(false), open = s[0], setOpen = s[1];
    return html`<div className="bg-white border border-line rounded-2xl overflow-hidden">
      <button onClick=${function () { setOpen(!open); }} aria-expanded=${open}
        className="w-full flex items-center justify-between gap-4 text-left px-5 sm:px-6 py-5 font-semibold text-[1.06rem]">
        <span>${props.q}</span>
        <span className=${cx("relative shrink-0 h-4 w-4 transition-transform duration-300", open && "rotate-45")} aria-hidden="true">
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 w-4 bg-accent rounded"></span>
          <span className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-accent rounded"></span>
        </span>
      </button>
      <div className=${cx("grid transition-all duration-300 ease-out", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden"><p className="px-5 sm:px-6 pb-5 text-muted">${props.a}</p></div>
      </div>
    </div>`;
  }

  function FAQ() {
    var faqs = [
      { q: "How much does a website cost?", a: html`Sites start at <strong className="text-ink">$149 one-time + $99/mo</strong> for the care plan, and most projects land between the Starter and Growth tiers. You'll get a clear, fixed price before any work starts — no surprises, no hourly meter running.` },
      { q: "How long until it's live?", a: html`Most single-page sites go live <strong className="text-ink">within a week</strong> — often in just a few days once we have your details. Bigger builds with automation take a little longer, and we'll give you the exact timeline up front.` },
      { q: "Do I own my website?", a: html`Yes. <strong className="text-ink">The site is yours.</strong> Your domain stays in your name, and if you ever leave the care plan, you keep your site files. No hostage situations — that's not how we work.` },
      { q: "What does ongoing support actually cover?", a: html`The monthly care plan covers <strong className="text-ink">hosting, security, uptime monitoring, updates, and monthly tweaks</strong> — change your hours, swap a photo, add a service, just ask. You've got one dedicated team that knows your site and replies in plain English. Cancel anytime.` },
      { q: "Do you work with my type of business?", a: html`Very likely yes. We focus on local service businesses — <strong className="text-ink">contractors, trades, restaurants, gyms, salons, dentists</strong>, and similar. If you serve customers in the Milwaukee area, let's talk. Not sure? Ask — the quote is free.` }
    ];
    return html`<section id="faq" className="py-16 md:py-24">
      <div className="mx-auto w-full max-w-[760px] px-5 sm:px-8">
        <${Heading} kicker="Questions" title="Good questions, straight answers." />
        <div className="mt-9 grid gap-3">
          ${faqs.map(function (f, i) { return html`<${Reveal} key=${i} delay=${i * 60}><${FaqItem} q=${f.q} a=${f.a} /><//>`; })}
        </div>
      </div>
    </section>`;
  }

  /* ---------- Lead form ---------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var NEED_OPTIONS = ["A new website", "Website + AI automation", "AI automation only", "Redesign my current site", "Free website audit", "Care plan / maintenance", "Not sure — need advice"];

  function Field(props) {
    var invalid = !!props.error;
    var base = "w-full text-ink bg-white border-[1.5px] rounded-[9px] px-3.5 py-3 transition-all focus:outline-none";
    var ring = invalid ? "border-[#c2401a] ring-2 ring-[#c2401a]/20" : "border-line focus:border-accent focus:ring-2 focus:ring-accent/20";
    var common = { id: props.name, name: props.name, value: props.value, onChange: props.onChange, maxLength: props.maxLength, "aria-invalid": invalid ? "true" : "false" };
    return html`<div className=${cx("flex flex-col gap-1.5", props.full && "sm:col-span-2")}>
      <label htmlFor=${props.name} className="font-semibold text-[0.95rem]">${props.label} ${props.required ? html`<span className="text-accentDeep">*</span>` : (props.hint ? html`<span className="text-muted font-normal">${props.hint}</span>` : null)}</label>
      ${props.type === "select"
        ? html`<select ...${common} className=${cx(base, ring)}>
            <option value="" disabled>Choose one…</option>
            ${NEED_OPTIONS.map(function (op) { return html`<option key=${op} value=${op}>${op}</option>`; })}
          </select>`
        : props.type === "textarea"
        ? html`<textarea ...${common} rows="4" placeholder=${props.placeholder} className=${cx(base, ring, "min-h-[110px] resize-y")}></textarea>`
        : html`<input type=${props.type || "text"} ...${common} autoComplete=${props.autoComplete} inputMode=${props.inputMode} className=${cx(base, ring)} />`}
      ${invalid ? html`<p className="text-[#a6370f] text-[0.85rem]">${props.error}</p>` : null}
    </div>`;
  }

  function Contact(props) {
    var init = { name: "", email: "", phone: "", business: "", need: "", message: "", company_url: "" };
    var s = useState(init), v = s[0], setV = s[1];
    var e = useState({}), errors = e[0], setErrors = e[1];
    var st = useState({ type: "", msg: "" }), status = st[0], setStatus = st[1];
    var sn = useState(false), sending = sn[0], setSending = sn[1];
    var loadedAt = useRef(Date.now());
    var lastSubmit = useRef(0);

    useEffect(function () {
      if (props.prefill) {
        setV(function (prev) {
          var n = Object.assign({}, prev);
          if (props.prefill.need && !prev.need) n.need = props.prefill.need;
          if (props.prefill.message && !prev.message.trim()) n.message = props.prefill.message;
          return n;
        });
      }
    }, [props.prefill]);

    function set(field) {
      return function (ev) {
        var val = ev.target.value;
        setV(function (p) { var n = Object.assign({}, p); n[field] = val; return n; });
        if (errors[field]) setErrors(function (p) { var n = Object.assign({}, p); delete n[field]; return n; });
      };
    }
    function clean(val, max) { var x = (val == null ? "" : String(val)).replace(/\s+/g, " ").trim(); return max && x.length > max ? x.slice(0, max) : x; }
    function validate() {
      var er = {};
      if (!clean(v.name)) er.name = "Please tell us your name.";
      var em = clean(v.email);
      if (!em) er.email = "An email so we can reply."; else if (!EMAIL_RE.test(em)) er.email = "That email doesn't look right.";
      if (!v.need) er.need = "Pick what you need.";
      return er;
    }
    function onSubmit(ev) {
      ev.preventDefault();
      if (v.company_url && v.company_url.trim() !== "") { setStatus({ type: "success", msg: "Thanks! Your message is on its way." }); return; }
      var now = Date.now();
      if (now - loadedAt.current < 2500) { setStatus({ type: "error", msg: "That was quick — give it a moment and try again." }); return; }
      if (now - lastSubmit.current < 4000) return;
      var er = validate();
      if (Object.keys(er).length) { setErrors(er); setStatus({ type: "error", msg: "Please fix the highlighted fields." }); return; }
      setErrors({}); lastSubmit.current = now;
      if (/YOUR_FORM_ID/.test(FORM_ENDPOINT)) {
        setStatus({ type: "error", msg: "Form isn't connected yet. Add your Formspree/Netlify endpoint (see README), or email " + EMAIL + "." });
        return;
      }
      setSending(true); setStatus({ type: "success", msg: "Sending…" });
      var payload = { name: clean(v.name, 80), email: clean(v.email, 120), phone: clean(v.phone, 25), business: clean(v.business, 100), need: v.need, message: clean(v.message, 1200), _subject: "New quote request from the Main Street Web site" };
      fetch(FORM_ENDPOINT, { method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        .then(function (r) { if (r.ok) return r.json().catch(function () { return {}; }); throw new Error("bad"); })
        .then(function () { setSending(false); setV(init); setStatus({ type: "success", msg: "Thanks — got it! We'll reply within one business day." }); })
        .catch(function () { setSending(false); setStatus({ type: "error", msg: "Something went wrong sending that. Please try again, or email " + EMAIL + " directly." }); });
    }

    return html`<section id="contact" className="py-16 md:py-24 bg-paper2">
      <div className="mx-auto w-full max-w-[760px] px-5 sm:px-8">
        <${Heading} kicker="Get started" title="Get a free quote."
          lede="Tell us a little about your business. We'll reply within one business day with honest advice and a fixed price — no pressure, no jargon." />

        <${Reveal} tag="form" delay=${80} className="mt-9 relative" onSubmit=${onSubmit} noValidate=${true}>
          <div className="absolute w-px h-px overflow-hidden -m-px" aria-hidden="true">
            <label htmlFor="company_url">Leave this field empty</label>
            <input type="text" id="company_url" name="company_url" tabIndex="-1" autoComplete="off" value=${v.company_url} onChange=${set("company_url")} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <${Field} name="name" label="Name" required=${true} value=${v.name} onChange=${set("name")} maxLength=${80} autoComplete="name" error=${errors.name} />
            <${Field} name="email" label="Email" type="email" required=${true} value=${v.email} onChange=${set("email")} maxLength=${120} autoComplete="email" inputMode="email" error=${errors.email} />
            <${Field} name="phone" label="Phone" type="tel" value=${v.phone} onChange=${set("phone")} maxLength=${25} autoComplete="tel" inputMode="tel" />
            <${Field} name="business" label="Business name" value=${v.business} onChange=${set("business")} maxLength=${100} autoComplete="organization" />
            <${Field} name="need" label="What do you need?" type="select" required=${true} full=${true} value=${v.need} onChange=${set("need")} error=${errors.need} />
            <${Field} name="message" label="Anything else?" type="textarea" full=${true} value=${v.message} onChange=${set("message")} maxLength=${1200} hint="(optional)" placeholder="A sentence or two about your business and what you're after." />
          </div>

          <button type="submit" disabled=${sending}
            className="mt-6 inline-flex items-center justify-center gap-2.5 px-7 py-3.5 text-base font-semibold rounded-full bg-accent text-white transition-all hover:bg-accentDeep hover:-translate-y-0.5 disabled:opacity-75 disabled:cursor-progress">
            <span>${sending ? "Sending…" : "Send my free quote request"}</span>
            ${sending ? html`<span className="msw-spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white"></span>` : null}
          </button>

          ${status.msg ? html`<p role="status" aria-live="polite"
            className=${cx("mt-5 px-4 py-3.5 rounded-[9px] font-medium text-[0.96rem] border",
              status.type === "success" ? "bg-[#2f5d3a]/10 text-[#245034] border-[#2f5d3a]/30" : "bg-[#c2401a]/10 text-[#a6370f] border-[#c2401a]/30")}>${status.msg}</p>` : null}

          <p className="mt-5 text-muted text-[0.9rem]">Prefer to talk? Call or text <a href=${TEL} className="text-accentDeep font-semibold underline-offset-2 hover:underline">${PHONE}</a>. No spam, ever.</p>
        <//>
      </div>
    </section>`;
  }

  function Footer() {
    var year = new Date().getFullYear();
    var cols = [
      ["Explore", [["Services", "#services"], ["Pricing", "#pricing"], ["Our Work", "#work"], ["FAQ", "#faq"]]],
      ["Contact", [[EMAIL, "mailto:" + EMAIL], [PHONE, TEL], ["Get a free quote", "#contact"]]],
      ["Follow", [["Instagram", "#"], ["Facebook", "#"], ["LinkedIn", "#"]]]
    ];
    return html`<footer className="bg-ink text-mutedDk pt-14 md:pt-20">
      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8 grid gap-9 md:grid-cols-[2fr_1fr_1fr_1fr] pb-10 border-b border-white/10">
        <div>
          <${Brand} className="text-paper" />
          <p className="text-paper font-semibold mt-3">Less busywork. More booked work.</p>
          <p className="text-[0.92rem] mt-1.5">Serving Milwaukee, WI &amp; surrounding areas.</p>
        </div>
        ${cols.map(function (col) {
          return html`<div key=${col[0]} className="flex flex-col gap-2.5">
            <h2 className="text-paper text-[0.82rem] uppercase tracking-[0.1em] font-bold mb-1.5">${col[0]}</h2>
            ${col[1].map(function (lnk) { return html`<a key=${lnk[0]} href=${lnk[1]} className="text-mutedDk hover:text-accentBright transition-colors">${lnk[0]}</a>`; })}
          </div>`;
        })}
      </div>
      <div className="mx-auto w-full max-w-[1120px] px-5 sm:px-8 flex flex-wrap justify-between gap-x-5 gap-y-2 pt-5 pb-24 lg:pb-8 text-[0.88rem]">
        <p>© ${year} Main Street Web · Abbas. All rights reserved.</p>
        <p>Crafted in Milwaukee. <a href="#contact" className="text-accentBright hover:underline">Let's build yours.</a></p>
      </div>
    </footer>`;
  }

  function MobileCTA() {
    var show = useScrolled(Math.round(window.innerHeight * 0.6));
    return html`<div aria-label="Quick actions"
      className=${cx("lg:hidden fixed left-0 right-0 bottom-0 z-40 flex gap-2.5 px-3.5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] bg-ink/90 backdrop-blur border-t border-white/15 transition-transform duration-300",
        show ? "translate-y-0" : "translate-y-full")}>
      <a href=${TEL} className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-full border-[1.5px] border-white/40 text-paper font-semibold"><${Icon} name="phone" size=${18} sw=${1.8} /> Call</a>
      <a href="#contact" className="flex-[1.4] inline-flex items-center justify-center py-3 rounded-full bg-accent text-white font-semibold">Free Quote</a>
    </div>`;
  }

  function App() {
    var pf = useState(null), prefill = pf[0], setPrefill = pf[1];
    function choose(data) {
      setPrefill(Object.assign({}, data, { _n: Date.now() }));
      var el = document.getElementById("contact");
      if (el) el.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" });
    }
    return html`<${Fragment}>
      <${Nav} />
      <main id="main">
        <${Hero} />
        <${TrustBar} />
        <${Problems} />
        <${Services} />
        <${Process} />
        <${Pricing} onChoose=${choose} />
        <${Work} />
        <${Reviews} />
        <${FAQ} />
        <${Contact} prefill=${prefill} />
      </main>
      <${Footer} />
      <${MobileCTA} />
    <//>`;
  }

  ReactDOM.createRoot(document.getElementById("root")).render(html`<${App} />`);
})();
