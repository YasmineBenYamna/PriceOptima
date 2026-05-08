// src/components/ui/Badge.jsx
import React from 'react';
import { STATUS } from './tokens.js';

/**
 * Badge de statut générique.
 * Couvre : completed | running | failed | pending | scheduled
 * Accepte aussi un style custom via `customStyle`.
 */
export function StatusBadge({ status, customStyle }) {
  const s = STATUS[status] || STATUS.pending;
  return (
    <span
      style={{
        fontSize:      11,
        fontWeight:    700,
        padding:       '3px 10px',
        borderRadius:  20,
        background:    s.bg,
        color:         s.color,
        border:        `1px solid ${s.border}`,
        letterSpacing: '0.03em',
        whiteSpace:    'nowrap',
        ...customStyle,
      }}
    >
      {s.label}
    </span>
  );
}

/**
 * Badge générique (couleur libre).
 * Utiliser pour des tags, catégories, etc.
 */
export function Badge({ children, bg = '#F4F7FF', color = '#1E3A5F', border = '#C5D5EC' }) {
  return (
    <span
      style={{
        fontSize:   11,
        fontWeight: 600,
        padding:    '3px 10px',
        borderRadius: 20,
        background: bg,
        color,
        border:     `1px solid ${border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
