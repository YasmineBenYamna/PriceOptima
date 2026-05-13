// src/pages/LandingPage.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/* ─── Design tokens synchronisés avec le nouveau global.css ─── */
const T = {
  bg:          "#F7F5F0",
  surface:     "#FDFCFA",
  surfaceAlt:  "#F2F0EB",
  border:      "#E2DDD6",
  borderStrong:"#C8C2B8",
  text:        "#1C1A17",
  muted:       "#6B6560",
  faint:       "#A09890",
  accent:      "#2C3E50",   // ardoise
  accentHov:   "#3D5268",
  sage:        "#4A5D52",   // mousse — succès / positif
  warm:        "#7A5C3A",   // fauve — warning
  fontHead:    "'DM Serif Display', Georgia, serif",
  fontBody:    "'DM Sans', system-ui, sans-serif",
  fontMono:    "'DM Mono', monospace",
};

/* ─── Utility : scroll reveal ─── */
function useReveal() {
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("lp-visible");
            obs.unobserve(e.target);
          }
        }),
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    document.querySelectorAll(".lp-reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
}

/* ─── Counter animation ─── */
function animateCount(el, target, suffix = "") {
  let start = 0;
  const duration = 1600;
  const step = (ts) => {
    if (!start) start = ts;
    const p = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 4);
    const val = Math.round(ease * target).toLocaleString("en");
    el.textContent = val + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ─── Logo ─── */
function Logo({ size = "sm" }) {
  const lg = size === "lg";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: lg ? 12 : 9 }}>
      <div style={{
        width: lg ? 40 : 32, height: lg ? 40 : 32,
        borderRadius: lg ? 10 : 8,
        background: T.accent,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <svg width={lg ? 18 : 15} height={lg ? 18 : 15} viewBox="0 0 24 24"
          fill="none" stroke="#FDFCFA" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="20" x2="21" y2="20" />
          <polyline points="3,16 7,11 11,13 16,6 21,8" />
          <circle cx="16" cy="6" r="1.8" fill="#FDFCFA" stroke="none" />
        </svg>
      </div>
      <div>
        <div style={{
          fontFamily: T.fontHead, fontSize: lg ? 17 : 14,
          color: T.text, lineHeight: 1.2, letterSpacing: "-0.02em",
        }}>PriceOptima</div>
        <div style={{
          fontFamily: T.fontBody, fontSize: 9, fontWeight: 600,
          color: T.faint, letterSpacing: "0.1em", textTransform: "uppercase",
        }}>Pricing Intelligence</div>
      </div>
    </div>
  );
}

