// src/pages/LoginPage.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, register } from "../api/api.js";

/* ─── tokens locaux (synchronisés avec tokens.js) ─── */
const T = {
  bg:          "#F7F5F0",
  surface:     "#FDFCFA",
  surfaceAlt:  "#F2F0EB",
  border:      "#E2DDD6",
  borderStrong:"#C8C2B8",
  text:        "#1C1A17",
  muted:       "#6B6560",
  faint:       "#A09890",
  accent:      "#2C3E50",
  accentHov:   "#3D5268",
  accentBg:    "#E8EBF0",
  danger:      { bg: "#F5EDEB", text: "#7A3C2C", border: "#DEC8C2" },
  fontHead:    "'DM Serif Display', Georgia, serif",
  fontBody:    "'DM Sans', system-ui, sans-serif",
};

/* ─── Logo ─── */
function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9,
        background: T.accent,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="#FDFCFA" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="20" x2="21" y2="20" />
          <polyline points="3,16 7,11 11,13 16,6 21,8" />
          <circle cx="16" cy="6" r="1.8" fill="#FDFCFA" stroke="none" />
        </svg>
      </div>
      <div>
        <div style={{
          fontFamily: T.fontHead, fontSize: 15,
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

/* ─── Field ─── */
function Field({ label, type = "text", value, onChange, placeholder, autoComplete }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{
        fontFamily: T.fontBody, fontSize: 10, fontWeight: 700,
        color: T.faint, textTransform: "uppercase", letterSpacing: "0.09em",
      }}>{label}</label>
      <input
        type={type} value={value} onChange={onChange}
        placeholder={placeholder} autoComplete={autoComplete}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          fontFamily: T.fontBody, fontSize: 13,
          color: T.text, background: T.surface,
          border: `1px solid ${focused ? T.accent : T.borderStrong}`,
          borderRadius: 8, padding: "10px 13px",
          outline: "none", width: "100%",
          transition: "border-color 0.15s",
        }}
      />
    </div>
  );
}

/* ─── Alert ─── */
function Alert({ children }) {
  return (
    <div style={{
      fontFamily: T.fontBody, fontSize: 12,
      background: T.danger.bg, color: T.danger.text,
      border: `1px solid ${T.danger.border}`,
      borderRadius: 8, padding: "9px 13px", lineHeight: 1.5,
    }}>{children}</div>
  );
}

