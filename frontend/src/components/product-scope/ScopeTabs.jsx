import React from 'react';
import { C, S } from '../ui';

const TABS = ['Product', 'Category', 'Brand'];

export default function ScopeTabs({ value, onChange }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        background: 'var(--color-surface-offset)',
        borderRadius: 10,
        padding: 4,
        width: 'fit-content',
        marginBottom: 20,
      }}
    >
      {TABS.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: 'none',
            background: value === tab ? C.surface : 'transparent',
            color: value === tab ? C.text : C.textMuted,
            fontSize: 13,
            fontWeight: value === tab ? 700 : 400,
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: value === tab ? S.card : 'none',
            transition: 'all 0.15s',
          }}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}