/* ─── Navbar ─── */
function Navbar({ onNavigate }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 100,
      background: scrolled ? "rgba(253,252,250,0.92)" : T.surface,
      borderBottom: `1px solid ${scrolled ? T.border : "transparent"}`,
      backdropFilter: scrolled ? "blur(16px)" : "none",
      transition: "border-color 0.25s, background 0.25s",
    }}>
      <div style={{
        maxWidth: 1140, marginInline: "auto",
        paddingInline: "clamp(1.25rem,4vw,3rem)",
        display: "flex", alignItems: "center",
        justifyContent: "space-between", height: 64,
      }}>
        <Logo />

        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {[["#features", "Features"], ["#how", "How it works"]].map(([href, label]) => (
            <a key={href} href={href} style={{
              fontFamily: T.fontBody, fontSize: 13, fontWeight: 500,
              color: T.muted, textDecoration: "none", transition: "color 0.15s",
            }}
              onMouseEnter={e => e.target.style.color = T.text}
              onMouseLeave={e => e.target.style.color = T.muted}
            >{label}</a>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={onNavigate} style={{
            fontFamily: T.fontBody, fontSize: 13, fontWeight: 500,
            color: T.muted, background: "none", border: "none", cursor: "pointer",
            padding: "8px 16px", borderRadius: 8,
            transition: "color 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.color = T.text}
            onMouseLeave={e => e.currentTarget.style.color = T.muted}
          >
            Se connecter
          </button>
          <button onClick={onNavigate} style={{
            fontFamily: T.fontBody, fontSize: 13, fontWeight: 600,
            background: T.accent, color: "#FDFCFA",
            border: "none", cursor: "pointer",
            padding: "9px 20px", borderRadius: 9,
            transition: "background 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.background = T.accentHov}
            onMouseLeave={e => e.currentTarget.style.background = T.accent}
          >
            Commencer →
          </button>
        </div>
      </div>
    </nav>
  );
}

/* ─── Dashboard preview card ─── */
function DashboardPreview() {
  const bars = [38, 52, 44, 68, 57, 82, 74];
  const rules = [
    { label: "Competitor Beat Rule", coeff: "0.50", dot: T.sage },
    { label: "Floor Price Rule",     coeff: "0.30", dot: T.warm },
    { label: "Market Average Rule",  coeff: "0.20", dot: T.faint },
  ];
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 20,
      padding: 24,
      boxShadow: "0 16px 48px rgba(28,26,23,0.10)",
      transform: "perspective(1100px) rotateY(-5deg) rotateX(2deg)",
      transition: "transform 0.4s ease",
    }}
      onMouseEnter={e => e.currentTarget.style.transform = "perspective(1100px) rotateY(-1deg) rotateX(0deg)"}
      onMouseLeave={e => e.currentTarget.style.transform = "perspective(1100px) rotateY(-5deg) rotateX(2deg)"}
    >
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingBottom: 16, marginBottom: 16,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <span style={{
          fontFamily: T.fontBody, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.07em", textTransform: "uppercase", color: T.muted,
        }}>
          AGGRESSIVE — live view
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "3px 9px",
          borderRadius: 99, background: "#EBF0ED", color: T.sage,
          border: `1px solid #C2D0C9`,
        }}>● Active</span>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {[
          { val: "€ 3.47", lbl: "Prix calculé",       delta: "▼ −2.1% vs marché", up: false },
          { val: "214",    lbl: "Produits traités",    delta: "▲ +38 ce mois",     up: true  },
        ].map((k, i) => (
          <div key={i} style={{
            background: T.surfaceAlt, borderRadius: 12, padding: "14px 16px",
          }}>
            <div style={{
              fontFamily: T.fontHead, fontSize: 22, color: T.text,
              letterSpacing: "-0.02em", lineHeight: 1,
            }}>{k.val}</div>
            <div style={{
              fontFamily: T.fontBody, fontSize: 10, color: T.faint,
              textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4,
            }}>{k.lbl}</div>
            <div style={{
              fontFamily: T.fontBody, fontSize: 11, fontWeight: 600,
              marginTop: 6, color: k.up ? T.sage : T.warm,
            }}>{k.delta}</div>
          </div>
        ))}
      </div>

      {/* chart */}
      <div style={{
        background: T.surfaceAlt, borderRadius: 12, padding: 14, marginBottom: 14,
      }}>
        <div style={{
          fontFamily: T.fontBody, fontSize: 10, color: T.faint,
          textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10,
        }}>Tendance prix — 7 jours</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 48 }}>
          {bars.map((h, i) => (
            <div key={i} style={{
              flex: 1, height: `${h}%`, borderRadius: "3px 3px 0 0",
              background: h === 82
                ? T.accent
                : `rgba(44,62,80,${0.25 + (h / 100) * 0.45})`,
              transition: "opacity 0.2s",
            }} />
          ))}
        </div>
      </div>

      {/* rules */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rules.map((r, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            padding: "7px 12px",
            background: T.surfaceAlt, borderRadius: 8,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 6, height: 6, borderRadius: 99, background: r.dot }} />
              <span style={{ fontFamily: T.fontBody, fontSize: 12, fontWeight: 500, color: T.text }}>{r.label}</span>
            </div>
            <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.muted }}>{r.coeff}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Hero stats counters ─── */
