import React from 'react';
import { C, R, S } from '../ui';

export default function RuleCheckCard({ rule, badge, selected, onToggle, isUserRule }) {
  return (
    <div
      onClick={onToggle}
      style={{
        background: C.surface,
        border: `1.5px solid ${selected ? C.accent : C.border}`,
        borderRadius: R.lg,
        padding: '14px 16px',
        boxShadow: selected
          ? '0 0 0 3px rgba(164,60,18,0.07), ' + S.card
          : S.card,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{rule.name}</span>

            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 20,
                background: badge.bg,
                color: badge.color,
                letterSpacing: '0.04em',
              }}
            >
              {badge.label}
            </span>

            {isUserRule && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 20,
                  background: '#F4F7FF',
                  color: '#1E3A5F',
                  border: '1px solid #D0D9F0',
                }}
              >
                MY RULE
              </span>
            )}
          </div>

          <p style={{ fontSize: 12, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>
            {rule.description}
          </p>

          {isUserRule && rule.formula && (
            <code
              style={{
                fontSize: 11,
                color: C.accent,
                background: '#F8FAFF',
                padding: '2px 6px',
                borderRadius: 4,
                marginTop: 4,
                display: 'inline-block',
              }}
            >
              {rule.formula}
            </code>
          )}
        </div>
      </div>
    </div>
  );
}