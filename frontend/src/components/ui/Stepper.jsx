// src/components/ui/Stepper.jsx
import React from 'react';
import { C } from './tokens.js';
import { Card } from './Card.jsx';

const STEPS = [
  { n: 1, label: 'Products' },
  { n: 2, label: 'Strategy' },
  { n: 3, label: 'Configuration Logic' },
];

const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/**
 * Stepper 3 étapes du Pricing Workflow.
 * step : 1 | 2 | 3
 */
export function Stepper({ step }) {
  return (
    <Card style={{ display: 'flex', alignItems: 'center', padding: '14px 24px', marginBottom: 28 }}>
      {STEPS.map((s, i) => (
        <React.Fragment key={s.n}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width:          26,
              height:         26,
              borderRadius:   '50%',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              background:     step >= s.n ? C.text : C.surface,
              border:         `2px solid ${step >= s.n ? C.text : C.border}`,
              color:          step >= s.n ? '#FFF' : C.textFaint,
              transition:     'all 0.2s',
            }}>
              {step > s.n
                ? <CheckIcon />
                : <span style={{ fontSize: 11, fontWeight: 700 }}>{s.n}</span>}
            </div>
            <span style={{
              fontSize:   13,
              fontWeight: step === s.n ? 600 : 400,
              color:      step === s.n ? C.text : step > s.n ? C.textMuted : C.textFaint,
            }}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{
              flex:       1,
              height:     1,
              background: step > s.n ? C.text : C.border,
              margin:     '0 12px',
              transition: 'background 0.3s',
            }} />
          )}
        </React.Fragment>
      ))}
    </Card>
  );
}
