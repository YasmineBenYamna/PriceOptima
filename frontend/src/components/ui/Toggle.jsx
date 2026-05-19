// src/components/ui/Toggle.jsx
import React from 'react';
import { C } from './tokens.js';

/**
 * Toggle switch on/off.
 *
 * on       : boolean
 * onToggle : () => void
 * size     : 'sm' | 'md'  (défaut 'md')
 */
export function Toggle({ on, onToggle, size = 'md' }) {
  const D = size === 'sm'
    ? { w: 38, h: 21, r: 11, dot: 16, dotOn: 19, dotOff: 2.5, dotTop: 2.5 }
    : { w: 46, h: 26, r: 13, dot: 20, dotOn: 23, dotOff: 3,   dotTop: 3   };

  return (
    <div
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      style={{
        width:      D.w,
        height:     D.h,
        borderRadius: D.r,
        background: on ? C.text : C.border,
        cursor:     'pointer',
        position:   'relative',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        position:     'absolute',
        top:          D.dotTop,
        left:         on ? D.dotOn : D.dotOff,
        width:        D.dot,
        height:       D.dot,
        borderRadius: '50%',
        background:   '#FFF',
        boxShadow:    '0 1px 4px rgba(0,0,0,0.25)',
        transition:   'left 0.15s',
      }} />
    </div>
  );
}
