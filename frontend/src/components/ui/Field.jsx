// src/components/ui/Field.jsx
import React, { useState } from 'react';
import { C, R } from './tokens.js';

/**
 * Champ de formulaire avec label flottant stylisé.
 *
 * type    : 'text' | 'email' | 'password' | 'number' | 'select'
 * Pour type='select', passer les options via children.
 * Pour type='number', passer min / max / step.
 */
export function Field({
  label,
  type        = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  min, max, step,
  children,             // pour type='select'
  suffix,               // ex: '%' affiché à droite
  disabled    = false,
  style: extra,
}) {
  const [focused, setFocused] = useState(false);

  const inputStyle = {
    width:       '100%',
    padding:     suffix ? '9px 36px 9px 14px' : '11px 14px',
    borderRadius: R.md,
    border:      `1.5px solid ${focused ? C.accent : C.border}`,
    fontSize:    13,
    color:       C.text,
    background:  disabled ? C.bg : '#FAFBFF',
    outline:     'none',
    fontFamily:  'inherit',
    boxSizing:   'border-box',
    cursor:      disabled ? 'not-allowed' : 'auto',
    transition:  'border-color 0.15s',
    appearance:  'none',
    ...extra,
  };

  const labelStyle = {
    fontSize:      11,
    fontWeight:    700,
    color:         C.textFaint,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom:  6,
    display:       'block',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {label && <label style={labelStyle}>{label}</label>}
      <div style={{ position: 'relative' }}>
        {type === 'select' ? (
          <>
            <select
              value={value}
              onChange={onChange}
              disabled={disabled}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{ ...inputStyle, paddingRight: 36, cursor: 'pointer' }}
            >
              {children}
            </select>
            {/* chevron */}
            <svg
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke={C.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </>
        ) : (
          <>
            <input
              type={type}
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              autoComplete={autoComplete}
              disabled={disabled}
              min={min} max={max} step={step}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={inputStyle}
            />
            {suffix && (
              <span style={{
                position:  'absolute',
                right:     12,
                top:       '50%',
                transform: 'translateY(-50%)',
                fontSize:  13,
                color:     C.textFaint,
                fontWeight: 600,
                pointerEvents: 'none',
              }}>
                {suffix}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
