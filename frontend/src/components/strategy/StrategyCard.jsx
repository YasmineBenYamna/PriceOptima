import React from 'react';
import { C, R, S } from '../ui';

export default function StrategyCard({ strategy, meta, active, onClick }) {
  const isCustom = strategy.is_custom || strategy.name?.toUpperCase() === 'CUSTOM';

  return (
    <div
      onClick={onClick}
      style={{
        background: C.surface,
        border: active ? `2px solid ${C.accent}` : `1.5px solid ${C.border}`,
        borderRadius: R.xl,
        padding: '18px 18px 16px',
        cursor: 'pointer',
        position: 'relative',
        boxShadow: active
          ? '0 0 0 4px rgba(164,60,18,0.10), 0 4px 16px rgba(0,0,0,0.08)'
          : S.card,
        transition: 'all 0.15s',
      }}
    >
      {active && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 20,
            height: 20,
            borderRadius: 50,
            background: C.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFF"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}

      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: meta.iconBg,
          color: meta.iconColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
        }}
      >
        {meta.icon}
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 5 }}>
        {strategy.name.charAt(0).toUpperCase() + strategy.name.slice(1).toLowerCase()} Strategy
      </div>

      <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.55, marginBottom: 10 }}>
        {strategy.description || meta.hint}
      </div>

      <div
        style={{
          fontSize: 11,
          color: active ? C.accent : C.textFaint,
          background: active ? C.accentBg : '#F8FAFF',
          borderRadius: 6,
          padding: '5px 8px',
          marginBottom: 12,
          lineHeight: 1.4,
        }}
      >
        {meta.hint}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              padding: '2px 8px',
              borderRadius: 20,
              background: meta.tagBg,
              color: meta.tagColor,
            }}
          >
            {isCustom ? 'CUSTOM' : 'PRESET'}
          </span>

          <span style={{ fontSize: 11, color: C.textFaint }}>
            {strategy.rules_count} rules
          </span>
        </div>

        {strategy.name?.toUpperCase() === 'CUSTOM' && !strategy.is_custom && (
          <span style={{ fontSize: 10, fontWeight: 600, color: C.accent }}>
            Add rules
          </span>
        )}
      </div>
    </div>
  );
}