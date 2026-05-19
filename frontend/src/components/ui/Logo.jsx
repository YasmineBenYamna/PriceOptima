// src/components/ui/Logo.jsx
import React from 'react';
import { C, F } from './tokens.js';

const PriceChartIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="20" x2="21" y2="20" />
    <polyline points="3,16 7,11 11,13 16,6 21,8" />
    <circle cx="16" cy="6" r="1.8" fill="currentColor" stroke="none" />
  </svg>
);

export function Logo({ size = 'sm' }) {
  const isMd = size === 'md';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width:          isMd ? 36 : 32,
        height:         isMd ? 36 : 32,
        borderRadius:   isMd ? 9  : 8,
        background:     'linear-gradient(135deg, #1E3A5F 0%, #2A5298 100%)',
        color:          '#FFFFFF',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        boxShadow:      '0 2px 8px rgba(30,58,95,0.25)',
      }}>
        <PriceChartIcon size={isMd ? 17 : 16} />
      </div>
      <div>
        <div style={{
          fontFamily:    F.display,
          fontSize:      isMd ? 15 : 13,
          fontWeight:    800,
          color:         C.text,
          letterSpacing: '-0.02em',
          lineHeight:    1.2,
        }}>
          PriceOptima
        </div>
        <div style={{
          fontFamily:    F.body,
          fontSize:      9,
          fontWeight:    700,
          color:         C.textFaint,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          lineHeight:    1.4,
        }}>
          Pricing Intelligence
        </div>
      </div>
    </div>
  );
}