// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Sidebar from './components/layout/Sidebar.jsx';

import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ProductScopePage from './pages/ProductScopePage.jsx';
import StrategyConfigurationPage from './pages/StrategyConfigurationPage.jsx';
import RuleConfigurationPage from './pages/RuleConfigurationPage.jsx';
import JobsPage from './pages/JobsPage.jsx';

const LAYOUT_BG = 'var(--color-bg)';
const LAYOUT_BORDER = 'var(--color-border)';

function AppLayout({ children }) {
  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: LAYOUT_BG,
      }}
    >
      <Sidebar />
      <main
        style={{
          flex: 1,
          padding: '28px 32px',
          borderLeft: `1px solid ${LAYOUT_BORDER}`,
          overflowY: 'auto',
          minWidth: 0,
        }}
      >
        {children}
      </main>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('access_token');
  if (!token) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing marketing */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/landing" element={<LandingPage />} />

        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />

        {/* Workflow pricing */}
        <Route
          path="/pricing-rules/scope"
          element={
            <ProtectedRoute>
              <ProductScopePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pricing-rules/strategy-configuration"
          element={
            <ProtectedRoute>
              <StrategyConfigurationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pricing-rules/configure/:strategyId"
          element={
            <ProtectedRoute>
              <RuleConfigurationPage />
            </ProtectedRoute>
          }
        />

        {/* Jobs */}
        <Route
          path="/jobs"
          element={
            <ProtectedRoute>
              <JobsPage />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}