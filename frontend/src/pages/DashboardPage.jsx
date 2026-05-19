// frontend/src/pages/DashboardPage.jsx
import { useEffect, useRef, useState } from "react";
import { embedDashboard } from "@superset-ui/embedded-sdk";
import { getGuestToken } from "../api/api.js";

const SUPERSET_URL = import.meta.env.VITE_SUPERSET_URL || "http://localhost:8088";
const DASHBOARD_ID = import.meta.env.VITE_SUPERSET_DASHBOARD_ID;

export default function DashboardPage() {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!DASHBOARD_ID) {
      setError("Dashboard ID manquant dans les variables d'environnement.");
      setLoading(false);
      return;
    }

    const container = containerRef.current;
    if (!container) {
      setError("Conteneur non monté.");
      setLoading(false);
      return;
    }

    embedDashboard({
      id: DASHBOARD_ID,
      supersetDomain: SUPERSET_URL,
      mountPoint: container,
      fetchGuestToken: async () => {
        const data = await getGuestToken();
        return data.guest_token;
      },
      dashboardUiConfig: {
        hideTitle: false,
        hideChartControls: false,
        filters: { expanded: false },
      },
    })
      .then(() => {
        const iframe = container.querySelector("iframe");
        if (iframe) {
          iframe.style.width = "100%";
          iframe.style.height = "100%";
          iframe.style.minHeight = "calc(100vh - 64px)";
          iframe.style.border = "none";
          iframe.style.display = "block";
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Erreur lors du chargement du dashboard.");
        setLoading(false);
      });

    return () => {
      if (container) container.innerHTML = "";
    };
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "calc(100vh - 64px)",
        minHeight: "calc(100vh - 64px)",
        padding: 0,
        margin: 0,
        overflow: "hidden",
        background: "#f5f7fb",
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          minHeight: "calc(100vh - 64px)",
          border: "none",
          overflow: "hidden",
          display: loading || error ? "none" : "block",
        }}
      />

      {loading && !error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 12,
            color: "#666",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              border: "3px solid #e0e0e0",
              borderTop: "3px solid #01696f",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span style={{ fontSize: 14 }}>Chargement du dashboard...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 8,
            padding: 24,
          }}
        >
          <span style={{ fontSize: 16, color: "#a12c7b", fontWeight: 600 }}>
            Erreur de chargement
          </span>
          <span
            style={{
              fontSize: 13,
              color: "#666",
              maxWidth: 400,
              textAlign: "center",
            }}
          >
            {error}
          </span>
        </div>
      )}
    </div>
  );
}