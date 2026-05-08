// src/components/ui/Modal.jsx
import React from 'react';
import { C, R } from './tokens.js';

/**
 * Fenêtre modale avec overlay.
 * onClose est appelé au clic sur l'overlay.
 */
export function Modal({ children, onClose, maxWidth = 580 }) {
  return (
    <div
      style={{
        position:       'fixed',
        inset:          0,
        background:     'rgba(15,23,42,0.5)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        zIndex:         200,
        padding:        20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background:   C.surface,
        borderRadius: R.xl,
        width:        '100%',
        maxWidth,
        maxHeight:    '85vh',
        overflowY:    'auto',
        boxShadow:    '0 24px 64px rgba(0,0,0,0.20)',
      }}>
        {children}
      </div>
    </div>
  );
}

/**
 * En-tête de Modal avec titre et bouton fermer.
 */
export function ModalHeader({ title, subtitle, onClose }) {
  return (
    <div style={{
      padding:        '20px 24px',
      borderBottom:   `1px solid ${C.border}`,
      display:        'flex',
      justifyContent: 'space-between',
      alignItems:     'center',
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>
        {subtitle}
      </div>
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textFaint, padding: 4, display: 'flex' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}