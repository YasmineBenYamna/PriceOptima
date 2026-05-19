import React from 'react';
import { C, R, S } from '../ui';

export default function SelectCard({ name, sub, selected, onClick, onCheck }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 16,
        borderRadius: R.lg,
        border: selected ? `2px solid ${C.accent}` : `1.5px solid ${C.border}`,
        background: selected ? 'var(--color-surface-offset)' : C.surface,
        cursor: 'pointer',
        boxShadow: selected
          ? '0 0 0 3px rgba(164,60,18,0.08), ' + S.card
          : S.card,
        transition: 'all 0.15s',
      }}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          onCheck?.();
        }}
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          border: `2px solid ${selected ? C.accent : C.border}`,
          background: selected ? C.accent : C.surface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.15s',
          cursor: 'pointer',
        }}
      >
        {selected && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFF"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{name}</div>
        {sub && <div style={{ fontSize: 11, color: C.textFaint }}>{sub}</div>}
      </div>
    </div>
  );
}