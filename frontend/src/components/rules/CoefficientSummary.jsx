import React from 'react';
import { C } from '../ui';

export default function CoefficientSummary({ count, coeffSum, coeffValid }) {
  if (count === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: coeffValid ? '#166534' : '#dc2626' }}>
          Coefficient sum {coeffSum.toFixed(3)} / 1.000
        </span>

        <span
          style={{
            fontSize: 11,
            borderRadius: 6,
            padding: '2px 8px',
            color: coeffValid ? '#166534' : '#dc2626',
            background: coeffValid ? '#F0FDF4' : '#FEF2F2',
            border: `1px solid ${coeffValid ? '#86EFAC' : '#FECACA'}`,
          }}
        >
          {coeffValid ? 'Valid' : 'Must equal 1.0'}
        </span>
      </div>

      <div
        style={{
          height: 5,
          background: C.border,
          borderRadius: 99,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.min(coeffSum * 100, 100)}%`,
            background: coeffValid ? '#166534' : coeffSum > 1 ? '#dc2626' : '#1E3A5F',
            borderRadius: 99,
            transition: 'width 0.3s, background 0.3s',
          }}
        />
      </div>
    </div>
  );
}