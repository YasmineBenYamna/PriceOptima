// src/components/ui/Spinner.jsx
import React from 'react';
import { C } from './tokens.js';

/**
 * Spinner de chargement.
 * @param {number} size    — taille en px (défaut 24)
 * @param {string} color   — couleur du trait actif (défaut C.accent)
 * @param {string} trackColor — couleur du fond de piste (défaut C.border)
 */
export function Spinner({ size = 24, color = C.accent, trackColor = C.border }) {
  return (
    <>
      <div
        style={{
          width:        size,
          height:       size,
          border:       `2px solid ${trackColor}`,
          borderTopColor: color,
          borderRadius: '50%',
          animation:    'ui-spin 0.65s linear infinite',
          flexShrink:   0,
        }}
      />
      <style>{`@keyframes ui-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

/**
 * Écran de chargement centré (pleine hauteur).
 */
export function PageSpinner({ message = 'Chargement...' }) {
  return (
    <div
      style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        height:         '70vh',
        gap:            14,
      }}
    >
      <Spinner size={32} />
      <span style={{ fontSize: 13, color: C.textMuted }}>{message}</span>
    </div>
  );
}
