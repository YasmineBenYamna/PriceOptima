// src/components/ui/Breadcrumb.jsx
import React from 'react';
import { C } from './tokens.js';

const ChevronRight = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke={C.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

/**
 * Fil d'Ariane.
 * items : [{ label, active? }]
 *
 * Exemple :
 *   <Breadcrumb items={[
 *     { label: 'Pricing Workflow' },
 *     { label: 'Jobs', active: true },
 *   ]} />
 */
export function Breadcrumb({ items = [] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight />}
          <span style={{
            fontSize:      11,
            fontWeight:    600,
            color:         item.active ? C.textFaint : C.accent,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            {item.label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}