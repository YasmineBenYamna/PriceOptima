// src/components/ui/PageHeader.jsx
import React from 'react';
import { C } from './tokens.js';

/**
 * En-tête de page avec titre, sous-titre et actions.
 *
 * Exemple :
 *   <PageHeader
 *     title="Jobs de Pricing"
 *     subtitle="Historique et gestion des calculs de prix."
 *     actions={<Button ...>Rafraîchir</Button>}
 *   />
 */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div style={{
      display:        'flex',
      alignItems:     'flex-start',
      justifyContent: 'space-between',
      marginBottom:   24,
    }}>
      <div>
        <h1 style={{
          fontSize:      22,
          fontWeight:    800,
          color:         C.text,
          margin:        '0 0 4px',
          letterSpacing: '-0.03em',
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 13, color: C.textMuted, margin: 0, lineHeight: 1.6 }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}