// src/components/layout/Sidebar.jsx
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { logout } from '../../api/api.js';
import { C, F, R, Logo } from '../ui/index.js';

const NAV_ITEMS = [
  {
    label: 'Pricing Workflow',
    path:  '/pricing-rules/scope',
    match: ['/pricing-rules/scope', '/pricing-rules/strategy-configuration', '/pricing-rules/configure'],
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-6h6v6" />
      </svg>
    ),
  },
  {
    label: 'Jobs',
    path:  '/jobs',
    match: ['/jobs'],
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        <line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" />
      </svg>
    ),
  },
  {
    label: 'Dashboard',
    path:  '/dashboard',
    match: ['/dashboard'],
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
];

function NavItem({ item, active, onClick }) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          10,
        padding:      '9px 10px',
        borderRadius: R.md,
        cursor:       'pointer',
        background:   active ? C.accentBg : hov ? C.neutral.bg : 'transparent',
        transition:   'all 0.15s ease',
      }}
    >
      <span style={{ color: active ? C.accent : C.textFaint, display: 'flex', flexShrink: 0 }}>
        {item.icon}
      </span>
      <span style={{
        fontFamily: F.body,
        fontSize:   13,
        fontWeight: active ? 600 : 400,
        color:      active ? C.text : C.textMuted,
        lineHeight: 1,
      }}>
        {item.label}
      </span>
    </div>
  );
}

function LogoutButton({ onClick }) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          10,
        padding:      '8px 10px',
        borderRadius: R.md,
        cursor:       'pointer',
        background:   hov ? C.danger.bg : 'transparent',
        transition:   'background 0.15s',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.accent}
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      <span style={{
        fontFamily: F.body,
        fontSize:   13,
        fontWeight: 500,
        color:      C.accent,
      }}>
        Déconnexion
      </span>
    </div>
  );
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (item) => item.match.some((p) => location.pathname.startsWith(p));
  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <aside style={{
      width:          220,
      background:     C.surface,
      borderRight:    `1px solid ${C.border}`,
      display:        'flex',
      flexDirection:  'column',
      padding:        '0 0 20px',
      position:       'sticky',
      top:            0,
      height:         '100vh',
      flexShrink:     0,
    }}>
      {/* Logo */}
      <div style={{
        padding:      '20px 18px 18px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <Logo size="sm" />
      </div>

      {/* Nav */}
      <nav style={{
        display:       'flex',
        flexDirection: 'column',
        gap:           2,
        padding:       '10px',
        marginTop:     4,
      }}>
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.label}
            item={item}
            active={isActive(item)}
            onClick={() => navigate(item.path)}
          />
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Déconnexion */}
      <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <LogoutButton onClick={handleLogout} />
      </div>
    </aside>
  );
}