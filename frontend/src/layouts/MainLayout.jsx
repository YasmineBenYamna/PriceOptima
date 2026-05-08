// src/layouts/MainLayout.jsx
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
export default function MainLayout() {
  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: '#FAFBFF',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <Sidebar />

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <TopBar />

        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '28px 32px 48px',
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}