// src/components/ui/WorkflowFooter.jsx
import React from 'react';
import { C } from './tokens.js';
import { Button } from './Button.jsx';

const ArrowLeft = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const ArrowRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

export function WorkflowFooter({
  label,
  onBack,
  backLabel    = 'Back',
  onNext,
  nextLabel    = 'Next Step',
  nextDisabled = false,
  nextLoading  = false,
  sidebarWidth = 220,
}) {
  return (
    <div style={{
      position:       'fixed',
      bottom:         0,
      left:           sidebarWidth,
      right:          0,
      background:     C.surface,
      borderTop:      `1px solid ${C.border}`,
      padding:        '14px 32px',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      zIndex:         20,
      boxShadow:      '0 -4px 16px rgba(0,0,0,0.06)',
    }}>
      <div style={{ fontSize: 13, color: C.textMuted }}>{label}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        {onBack && (
          <Button variant="secondary" icon={<ArrowLeft />} onClick={onBack}>
            {backLabel}
          </Button>
        )}
        <Button variant="primary" icon={<ArrowRight />} disabled={nextDisabled} loading={nextLoading} onClick={onNext}>
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}