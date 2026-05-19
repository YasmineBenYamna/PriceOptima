import React from 'react';
import { C, R } from '../ui';

/** Extrait le nom du produit en anglais (fallback: main, puis premier disponible). */
function getProductName(name) {
  if (!name) return 'Produit sans nom';
  if (typeof name === 'string') return name;
  if (Array.isArray(name)) {
    const en   = name.find((n) => n.lang === 'en');
    const main = name.find((n) => n.lang === 'main');
    return (en || main || name[0])?.text || 'Produit sans nom';
  }
  return String(name);
}

export default function ProductList({
  products,
  selectedEans,
  onToggle,
  onSelectAll,
  onDeselectAll,
  loading,
}) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 24, color: C.textMuted, fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  if (!products.length) {
    return (
      <div style={{ textAlign: 'center', padding: 24, color: C.textMuted, fontSize: 13 }}>
        No products found.
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          padding: '8px 12px',
          background: 'var(--color-surface-offset)',
          borderRadius: R.md,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onSelectAll}
            style={{
              fontSize: 12, fontWeight: 600, color: C.accent,
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Select all
          </button>

          <span style={{ color: C.border }}>|</span>

          <button
            onClick={onDeselectAll}
            style={{
              fontSize: 12, fontWeight: 600, color: C.textMuted,
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Deselect all
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflowY: 'auto' }}>
        {products.filter((p) => p.name && p.name.trim() !== '' && p.name !== '[]').map((p) => {
          const on          = selectedEans.has(p.ean);
          const displayName = getProductName(p.name);

          return (
            <div
              key={p.ean}
              onClick={() => onToggle(p.ean)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: R.md, cursor: 'pointer',
                background: on ? 'var(--color-surface-offset)' : 'transparent',
                border: `1.5px solid ${on ? C.accent : 'transparent'}`,
                transition: 'all 0.12s',
              }}
            >
              <div
                style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  border: `2px solid ${on ? C.accent : C.border}`,
                  background: on ? C.accent : C.surface,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {on && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                    stroke="#FFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>

              {p.image_url && (
                <img
                  src={p.image_url}
                  alt={displayName}
                  onError={(e) => (e.target.style.display = 'none')}
                  style={{
                    width: 36, height: 36, objectFit: 'contain',
                    borderRadius: 6, background: '#F8F9FC', flexShrink: 0,
                  }}
                />
              )}

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{displayName}</div>
                <div style={{ fontSize: 11, color: C.textFaint }}>EAN {p.ean}</div>
                {p.brand && <div style={{ fontSize: 11, color: C.textFaint }}>{p.brand}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}