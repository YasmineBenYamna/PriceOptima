// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Sidebar from './components/layout/Sidebar.jsx';

import LoginPage from './pages/LoginPage.jsx';
import ProductScopePage from './pages/ProductScopePage.jsx';
import StrategyConfigurationPage from './pages/StrategyConfigurationPage.jsx';
import RuleConfigurationPage from './pages/RuleConfigurationPage.jsx';
import JobsPage from './pages/JobsPage.jsx';

const C = {
  bg: '#FAFBFF',
  border: '#C5D5EC',
};

function AppLayout({ children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg }}>
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main
          style={{
            flex: 1,
            padding: '28px 32px',
            overflowY: 'auto',
            minWidth: 0,
          }}
        >
          {children}
        </main>
      </div>
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
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Redirect root */}
        <Route path="/" element={<Navigate to="/pricing-rules/scope" replace />} />

        {/* Protected — avec layout */}
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
        <Route
          path="/jobs"
          element={
            <ProtectedRoute>
              <JobsPage />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/pricing-rules/scope" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