function HeroStats() {
  const ref  = useRef(null);
  const nums = useRef([]);
  const data = [
    { val: 12000, suffix: "+",  label: "Produits analysés"  },
    { val: 4,     suffix: "",   label: "Stratégies prêtes"  },
    { val: 97,    suffix: "%",  label: "Précision des prix" },
  ];
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        nums.current.forEach((el, i) => el && animateCount(el, data[i].val, data[i].suffix));
        obs.disconnect();
      }
    }, { threshold: 0.5 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{
      display: "flex", gap: 36, marginTop: 40,
      paddingTop: 32, borderTop: `1px solid ${T.border}`,
    }}>
      {data.map((s, i) => (
        <div key={i}>
          <div ref={el => nums.current[i] = el} style={{
            fontFamily: T.fontHead, fontSize: 28, color: T.text,
            letterSpacing: "-0.03em", lineHeight: 1,
          }}>—</div>
          <div style={{
            fontFamily: T.fontBody, fontSize: 10, color: T.faint,
            textTransform: "uppercase", letterSpacing: "0.09em", marginTop: 4,
          }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── Hero ─── */
function Hero({ onNavigate }) {
  return (
    <section style={{
      padding: "clamp(4rem,9vw,6rem) 0 clamp(3rem,7vw,5rem)",
      overflow: "hidden",
    }}>
      <div style={{
        maxWidth: 1140, marginInline: "auto",
        paddingInline: "clamp(1.25rem,4vw,3rem)",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "clamp(2rem,5vw,4rem)",
          alignItems: "center",
        }} className="lp-hero-grid">
          {/* left */}
          <div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "4px 12px", borderRadius: 99,
              background: T.surfaceAlt, border: `1px solid ${T.border}`,
              fontFamily: T.fontBody, fontSize: 10, fontWeight: 700,
              color: T.muted, letterSpacing: "0.09em", textTransform: "uppercase",
              marginBottom: 28,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: T.sage, display: "inline-block" }} />
              Plateforme de pricing intelligent
            </div>

            <h1 style={{
              fontFamily: T.fontHead, fontSize: "clamp(2.4rem,4.5vw,3.6rem)",
              fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 1.1,
              color: T.text, marginBottom: 24,
            }}>
              Des prix pilotés<br />par la <em style={{ fontStyle: "italic", color: T.accent }}>donnée</em>,<br />pas l'intuition.
            </h1>

            <p style={{
              fontFamily: T.fontBody, fontSize: "clamp(14px,1.5vw,16px)",
              color: T.muted, lineHeight: 1.75, maxWidth: "50ch", marginBottom: 32,
            }}>
              PriceOptima analyse vos concurrents en temps réel et applique automatiquement vos stratégies de prix — règle par règle, produit par produit.
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={onNavigate} style={{
                fontFamily: T.fontBody, fontSize: 13, fontWeight: 600,
                background: T.accent, color: "#FDFCFA",
                border: "none", cursor: "pointer",
                padding: "12px 28px", borderRadius: 9,
                transition: "background 0.15s",
              }}
                onMouseEnter={e => e.currentTarget.style.background = T.accentHov}
                onMouseLeave={e => e.currentTarget.style.background = T.accent}
              >
                Commencer gratuitement
              </button>
              <a href="#how" style={{
                fontFamily: T.fontBody, fontSize: 13, fontWeight: 500,
                color: T.muted, background: "none",
                border: `1px solid ${T.border}`,
                padding: "12px 24px", borderRadius: 9,
                textDecoration: "none", transition: "border-color 0.15s, color 0.15s",
                display: "inline-flex", alignItems: "center",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.borderStrong; e.currentTarget.style.color = T.text; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
              >
                Voir comment ça marche
              </a>
            </div>

            <HeroStats />
          </div>

          {/* right */}
          <div aria-hidden="true"><DashboardPreview /></div>
        </div>
      </div>
    </section>
  );
}

/* ─── Features ─── */
function Features() {
  const feats = [
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
      title: "Veille concurrentielle temps réel",
      desc:  "Collecte et analyse des prix concurrents depuis Open Prices et Open Food Facts. Toujours au fait des mouvements du marché.",
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" /><path d="M14 17h6M17 14v6" />
        </svg>
      ),
      title: "Règles de pricing modulaires",
      desc:  "Configurez des règles indépendantes — Floor Price, Competitor Beat, Market Average — et combinez-les avec des coefficients pondérés.",
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
        </svg>
      ),
      title: "Stratégies prêtes & custom",
      desc:  "Choisissez parmi AGGRESSIVE, COMPETITIVE, ALIGNED ou construisez votre propre stratégie avec des règles et coefficients personnalisés.",
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
      title: "Pipeline Airflow automatisé",
      desc:  "Les DAGs Apache Airflow orchestrent toute la chaîne — collecte, transformation SQLMesh, calcul — sans aucune intervention manuelle.",
    },
  ];

  return (
    <section id="features" style={{ padding: "clamp(3.5rem,7vw,5.5rem) 0" }}>
      <div style={{
        maxWidth: 1140, marginInline: "auto",
        paddingInline: "clamp(1.25rem,4vw,3rem)",
      }}>
        {/* heading */}
        <div className="lp-reveal" style={{ maxWidth: 560, marginBottom: 48 }}>
          <div style={{
            fontFamily: T.fontBody, fontSize: 10, fontWeight: 700,
            color: T.faint, letterSpacing: "0.12em", textTransform: "uppercase",
            marginBottom: 14,
          }}>Fonctionnalités</div>
          <h2 style={{
            fontFamily: T.fontHead, fontSize: "clamp(1.8rem,3vw,2.6rem)",
            fontWeight: 400, letterSpacing: "-0.025em", color: T.text,
            lineHeight: 1.15, marginBottom: 16,
          }}>
            Tout ce qu'il faut<br />pour un pricing compétitif.
          </h2>
          <p style={{
            fontFamily: T.fontBody, fontSize: 14, color: T.muted, lineHeight: 1.7,
          }}>
            Un pipeline complet, de la collecte des prix concurrents jusqu'au calcul automatique du prix optimal.
          </p>
        </div>

        {/* grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
        }}>
          {feats.map((f, i) => (
            <div key={i} className="lp-reveal" style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 16, padding: 28,
              boxShadow: "0 1px 3px rgba(28,26,23,0.05)",
              transition: "box-shadow 0.2s, transform 0.2s",
              transitionDelay: `${i * 0.06}s`,
            }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 24px rgba(28,26,23,0.09)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(28,26,23,0.05)"; e.currentTarget.style.transform = "none"; }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: T.surfaceAlt, border: `1px solid ${T.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: T.accent, marginBottom: 18,
              }}>{f.icon}</div>
              <h3 style={{
                fontFamily: T.fontBody, fontSize: 14, fontWeight: 600,
                color: T.text, marginBottom: 8, letterSpacing: "-0.01em",
              }}>{f.title}</h3>
              <p style={{
                fontFamily: T.fontBody, fontSize: 13,
                color: T.muted, lineHeight: 1.7,
              }}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* strategy preview inset */}
        <div className="lp-reveal" style={{
          marginTop: 16,
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 16, padding: 28,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "clamp(1.5rem,4vw,3rem)",
          alignItems: "center",
        }} className="lp-reveal lp-inset-grid">
          <div>
            <div style={{
              fontFamily: T.fontBody, fontSize: 10, fontWeight: 700,
              color: T.faint, letterSpacing: "0.12em", textTransform: "uppercase",
              marginBottom: 12,
            }}>Stratégie AGGRESSIVE — coefficients</div>
            <h3 style={{
              fontFamily: T.fontHead, fontSize: "clamp(1.3rem,2vw,1.7rem)",
              fontWeight: 400, color: T.text, marginBottom: 12, letterSpacing: "-0.02em",
            }}>Pondérez chaque règle selon votre priorité.</h3>
            <p style={{
              fontFamily: T.fontBody, fontSize: 13, color: T.muted, lineHeight: 1.7,
            }}>
              Chaque stratégie est composée de règles indépendantes auxquelles vous assignez un poids. La somme des coefficients doit toujours être égale à 1.0.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { name: "Competitor Beat", pct: 50, color: T.accent     },
              { name: "Floor Price",     pct: 30, color: T.sage       },
              { name: "Market Average",  pct: 20, color: T.warm       },
            ].map((r) => (
              <div key={r.name}>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  fontFamily: T.fontBody, fontSize: 12,
                  color: T.text, marginBottom: 5,
                }}>
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                  <span style={{ color: T.muted, fontFamily: T.fontMono }}>{r.pct}%</span>
                </div>
                <div style={{
                  height: 4, background: T.surfaceAlt,
                  borderRadius: 99, overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", width: `${r.pct}%`,
                    background: r.color, borderRadius: 99,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── How It Works ─── */
function HowItWorks() {
  const steps = [
    { num: "01", title: "Sélectionnez vos produits",    desc: "Par EAN, marque ou catégorie. Importez votre catalogue depuis Open Food Facts ou saisissez vos EANs manuellement." },
    { num: "02", title: "Configurez une stratégie",     desc: "Choisissez AGGRESSIVE, COMPETITIVE, ALIGNED ou créez une stratégie CUSTOM en ajustant les coefficients de chaque règle." },
    { num: "03", title: "Lancez le calcul",             desc: "Le moteur de pricing applique vos règles, Airflow orchestre l'exécution et vous obtenez vos prix optimaux en quelques secondes." },
  ];

  return (
    <section id="how" style={{ padding: "clamp(3.5rem,7vw,5.5rem) 0", background: T.surfaceAlt }}>
      <div style={{
        maxWidth: 1140, marginInline: "auto",
        paddingInline: "clamp(1.25rem,4vw,3rem)",
      }}>
        <div className="lp-reveal" style={{ maxWidth: 480, marginBottom: 52 }}>
          <div style={{
            fontFamily: T.fontBody, fontSize: 10, fontWeight: 700,
            color: T.faint, letterSpacing: "0.12em", textTransform: "uppercase",
            marginBottom: 14,
          }}>Comment ça marche</div>
          <h2 style={{
            fontFamily: T.fontHead, fontSize: "clamp(1.8rem,3vw,2.6rem)",
            fontWeight: 400, letterSpacing: "-0.025em", color: T.text,
            lineHeight: 1.15, marginBottom: 14,
          }}>Simple. Puissant. Automatique.</h2>
          <p style={{ fontFamily: T.fontBody, fontSize: 14, color: T.muted, lineHeight: 1.7 }}>
            Trois étapes de la donnée brute au prix optimal.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 2,
          background: T.border,
          border: `1px solid ${T.border}`,
          borderRadius: 16, overflow: "hidden",
        }} className="lp-how-grid">
          {steps.map((s, i) => (
            <div key={i} className="lp-reveal" style={{
              background: T.surface,
              padding: "clamp(1.5rem,3vw,2.5rem)",
              transitionDelay: `${i * 0.08}s`,
            }}>
              <div style={{
                fontFamily: T.fontHead, fontSize: 48,
                color: T.border, lineHeight: 1,
                marginBottom: 20, letterSpacing: "-0.04em",
              }}>{s.num}</div>
              <h3 style={{
                fontFamily: T.fontBody, fontSize: 14, fontWeight: 600,
                color: T.text, marginBottom: 10, letterSpacing: "-0.01em",
              }}>{s.title}</h3>
              <p style={{
                fontFamily: T.fontBody, fontSize: 13,
                color: T.muted, lineHeight: 1.7,
              }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── CTA ─── */
function CTA({ onNavigate }) {
  return (
    <section style={{ padding: "clamp(3.5rem,7vw,5.5rem) 0" }}>
      <div style={{
        maxWidth: 1140, marginInline: "auto",
        paddingInline: "clamp(1.25rem,4vw,3rem)",
      }}>
        <div className="lp-reveal" style={{
          background: T.accent,
          borderRadius: 20, padding: "clamp(2.5rem,5vw,4rem)",
          display: "flex", flexDirection: "column", alignItems: "center",
          textAlign: "center", gap: 24,
        }}>
          <h2 style={{
            fontFamily: T.fontHead, fontSize: "clamp(1.8rem,3vw,2.6rem)",
            fontWeight: 400, color: "#FDFCFA",
            letterSpacing: "-0.03em", lineHeight: 1.15, maxWidth: 520,
          }}>
            Prêt à optimiser vos prix ?
          </h2>
          <p style={{
            fontFamily: T.fontBody, fontSize: 14,
            color: "rgba(253,252,250,0.65)", maxWidth: "50ch", lineHeight: 1.7,
          }}>
            Démarrez en quelques minutes. Choisissez une stratégie, sélectionnez vos produits, et laissez PriceOptima faire le reste.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <button onClick={onNavigate} style={{
              fontFamily: T.fontBody, fontSize: 13, fontWeight: 600,
              background: "#FDFCFA", color: T.accent,
              border: "none", cursor: "pointer",
              padding: "12px 28px", borderRadius: 9,
              transition: "opacity 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.9"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              Commencer maintenant
            </button>
            <a href="#features" style={{
              fontFamily: T.fontBody, fontSize: 13, fontWeight: 500,
              color: "rgba(253,252,250,0.7)",
              border: "1px solid rgba(253,252,250,0.2)",
              background: "rgba(253,252,250,0.08)",
              padding: "12px 24px", borderRadius: 9,
              textDecoration: "none", display: "inline-flex",
              transition: "background 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(253,252,250,0.14)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(253,252,250,0.08)"}
            >
              Explorer les fonctionnalités
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ─── */
function Footer() {
  return (
    <footer style={{
      borderTop: `1px solid ${T.border}`,
      padding: "32px 0",
    }}>
      <div style={{
        maxWidth: 1140, marginInline: "auto",
        paddingInline: "clamp(1.25rem,4vw,3rem)",
        display: "flex", alignItems: "center",
        justifyContent: "space-between", flexWrap: "wrap", gap: 16,
      }}>
        <Logo />
        <span style={{
          fontFamily: T.fontBody, fontSize: 12, color: T.faint,
        }}>© 2026 PriceOptima — Projet PFE Data Engineering</span>
        <div style={{ display: "flex", gap: 24 }}>
          {["À propos", "Confidentialité", "Contact"].map(l => (
            <a key={l} href="#" style={{
              fontFamily: T.fontBody, fontSize: 12, color: T.faint,
              textDecoration: "none", transition: "color 0.15s",
            }}
              onMouseEnter={e => e.target.style.color = T.muted}
              onMouseLeave={e => e.target.style.color = T.faint}
            >{l}</a>
          ))}
        </div>
      </div>
    </footer>
  );
}

/* ─── Page styles (scoped, ne polluent pas global.css) ─── */
const PAGE_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=DM+Mono:wght@400;500&display=swap');

  .lp-reveal {
    opacity: 0;
    transform: translateY(18px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  }
  .lp-reveal.lp-visible {
    opacity: 1;
    transform: none;
  }

  @media (max-width: 860px) {
    .lp-hero-grid  { grid-template-columns: 1fr !important; }
    .lp-hero-grid > div:last-child { display: none; }
    .lp-how-grid   { grid-template-columns: 1fr !important; }
    .lp-inset-grid { grid-template-columns: 1fr !important; }
  }
`;

/* ─── Root ─── */
export default function LandingPage() {
  const navigate = useNavigate();
  useReveal();

  const go = (e) => { e?.preventDefault?.(); navigate("/login"); };

  return (
    <>
      <style>{PAGE_STYLE}</style>
      <div style={{ background: T.bg, minHeight: "100vh", fontFamily: T.fontBody }}>
        <Navbar onNavigate={go} />
        <main>
          <Hero    onNavigate={go} />
          <div style={{ height: 1, background: T.border }} />
          <Features />
          <div style={{ height: 1, background: T.border }} />
          <HowItWorks />
          <div style={{ height: 1, background: T.border }} />
          <CTA onNavigate={go} />
        </main>
        <Footer />
      </div>
    </>
  );
}