// src/components/ui/Button.jsx
import React, { useState } from 'react';
import { C, R, S } from './tokens.js';
import { Spinner } from './Spinner.jsx';

/**
 * Button universel.
 *
 * variant : 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost'
 * size    : 'sm' | 'md' | 'lg'
 * icon    : ReactNode SVG optionnel (affiché à gauche du texte)
 * loading : remplace l'icône par un spinner
 */
export function Button({
  children,
  onClick,
  variant  = 'secondary',
  size     = 'md',
  icon,
  loading  = false,
  disabled = false,
  type     = 'button',
  title,
  style: extra,
}) {
  const [hov, setHov] = useState(false);

  const SZ = {
    sm: { padding: '6px 12px',  fontSize: 12, gap: 5, spin: 12 },
    md: { padding: '9px 18px',  fontSize: 13, gap: 7, spin: 13 },
    lg: { padding: '12px 24px', fontSize: 14, gap: 8, spin: 14 },
  }[size];

  const isDisabled = disabled || loading;

  const V = {
    primary: {
      background: isDisabled ? C.border    : hov ? C.accentHover ?? C.accent : C.accent,
      color:      isDisabled ? C.textFaint : '#FFF',
      border:     'none',
      boxShadow:  isDisabled ? 'none'      : S.button,
    },
    secondary: {
      background: hov ? '#FFF5F0' : C.surface,
      color:      hov ? C.accent  : C.text,
      border:     `1.5px solid ${hov ? C.accent : C.border}`,
      boxShadow:  'none',
    },
    ghost: {
      background: hov ? '#FFF5F0'  : 'transparent',
      color:      hov ? C.accent   : C.textMuted,
      border:     'none',
      boxShadow:  'none',
    },
    danger: {
      background: C.danger.bg,
      color:      C.danger.text,
      border:     `1.5px solid ${C.danger.border}`,
      boxShadow:  'none',
    },
    dangerGhost: {
      background: hov ? C.danger.bg : 'transparent',
      color:      C.danger.text,
      border:     'none',
      boxShadow:  'none',
    },
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            SZ.gap,
        padding:        SZ.padding,
        borderRadius:   R.md,
        fontSize:       SZ.fontSize,
        fontWeight:     variant === 'primary' ? 700 : 600,
        fontFamily:     'inherit',
        cursor:         isDisabled ? 'not-allowed' : 'pointer',
        opacity:        disabled && variant !== 'primary' ? 0.5 : 1,
        transition:     'all 0.15s',
        ...V,
        ...extra,
      }}
    >
      {loading ? <Spinner size={SZ.spin} /> : icon}
      {children}
    </button>
  );
}

/**
 * Bouton carré icône-seule (ex: actions de tableau).
 * variant : 'secondary' | 'danger'
 */
export function IconButton({ icon, onClick, variant = 'secondary', boxSize = 30, title, disabled }) {
  const [hov, setHov] = useState(false);

  const V = {
    secondary: {
      background: hov ? '#FFF5F0'  : C.surface,
      color:      hov ? C.accent   : C.textFaint,
      border:     `1.5px solid ${hov ? C.accent : C.border}`,
    },
    danger: {
      background: C.danger.bg,
      color:      C.danger.text,
      border:     `1.5px solid ${C.danger.border}`,
    },
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width:          boxSize,
        height:         boxSize,
        borderRadius:   R.sm,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        cursor:         disabled ? 'not-allowed' : 'pointer',
        opacity:        disabled ? 0.5 : 1,
        transition:     'all 0.15s',
        fontFamily:     'inherit',
        ...V,
      }}
    >
      {icon}
    </button>
  );
}