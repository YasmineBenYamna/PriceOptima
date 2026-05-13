// src/components/ui/PageHeader.jsx
import React from 'react';
import { C, F } from './tokens.js';

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
          fontFamily:    F.display,
          fontSize:      22,
          fontWeight:    800,
          color:         C.text,
          margin:        '0 0 4px',
          letterSpacing: '-0.03em',
          lineHeight:    1.15,
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            fontFamily: F.body,
            fontSize:   13,
            color:      C.textMuted,
            margin:     0,
            lineHeight: 1.6,
          }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}