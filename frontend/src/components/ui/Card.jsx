// src/components/ui/Card.jsx
import React from 'react';
import { C, R, S, F } from './tokens.js';

export function Card({ children, style: extra, overflow = 'visible' }) {
  return (
    <div style={{
      background:   C.surface,
      border:       `1px solid ${C.border}`,
      borderRadius: R.xl,
      boxShadow:    S.card,
      overflow,
      ...extra,
    }}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily:    F.body,
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

export function Alert({ children, variant = 'danger' }) {
  const V = {
    danger:  { bg: C.danger.bg,  border: C.danger.border,  color: C.danger.text  },
    success: { bg: C.success.bg, border: C.success.border, color: C.success.text },
    info:    { bg: C.info.bg,    border: C.info.border,    color: C.info.text    },
    warning: { bg: C.warning.bg, border: C.warning.border, color: C.warning.text },
  }[variant];

  return (
    <div style={{
      background:   V.bg,
      border:       `1px solid ${V.border}`,
      borderRadius: R.md,
      padding:      '10px 14px',
      fontFamily:   F.body,
      fontSize:     13,
      color:        V.color,
      lineHeight:   1.5,
    }}>
      {children}
    </div>
  );
}