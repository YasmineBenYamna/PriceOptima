// src/components/ui/Card.jsx
import React from 'react';
import { C, R, S } from './tokens.js';

/**
 * Carte surface blanche avec bordure.
 * overflow : 'hidden' | 'visible' | 'auto'
 */
export function Card({ children, style: extra, overflow = 'visible' }) {
  return (
    <div
      style={{
        background:   C.surface,
        border:       `1px solid ${C.border}`,
        borderRadius: R.xl,
        boxShadow:    S.card,
        overflow,
        ...extra,
      }}
    >
      {children}
    </div>
  );
}

/**
 * En-tête de section avec séparateur.
 */
export function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize:      11,
      fontWeight:    700,
      color:         C.textFaint,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom:  10,
    }}>
      {children}
    </div>
  );
}

/**
 * Bannière d'alerte (erreur, succès…).
 * variant : 'danger' | 'success' | 'info' | 'warning'
 */
export function Alert({ children, variant = 'danger' }) {
  const V = {
    danger:  { bg: '#FEF2F2', border: '#FECACA', color: '#dc2626' },
    success: { bg: '#F0FDF4', border: '#86EFAC', color: '#166534' },
    info:    { bg: '#EFF6FF', border: '#93C5FD', color: '#1D4ED8' },
    warning: { bg: '#FFFBEB', border: '#FDE68A', color: '#92400E' },
  }[variant];

  return (
    <div style={{
      background:   V.bg,
      border:       `1px solid ${V.border}`,
      borderRadius: R.md,
      padding:      '10px 14px',
      fontSize:     13,
      color:        V.color,
      lineHeight:   1.5,
    }}>
      {children}
    </div>
  );
}