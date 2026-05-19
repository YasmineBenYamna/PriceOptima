import { useEffect, useRef, useState, useCallback } from "react";
import { getGuestToken } from "../api/api.js";

const SUPERSET_URL = import.meta.env.VITE_SUPERSET_URL || "http://localhost:8088";

const DASHBOARDS = [
  { id: "1", label: "Market Overview",   description: "Pricing trends and market positioning" },
  { id: "2", label: "Store Performance", description: "Store-level pricing and sales metrics" },
];

export default function DashboardPage() {
  const iframeRef                 = useRef(null);
  const [activeDashboard, setActiveDashboard] = useState("1");
  const [iframeSrc, setIframeSrc] = useState(null);
  const [error,   setError]       = useState(null);
  const [loading, setLoading]     = useState(true);

  const loadDashboard = useCallback(async (dashboardId) => {
    setLoading(true);
    setError(null);
    setIframeSrc(null);

    try {
      const data        = await getGuestToken(dashboardId);
      const guestToken  = data.guest_token;

      // Build the Superset standalone URL with the guest token
      const url = `${SUPERSET_URL}/superset/dashboard/${dashboardId}/?standalone=3&guest_token=${encodeURIComponent(guestToken)}`;
      setIframeSrc(url);
    } catch (err) {
      setError(err.message || "Failed to load dashboard.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard(activeDashboard);
  }, [activeDashboard, loadDashboard]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)", background: "#f5f7fb" }}>

      {/* ── Tab bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "10px 24px 0", background: "#ffffff",
        borderBottom: "1.5px solid #E8EEF7", flexShrink: 0,
      }}>
        {DASHBOARDS.map((d) => {
          const active = activeDashboard === d.id;
          return (
            <button
              key={d.id}
              onClick={() => setActiveDashboard(d.id)}
              style={{
                padding: "10px 20px", fontSize: 13,
                fontWeight: active ? 700 : 500,
                color: active ? "#1E3A5F" : "#6B7280",
                background: "none", border: "none",
                borderBottom: active ? "2.5px solid #1E3A5F" : "2.5px solid transparent",
                cursor: "pointer", marginBottom: -1.5, transition: "all 0.15s",
              }}
            >
              {d.label}
            </button>
          );
        })}

        <button
          onClick={() => loadDashboard(activeDashboard)}
          title="Refresh"
          style={{
            marginLeft: "auto", padding: "6px 14px", fontSize: 12,
            fontWeight: 600, color: "#1E3A5F", background: "#F4F7FF",
            border: "1.5px solid #C7D7F0", borderRadius: 8,
            cursor: "pointer", marginBottom: 8,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0020.49 15"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Description ── */}
      {!loading && !error && (
        <div style={{
          padding: "8px 24px", fontSize: 12, color: "#6B7280",
          background: "#ffffff", borderBottom: "1px solid #E8EEF7", flexShrink: 0,
        }}>
          {DASHBOARDS.find((d) => d.id === activeDashboard)?.description}
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

        {/* Iframe — shown once src is set */}
        {iframeSrc && (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            onLoad={() => setLoading(false)}
            onError={() => { setError("Dashboard failed to load."); setLoading(false); }}
            style={{
              width: "100%", height: "100%",
              border: "none", display: loading ? "none" : "block",
            }}
            title={DASHBOARDS.find((d) => d.id === activeDashboard)?.label}
          />
        )}

        {/* Spinner */}
        {loading && !error && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 12, color: "#666",
          }}>
            <div style={{
              width: 32, height: 32,
              border: "3px solid #e0e0e0", borderTop: "3px solid #1E3A5F",
              borderRadius: "50%", animation: "spin 0.8s linear infinite",
            }}/>
            <span style={{ fontSize: 14 }}>
              Loading {DASHBOARDS.find((d) => d.id === activeDashboard)?.label}…
            </span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 12, padding: 24,
          }}>
            <span style={{ fontSize: 32 }}>⚠️</span>
            <span style={{ fontSize: 15, color: "#991B1B", fontWeight: 700 }}>
              Dashboard failed to load
            </span>
            <span style={{ fontSize: 13, color: "#666", maxWidth: 400, textAlign: "center" }}>
              {error}
            </span>
            <button
              onClick={() => loadDashboard(activeDashboard)}
              style={{
                padding: "8px 20px", fontSize: 13, fontWeight: 700,
                color: "#fff", background: "#1E3A5F",
                border: "none", borderRadius: 8, cursor: "pointer", marginTop: 4,
              }}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}