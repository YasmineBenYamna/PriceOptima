import { useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────
   Design tokens — injected as a <style> block
   so they live in :root and are consistent with
   any global CSS you already have.
───────────────────────────────────────────── */
const GLOBAL_STYLES = `
  :root {
    --color-bg:              #f5f4f0;
    --color-surface:         #f9f8f5;
    --color-surface-2:       #ffffff;
    --color-surface-offset:  #edeae4;
    --color-border:          rgba(40,37,29,.10);
    --color-divider:         rgba(40,37,29,.07);
    --color-text:            #1a1814;
    --color-text-muted:      #6b6860;
    --color-text-faint:      #b0aea9;
    --color-text-inverse:    #f5f4f0;
    --color-navy:            #1E3A5F;
    --color-navy-light:      #2A5298;
    --color-orange:          #D4845A;
    --color-orange-hover:    #c06b3f;
    --color-primary:         #1E3A5F;
    --shadow-sm: 0 1px 3px rgba(40,37,29,.07);
    --shadow-md: 0 4px 16px rgba(40,37,29,.09);
    --shadow-lg: 0 16px 48px rgba(40,37,29,.12);
    --radius-sm: 0.375rem;
    --radius-md: 0.5rem;
    --radius-lg: 0.75rem;
    --radius-xl: 1rem;
    --radius-2xl: 1.5rem;
    --radius-full: 9999px;
    --font-display: 'Sora', sans-serif;
    --font-body: 'Inter', sans-serif;
    --text-xs:   clamp(0.75rem,  0.7rem  + 0.25vw, 0.875rem);
    --text-sm:   clamp(0.875rem, 0.8rem  + 0.35vw, 1rem);
    --text-base: clamp(1rem,     0.95rem + 0.25vw, 1.125rem);
    --text-lg:   clamp(1.125rem, 1rem    + 0.75vw, 1.5rem);
    --text-xl:   clamp(1.5rem,   1.2rem  + 1.25vw, 2.25rem);
    --text-2xl:  clamp(2rem,     1.2rem  + 2.5vw,  3.5rem);
    --text-3xl:  clamp(2.5rem,   1rem    + 4vw,    4.5rem);
    --space-1:.25rem;--space-2:.5rem;--space-3:.75rem;--space-4:1rem;
    --space-5:1.25rem;--space-6:1.5rem;--space-8:2rem;--space-10:2.5rem;
    --space-12:3rem;--space-16:4rem;--space-20:5rem;--space-24:6rem;
  }
  [data-theme="dark"] {
    --color-bg:              #0d0f14;
    --color-surface:         #131620;
    --color-surface-2:       #181c28;
    --color-surface-offset:  #1e2230;
    --color-border:          rgba(205,204,202,.10);
    --color-divider:         rgba(205,204,202,.06);
    --color-text:            #e8e6e2;
    --color-text-muted:      #8a8880;
    --color-text-faint:      #4a4845;
    --color-text-inverse:    #0d0f14;
    --color-navy:            #4a7fc0;
    --color-navy-light:      #6b9fd8;
    --color-orange:          #e8956a;
    --color-orange-hover:    #f0a97e;
    --color-primary:         #4a7fc0;
    --shadow-sm: 0 1px 3px rgba(0,0,0,.25);
    --shadow-md: 0 4px 16px rgba(0,0,0,.35);
    --shadow-lg: 0 16px 48px rgba(0,0,0,.50);
  }

  /* Google Fonts */
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300..800&family=Sora:wght@400;600;700;800&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-font-smoothing: antialiased; scroll-behavior: smooth; scroll-padding-top: 80px; }
  body {
    font-family: var(--font-display);
    font-size: var(--text-base);
    color: var(--color-text);
    background: var(--color-bg);
    line-height: 1.65;
    min-height: 100dvh;
    transition: background .25s, color .25s;
  }
  img { display: block; max-width: 100%; height: auto; }
  a  { color: inherit; text-decoration: none; }
  button { cursor: pointer; border: none; background: none; font: inherit; color: inherit; }
  p, li { text-wrap: pretty; }
  h1,h2,h3,h4 { text-wrap: balance; line-height: 1.15; font-family: var(--font-display); }
  ::selection { background: rgba(212,132,90,.25); color: var(--color-text); }
  :focus-visible { outline: 2px solid var(--color-orange); outline-offset: 3px; border-radius: var(--radius-sm); }

  /* Scroll reveal */
  .reveal { opacity: 0; transform: translateY(20px); transition: opacity .6s ease, transform .6s ease; }
  .reveal.visible { opacity: 1; transform: none; }

  /* Pulse dot */
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.3)} }

  /* Chart bars hover */
  .chart-bar:hover { opacity: .8; }
`;

/* ─── Helpers ─────────────────────────────── */
function useReveal() {
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visible"); obs.unobserve(e.target); } }),
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
}

function animateCount(el, target, suffix = "") {
  let start = 0;
  const duration = 1800;
  const step = (ts) => {
    if (!start) start = ts;
    const p = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 4);
    const val = suffix === "%" ? Math.round(ease * target) : Math.round(ease * target).toLocaleString("en");
    el.textContent = (suffix === "+" ? "+" : "") + val + (suffix === "%" ? "%" : suffix === "+" ? "" : suffix);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ─── Sub-components ───────────────────────── */

function LogoIcon({ size = 34 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "var(--radius-md)",
      background: "linear-gradient(135deg,#1E3A5F 0%,#2A5298 55%,#D4845A 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      <svg width={size * 0.53} height={size * 0.53} viewBox="0 0 24 24" fill="none"
        stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" strokeOpacity=".4" />
        <circle cx="12" cy="12" r="5.5" strokeOpacity=".65" />
        <line x1="12" y1="3" x2="12" y2="21" strokeOpacity=".25" />
        <line x1="3" y1="12" x2="21" y2="12" strokeOpacity=".25" />
        <circle cx="16" cy="8" r="2" fill="white" stroke="none" />
        <line x1="12" y1="12" x2="16" y2="8" strokeWidth="2.2" />
      </svg>
    </div>
  );
}

function ThemeToggle({ theme, onToggle }) {
  return (
    <button onClick={onToggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} style={{
      width: 38, height: 38, borderRadius: "var(--radius-md)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "var(--color-text-muted)", border: "1px solid var(--color-border)",
      transition: "color .18s, border-color .18s",
    }}>
      {theme === "dark"
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      }
    </button>
  );
}

function Navbar({ theme, onToggle, onNavigate }) {
  return (
    <nav aria-label="Main navigation" style={{
      position: "sticky", top: 0, zIndex: 100,
      backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      background: "color-mix(in oklch,var(--color-bg) 85%,transparent)",
      borderBottom: "1px solid var(--color-divider)",
    }}>
      <div style={{ maxWidth: 1160, marginInline: "auto", paddingInline: "clamp(1rem,4vw,3rem)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <a href="#" aria-label="PriceOptima home" style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.1rem", letterSpacing: "-0.025em", color: "var(--color-text)" }}>
            <LogoIcon size={34} />
            Price<span style={{ color: "var(--color-orange)" }}>Optima</span>
          </a>

          <nav aria-label="Main links" style={{ display: "flex", alignItems: "center", gap: "var(--space-8)" }}
            className="nav-links-desktop">
            {[["#features", "Features"], ["#how", "How It Works"]].map(([href, label]) => (
              <a key={href} href={href} style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", fontWeight: 500, transition: "color .18s" }}
                onMouseEnter={e => e.target.style.color = "var(--color-text)"}
                onMouseLeave={e => e.target.style.color = "var(--color-text-muted)"}
              >{label}</a>
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <ThemeToggle theme={theme} onToggle={onToggle} />
            <a href="#" style={{
              display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
              padding: ".6em 1.3em", borderRadius: "var(--radius-md)",
              fontSize: "var(--text-sm)", fontWeight: 600,
              background: "transparent", color: "var(--color-text-muted)",
              border: "1px solid var(--color-border)", whiteSpace: "nowrap",
            }}>Sign in</a>
            <a href="#" onClick={onNavigate} style={{
              display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
              padding: ".6em 1.3em", borderRadius: "var(--radius-md)",
              fontSize: "var(--text-sm)", fontWeight: 600,
              background: "var(--color-orange)", color: "#fff", whiteSpace: "nowrap",
            }}>Get started</a>
          </div>
        </div>
      </div>
    </nav>
  );
}

function DashboardPreview() {
  const bars = [40, 55, 45, 70, 60, 85, 75];
  const rules = [
    { dot: "#ef4444", name: "Competitor Beat Rule", coeff: "0.50" },
    { dot: "var(--color-orange)", name: "Floor Price Rule", coeff: "0.30" },
    { dot: "#22c55e", name: "Market Average Rule", coeff: "0.20" },
  ];
  return (
    <div style={{
      background: "var(--color-surface)", border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-2xl)", padding: "var(--space-5)",
      boxShadow: "var(--shadow-lg)",
      transform: "perspective(1200px) rotateY(-6deg) rotateX(2deg)",
      transition: "transform .4s",
    }}
      onMouseEnter={e => e.currentTarget.style.transform = "perspective(1200px) rotateY(-2deg) rotateX(1deg)"}
      onMouseLeave={e => e.currentTarget.style.transform = "perspective(1200px) rotateY(-6deg) rotateX(2deg)"}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)", paddingBottom: "var(--space-4)", borderBottom: "1px solid var(--color-divider)" }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: ".8rem", fontWeight: 700, color: "var(--color-text)" }}>AGGRESSIVE Strategy — Live view</span>
        <span style={{ fontSize: ".65rem", padding: ".2em .6em", borderRadius: "var(--radius-full)", background: "rgba(34,197,94,.15)", color: "#22c55e", fontWeight: 700 }}>● Active</span>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
        {[
          { val: "€ 3.47", lbl: "Calculated price", delta: "▼ −2.1% vs market", up: false },
          { val: "12", lbl: "Products processed", delta: "▲ +8 this month", up: true },
        ].map((k, i) => (
          <div key={i} style={{ background: "var(--color-surface-offset)", borderRadius: "var(--radius-lg)", padding: "var(--space-4)" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem", fontWeight: 800, letterSpacing: "-0.02em", color: i === 0 ? "var(--color-orange)" : "var(--color-text)" }}>{k.val}</div>
            <div style={{ fontSize: ".65rem", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: ".05em", marginTop: 2 }}>{k.lbl}</div>
            <div style={{ fontSize: ".7rem", fontWeight: 700, marginTop: "var(--space-2)", color: k.up ? "#22c55e" : "#ef4444" }}>{k.delta}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background: "var(--color-surface-offset)", borderRadius: "var(--radius-lg)", padding: "var(--space-4)", marginBottom: "var(--space-3)" }}>
        <div style={{ fontSize: ".65rem", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "var(--space-3)" }}>Price trend — 7 days</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 54 }}>
          {bars.map((h, i) => (
            <div key={i} className="chart-bar" style={{
              flex: 1, height: `${h}%`, borderRadius: "3px 3px 0 0", transition: "opacity .2s",
              background: h === 85 ? "var(--color-orange)" : `rgba(212,132,90,${(h / 100) * 0.7 + 0.3})`,
            }} />
          ))}
        </div>
      </div>

      {/* Rules */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {rules.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".5em var(--space-3)", background: "var(--color-surface-offset)", borderRadius: "var(--radius-md)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "var(--radius-full)", background: r.dot }} />
              <span style={{ fontSize: ".7rem", fontWeight: 600, color: "var(--color-text)" }}>{r.name}</span>
            </div>
            <span style={{ fontSize: ".65rem", color: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>coeff. {r.coeff}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroStats() {
  const ref = useRef(null);
  const nums = useRef([]);

  useEffect(() => {
    const targets = [{ val: 12000, suffix: "+" }, { val: 4, suffix: "" }, { val: 97, suffix: "%" }];
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        nums.current.forEach((el, i) => el && animateCount(el, targets[i].val, targets[i].suffix));
        obs.disconnect();
      }
    }, { threshold: 0.5 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const stats = [
    { label: "Products analyzed" },
    { label: "Ready strategies" },
    { label: "Price accuracy" },
  ];

  return (
    <div ref={ref} role="list" style={{ display: "flex", gap: "var(--space-6)", marginTop: "var(--space-10)", paddingTop: "var(--space-8)", borderTop: "1px solid var(--color-divider)" }}>
      {stats.map((s, i) => (
        <div key={i} role="listitem">
          <div ref={el => nums.current[i] = el} style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--color-text)", letterSpacing: "-0.03em" }}>—</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: 2, textTransform: "uppercase", letterSpacing: ".06em" }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function Hero({ onNavigate }) {
  return (
    <section aria-labelledby="hero-title" style={{ padding: "clamp(4rem,10vw,6rem) 0 clamp(3rem,8vw,5rem)", overflow: "hidden", position: "relative" }}>
      <div style={{ maxWidth: 1160, marginInline: "auto", paddingInline: "clamp(1rem,4vw,3rem)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-16)", alignItems: "center" }}
          className="hero-grid">
          <div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
              padding: ".35em .9em", borderRadius: "var(--radius-full)",
              background: "rgba(212,132,90,.12)", border: "1px solid rgba(212,132,90,.3)",
              color: "var(--color-orange)", fontSize: "var(--text-xs)", fontWeight: 700,
              letterSpacing: ".05em", textTransform: "uppercase", marginBottom: "var(--space-6)",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "var(--radius-full)", background: "var(--color-orange)", animation: "pulse 2s ease infinite", display: "inline-block" }} aria-hidden="true" />
              Intelligent Pricing Platform
            </div>

            <h1 id="hero-title" style={{ fontSize: "var(--text-3xl)", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.1, marginBottom: "var(--space-6)" }}>
              Pricing driven<br />by <span style={{ color: "var(--color-orange)" }}>data</span>,<br />not intuition.
            </h1>

            <p style={{ fontSize: "var(--text-lg)", color: "var(--color-text-muted)", maxWidth: "52ch", marginBottom: "var(--space-8)", lineHeight: 1.7 }}>
              PriceOptima analyzes your competitors in real time and automatically applies your pricing strategies — rule by rule, product by product.
            </p>

            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
              <a href="#" onClick={onNavigate} style={{
                display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
                padding: ".7em 1.6em", borderRadius: "var(--radius-md)",
                fontSize: "var(--text-base)", fontWeight: 600,
                background: "var(--color-navy)", color: "#fff", transition: "opacity .18s",
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = ".9"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >Get started for free</a>
              <a href="#how" style={{
                display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
                padding: ".7em 1.6em", borderRadius: "var(--radius-md)",
                fontSize: "var(--text-base)", fontWeight: 600,
                background: "transparent", color: "var(--color-text-muted)", border: "1px solid var(--color-border)", transition: "color .18s, border-color .18s",
              }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--color-text)"; e.currentTarget.style.borderColor = "rgba(26,24,20,.3)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--color-text-muted)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
              >See how it works</a>
            </div>

            <HeroStats />
          </div>

          <div aria-hidden="true">
            <DashboardPreview />
          </div>
        </div>
      </div>
      <style>{`
        @media(max-width:900px){
          .hero-grid{ grid-template-columns:1fr !important; }
        }
      `}</style>
    </section>
  );
}

function Features() {
  const feats = [
    {
      icon: (
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
      title: "Live Competitive Intelligence",
      desc: "Collect and analyze competitor prices from Open Prices and Open Food Facts in real time. Always stay ahead of market movements.",
    },
    {
      icon: (
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 15 10-15z" /><path d="M12 2v20M2 7l10 5 10-5" />
        </svg>
      ),
      title: "Modular Pricing Rules",
      desc: "Configure independent rules — Floor Price, Competitor Beat, Market Average, Min Store Price, Stability — and combine them with weighted coefficients.",
    },
    {
      icon: (
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" /><path d="M14 17h6M17 14v6" />
        </svg>
      ),
      title: "Predefined & Custom Strategies",
      desc: "Choose from AGGRESSIVE, COMPETITIVE, ALIGNED presets or build your own strategy with custom rules and personalized coefficients.",
      large: true,
      extra: (
        <div style={{ background: "var(--color-surface-offset)", borderRadius: "var(--radius-lg)", padding: "var(--space-5)" }}>
          <div style={{ fontSize: ".7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--color-text-muted)", marginBottom: "var(--space-4)" }}>Coefficients — AGGRESSIVE Strategy</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {[["Competitor Beat", "50%", "#ef4444", "50%"], ["Floor Price", "30%", "var(--color-orange)", "30%"], ["Market Average", "20%", "#22c55e", "20%"]].map(([n, p, c, w]) => (
              <div key={n}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{n}</span>
                  <span style={{ color: "var(--color-text-muted)" }}>{p}</span>
                </div>
                <div style={{ height: 5, background: "var(--color-border)", borderRadius: "var(--radius-full)" }}>
                  <div style={{ height: "100%", width: w, background: c, borderRadius: "var(--radius-full)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      icon: (
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z" />
          <path d="M20.5 10H19V8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
          <path d="M9.5 14c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5S8 21.33 8 20.5v-5c0-.83.67-1.5 1.5-1.5z" />
          <path d="M3.5 14H5v1.5c0 .83-.67 1.5-1.5 1.5S2 16.33 2 15.5 2.67 14 3.5 14z" />
          <path d="M14 14.5c0-.83.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-5c-.83 0-1.5-.67-1.5-1.5z" />
          <path d="M15.5 19H14v1.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5z" />
          <path d="M10 9.5C10 8.67 9.33 8 8.5 8h-5C2.67 8 2 8.67 2 9.5S2.67 11 3.5 11h5c.83 0 1.5-.67 1.5-1.5z" />
          <path d="M8.5 5H10V3.5C10 2.67 9.33 2 8.5 2S7 2.67 7 3.5 7.67 5 8.5 5z" />
        </svg>
      ),
      title: "Automated Airflow Pipeline",
      desc: "Apache Airflow DAGs orchestrate the entire chain — collection, SQLMesh transformation, price calculation — without any manual intervention.",
    },
    {
      icon: (
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
      title: "Jobs & Calculation History",
      desc: "Track every calculation job — status, processed products, price variations, execution timeline — with a full history accessible at any time.",
    },
  ];

  return (
    <section id="features" aria-labelledby="feat-title" style={{ padding: "clamp(3rem,7vw,5rem) 0" }}>
      <div style={{ maxWidth: 1160, marginInline: "auto", paddingInline: "clamp(1rem,4vw,3rem)" }}>
        <div className="reveal">
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--color-orange)", marginBottom: "var(--space-4)" }}>Features</div>
          <h2 className="section-title" id="feat-title" style={{ fontSize: "var(--text-2xl)", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.15, marginBottom: "var(--space-5)" }}>
            Everything you need<br />for competitive pricing.
          </h2>
          <p style={{ fontSize: "var(--text-base)", color: "var(--color-text-muted)", maxWidth: "58ch", lineHeight: 1.7 }}>
            A complete pipeline from competitor price collection to automatic optimal pricing calculation.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-6)", marginTop: "var(--space-12)" }} className="feat-grid">
          {feats.map((f, i) => (
            <div key={i} className={`feat-card reveal${f.large ? " feat-large" : ""}`}
              style={{
                ...(f.large ? { gridColumn: "span 2" } : {}),
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-xl)", padding: "var(--space-8)",
                boxShadow: "var(--shadow-sm)", transition: "box-shadow .2s, transform .2s",
                transitionDelay: `${i * 0.05}s`,
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "var(--shadow-md)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "var(--shadow-sm)"; e.currentTarget.style.transform = "none"; }}
            >
              {f.large ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-8)", alignItems: "center" }}>
                  <div>
                    <div style={{ width: 42, height: 42, marginBottom: "var(--space-5)", color: "var(--color-orange)" }}>{f.icon}</div>
                    <h3 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "var(--space-3)" }}>{f.title}</h3>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", lineHeight: 1.7 }}>{f.desc}</p>
                  </div>
                  {f.extra}
                </div>
              ) : (
                <>
                  <div style={{ width: 42, height: 42, marginBottom: "var(--space-5)", color: "var(--color-orange)" }}>{f.icon}</div>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "var(--space-3)" }}>{f.title}</h3>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", lineHeight: 1.7 }}>{f.desc}</p>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @media(max-width:700px){
          .feat-grid{ grid-template-columns:1fr !important; }
          .feat-large{ grid-column:span 1 !important; }
          .feat-large > div { grid-template-columns:1fr !important; }
        }
      `}</style>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { num: "01", title: "Select your products", desc: "Search by EAN, brand, or category. Import your catalog from Open Food Facts or enter your EANs manually." },
    { num: "02", title: "Configure a strategy", desc: "Select AGGRESSIVE, COMPETITIVE, ALIGNED, or create a CUSTOM strategy by adjusting the coefficients of each rule." },
    { num: "03", title: "Launch the calculation", desc: "The pricing engine applies your rules, Airflow orchestrates execution, and you get your optimal prices — in seconds." },
  ];

  return (
    <section id="how" aria-labelledby="how-title" style={{ padding: "clamp(3rem,7vw,5rem) 0" }}>
      <div style={{ maxWidth: 760, marginInline: "auto", paddingInline: "clamp(1rem,4vw,3rem)" }}>
        <div className="reveal" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--color-orange)", marginBottom: "var(--space-4)", textAlign: "center" }}>How It Works</div>
          <h2 id="how-title" style={{ fontSize: "var(--text-2xl)", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.15, marginBottom: "var(--space-5)" }}>Simple. Powerful. Automatic.</h2>
          <p style={{ fontSize: "var(--text-base)", color: "var(--color-text-muted)", marginInline: "auto", textAlign: "center", lineHeight: 1.7 }}>Three steps from raw data to the optimal price.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "var(--space-6)", marginTop: "var(--space-12)" }} className="how-grid">
          {steps.map((s, i) => (
            <div key={i} className="reveal" style={{ position: "relative", padding: "var(--space-8) var(--space-6)", transitionDelay: `${i * 0.05}s` }}>
              <span aria-hidden="true" style={{ display: "block", fontFamily: "var(--font-display)", fontSize: "3.5rem", fontWeight: 800, color: "rgba(212,132,90,.15)", letterSpacing: "-0.05em", lineHeight: 1, marginBottom: "var(--space-4)" }}>{s.num}</span>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-base)", fontWeight: 700, marginBottom: "var(--space-3)", letterSpacing: "-0.01em" }}>{s.title}</h3>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", lineHeight: 1.7 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
      <style>{`@media(max-width:700px){ .how-grid{ grid-template-columns:1fr !important; } }`}</style>
    </section>
  );
}

function CTASection({ onNavigate }) {
  return (
    <section style={{ padding: "clamp(3rem,7vw,5rem) 0" }}>
      <div style={{ maxWidth: 1160, marginInline: "auto", paddingInline: "clamp(1rem,4vw,3rem)" }}>
        <div className="reveal" style={{
          background: "linear-gradient(135deg,#1E3A5F 0%,#0f2040 100%)",
          borderRadius: "var(--radius-2xl)",
          padding: "clamp(2.5rem,6vw,4rem)",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 70% 50%, rgba(212,132,90,.2) 0%, transparent 60%)", pointerEvents: "none" }} />
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 800, color: "#fff", letterSpacing: "-0.035em", marginBottom: "var(--space-4)", position: "relative" }}>
            Ready to optimize your prices?
          </h2>
          <p style={{ fontSize: "var(--text-base)", color: "rgba(255,255,255,.65)", maxWidth: "50ch", margin: "0 auto var(--space-8)", position: "relative" }}>
            Get started in minutes. Choose a strategy, select your products, and let PriceOptima do the rest.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "var(--space-3)", flexWrap: "wrap", position: "relative" }}>
            <a href="#" onClick={onNavigate} style={{ display: "inline-flex", alignItems: "center", padding: ".8em 2em", borderRadius: "var(--radius-md)", fontWeight: 600, fontSize: "var(--text-base)", background: "var(--color-orange)", color: "#fff" }}>
              Get started for free
            </a>
            <a href="#features" style={{ display: "inline-flex", alignItems: "center", padding: ".8em 2em", borderRadius: "var(--radius-md)", fontWeight: 600, fontSize: "var(--text-base)", background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.2)" }}>
              Explore features
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--color-divider)", padding: "var(--space-10) 0" }}>
      <div style={{ maxWidth: 1160, marginInline: "auto", paddingInline: "clamp(1rem,4vw,3rem)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-6)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <LogoIcon size={26} />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-faint)", fontWeight: 600 }}>PriceOptima</span>
          </div>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-faint)" }}>© 2026 PriceOptima — Data Engineering PFE Project</span>
          <nav aria-label="Footer links" style={{ display: "flex", gap: "var(--space-6)" }}>
            {["About", "Privacy", "Contact"].map((l) => (
              <a key={l} href="#" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-faint)", transition: "color .18s" }}
                onMouseEnter={e => e.target.style.color = "var(--color-text-muted)"}
                onMouseLeave={e => e.target.style.color = "var(--color-text-faint)"}
              >{l}</a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}

/* ─── Main Page ────────────────────────────── */
export default function LandingPage({ onNavigate }) {
  const [theme, setTheme] = useState(() => {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useReveal();

  const handleNavigate = (e) => {
    e?.preventDefault?.();
    if (typeof onNavigate === "function") onNavigate();
  };

  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      <Navbar theme={theme} onToggle={() => setTheme(t => t === "dark" ? "light" : "dark")} onNavigate={handleNavigate} />
      <main>
        <Hero onNavigate={handleNavigate} />
        <div style={{ height: 1, background: "var(--color-divider)" }} />
        <Features />
        <div style={{ height: 1, background: "var(--color-divider)" }} />
        <HowItWorks />
        <div style={{ height: 1, background: "var(--color-divider)" }} />
        <CTASection onNavigate={handleNavigate} />
      </main>
      <Footer />
    </>
  );
}