/* ─── LoginPage ─── */
export default function LoginPage() {
  const navigate = useNavigate();

  const [tab, setTab]         = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const [loginForm, setLoginForm] = useState({ work_mail: "", password: "" });
  const [regForm, setRegForm]     = useState({
    full_name: "", work_mail: "", company_name: "", password: "",
  });

  const setLF = (k) => (e) => setLoginForm((p) => ({ ...p, [k]: e.target.value }));
  const setRF = (k) => (e) => setRegForm((p)  => ({ ...p, [k]: e.target.value }));

  const handleLogin = async () => {
    if (!loginForm.work_mail || !loginForm.password) {
      setError("Email et mot de passe requis."); return;
    }
    setLoading(true); setError(null);
    try {
      const data = await login({ work_mail: loginForm.work_mail, password: loginForm.password });
      if (data?.user)         localStorage.setItem("currentuser",   JSON.stringify(data.user));
      if (data?.access_token) {
        localStorage.setItem("accesstoken",  data.access_token);
        localStorage.setItem("access_token", data.access_token);
      }
      navigate("/pricing-rules/scope", { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!regForm.full_name || !regForm.work_mail || !regForm.company_name || !regForm.password) {
      setError("Tous les champs sont requis."); return;
    }
    if (regForm.password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères."); return;
    }
    setLoading(true); setError(null);
    try {
      const data = await register({
        full_name:    regForm.full_name,
        work_mail:    regForm.work_mail,
        company_name: regForm.company_name,
        password:     regForm.password,
      });
      if (data?.access_token) {
        localStorage.setItem("accesstoken",  data.access_token);
        localStorage.setItem("access_token", data.access_token);
      }
      if (data?.user) localStorage.setItem("currentuser", JSON.stringify(data.user));
      navigate("/pricing-rules/scope", { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (fn) => (e) => { if (e.key === "Enter") fn(); };

  /* ── bouton submit ── */
  const [btnHov, setBtnHov] = useState(false);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');
        @keyframes lp-spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: T.bg,
        display: "flex",
        fontFamily: T.fontBody,
      }}>
        {/* ── panneau gauche (brand / déco) ── */}
        <div style={{
          flex: "0 0 420px",
          background: T.accent,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 52px",
        }} className="lp-left-panel">

          {/* logo */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 64 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: "rgba(253,252,250,0.12)",
                border: "1px solid rgba(253,252,250,0.18)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="#FDFCFA" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="20" x2="21" y2="20" />
                  <polyline points="3,16 7,11 11,13 16,6 21,8" />
                  <circle cx="16" cy="6" r="1.8" fill="#FDFCFA" stroke="none" />
                </svg>
              </div>
              <div>
                <div style={{
                  fontFamily: T.fontHead, fontSize: 16,
                  color: "#FDFCFA", letterSpacing: "-0.02em",
                }}>PriceOptima</div>
                <div style={{
                  fontFamily: T.fontBody, fontSize: 9, fontWeight: 600,
                  color: "rgba(253,252,250,0.45)", letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}>Pricing Intelligence</div>
              </div>
            </div>

            {/* headline */}
            <h2 style={{
              fontFamily: T.fontHead,
              fontSize: "clamp(1.8rem,2.5vw,2.4rem)",
              fontWeight: 400,
              color: "#FDFCFA",
              lineHeight: 1.2,
              letterSpacing: "-0.025em",
              marginBottom: 20,
            }}>
              Des prix pilotés<br />par la <em>donnée</em>.
            </h2>
            <p style={{
              fontFamily: T.fontBody, fontSize: 13,
              color: "rgba(253,252,250,0.55)", lineHeight: 1.75,
              maxWidth: "34ch",
            }}>
              Analysez vos concurrents en temps réel et appliquez automatiquement vos stratégies de pricing, règle par règle.
            </p>
          </div>

          {/* stats */}
          <div style={{
            display: "flex", flexDirection: "column", gap: 24,
            paddingTop: 40, borderTop: "1px solid rgba(253,252,250,0.12)",
          }}>
            {[
              { val: "12 000+", lbl: "Produits analysés" },
              { val: "4",       lbl: "Stratégies prêtes à l'emploi" },
              { val: "97 %",    lbl: "Précision des prix calculés" },
            ].map((s) => (
              <div key={s.val} style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{
                  fontFamily: T.fontHead, fontSize: 22,
                  color: "#FDFCFA", letterSpacing: "-0.02em",
                }}>{s.val}</span>
                <span style={{
                  fontFamily: T.fontBody, fontSize: 11,
                  color: "rgba(253,252,250,0.45)",
                }}>{s.lbl}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── panneau droit (formulaire) ── */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "clamp(2rem,4vw,3rem)",
        }}>
          <div style={{ width: "100%", maxWidth: 400 }}>

            {/* logo (mobile) */}
            <div style={{ marginBottom: 36 }} className="lp-logo-mobile">
              <Logo />
            </div>

            {/* title */}
            <h1 style={{
              fontFamily: T.fontHead, fontSize: "clamp(1.6rem,2.5vw,2rem)",
              fontWeight: 400, color: T.text,
              letterSpacing: "-0.025em", marginBottom: 6,
            }}>
              {tab === "login" ? "Connexion" : "Créer un compte"}
            </h1>
            <p style={{
              fontFamily: T.fontBody, fontSize: 13,
              color: T.muted, marginBottom: 28, lineHeight: 1.55,
            }}>
              {tab === "login"
                ? "Accédez à votre espace de gestion des stratégies de prix."
                : "Rejoignez PriceOptima et optimisez vos prix dès aujourd'hui."}
            </p>

            {/* tabs */}
            <div style={{
              display: "flex",
              background: T.surfaceAlt,
              borderRadius: 10, padding: 4,
              marginBottom: 28,
            }}>
              {[
                { key: "login",    label: "Connexion"   },
                { key: "register", label: "Inscription" },
              ].map((t) => (
                <button key={t.key} onClick={() => { setTab(t.key); setError(null); }} style={{
                  flex: 1, padding: "8px 0",
                  border: "none", cursor: "pointer",
                  fontFamily: T.fontBody, fontSize: 13,
                  fontWeight: tab === t.key ? 600 : 400,
                  color:      tab === t.key ? T.text   : T.muted,
                  background: tab === t.key ? T.surface : "transparent",
                  borderRadius: 7,
                  boxShadow:  tab === t.key ? "0 1px 3px rgba(28,26,23,0.07)" : "none",
                  transition: "all 0.15s",
                }}>{t.label}</button>
              ))}
            </div>

            {/* form */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
              onKeyDown={handleKey(tab === "login" ? handleLogin : handleRegister)}
            >
              {error && <Alert>{error}</Alert>}

              {tab === "register" && (
                <>
                  <Field label="Nom complet"         value={regForm.full_name}    onChange={setRF("full_name")}    placeholder="Yasmine Ben Yamna"    autoComplete="name" />
                  <Field label="Email professionnel" type="email" value={regForm.work_mail} onChange={setRF("work_mail")} placeholder="vous@entreprise.com"  autoComplete="email" />
                  <Field label="Entreprise"          value={regForm.company_name} onChange={setRF("company_name")} placeholder="RetailLab"             autoComplete="organization" />
                </>
              )}

              {tab === "login" && (
                <Field label="Email professionnel" type="email" value={loginForm.work_mail} onChange={setLF("work_mail")} placeholder="vous@entreprise.com" autoComplete="email" />
              )}

              <Field
                label="Mot de passe" type="password"
                value={tab === "login" ? loginForm.password : regForm.password}
                onChange={tab === "login" ? setLF("password") : setRF("password")}
                placeholder="Min. 8 caractères"
                autoComplete={tab === "login" ? "current-password" : "new-password"}
              />

              <button
                onClick={tab === "login" ? handleLogin : handleRegister}
                disabled={loading}
                onMouseEnter={() => setBtnHov(true)}
                onMouseLeave={() => setBtnHov(false)}
                style={{
                  marginTop: 4,
                  width: "100%", padding: "12px 0",
                  fontFamily: T.fontBody, fontSize: 13, fontWeight: 600,
                  background: loading ? T.borderStrong : btnHov ? T.accentHov : T.accent,
                  color: "#FDFCFA", border: "none",
                  borderRadius: 9, cursor: loading ? "not-allowed" : "pointer",
                  transition: "background 0.15s",
                  display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 8,
                }}
              >
                {loading && (
                  <div style={{
                    width: 14, height: 14,
                    border: "2px solid rgba(253,252,250,0.35)",
                    borderTopColor: "#FDFCFA",
                    borderRadius: 99,
                    animation: "lp-spin 0.65s linear infinite",
                  }} />
                )}
                {tab === "login" ? "Se connecter" : "Créer mon compte"}
              </button>
            </div>

            {/* divider + back */}
            <div style={{
              marginTop: 28,
              paddingTop: 20,
              borderTop: `1px solid ${T.border}`,
              display: "flex", justifyContent: "center",
            }}>
              <button onClick={() => window.history.back()} style={{
                fontFamily: T.fontBody, fontSize: 12,
                color: T.faint, background: "none", border: "none",
                cursor: "pointer", transition: "color 0.15s",
              }}
                onMouseEnter={e => e.currentTarget.style.color = T.muted}
                onMouseLeave={e => e.currentTarget.style.color = T.faint}
              >← Retour à l'accueil</button>
            </div>

          </div>
        </div>
      </div>

      {/* responsive */}
      <style>{`
        @media (max-width: 760px) {
          .lp-left-panel  { display: none !important; }
          .lp-logo-mobile { display: block !important; }
        }
        .lp-logo-mobile { display: none; }
      `}</style>
    </>
  );
}