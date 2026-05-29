import React from 'react';
import { C, R, S, Button, Alert } from '../ui/index.js';

const SparkIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

function Chip({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: C.text,
        background: '#FFFFFF',
        border: `1px solid ${C.border}`,
        borderRadius: 999,
        padding: '4px 10px',
      }}
    >
      {label}: <span style={{ color: C.accent }}>{String(value)}</span>
    </span>
  );
}

export default function LLMSuggestionPanel({
  scope, loading, error, suggestion, onApply, onDismiss,
}) {
  const category = scope?.category || scope?.categories?.[0] || '';
  const brand = scope?.brand || scope?.brands?.[0] || '';
  const visible = !!category || !!brand;

  if (!visible) return null;

  if (loading) {
    return (
      <section style={{ background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: R.xl, padding: '18px 20px', marginBottom: 24, boxShadow: S.card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: C.accent }}>
          <SparkIcon />
          <span style={{ fontSize: 13, fontWeight: 800 }}>AI pricing suggestion</span>
        </div>
        <div style={{ fontSize: 12, color: C.textMuted }}>Analyse du scope en cours...</div>
      </section>
    );
  }

  if (error) {
    return (
      <div style={{ marginBottom: 20 }}>
        <Alert variant="danger">Impossible de récupérer la suggestion IA : {error}</Alert>
      </div>
    );
  }

  if (!suggestion) {
    return (
      <section style={{ background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: R.xl, padding: '18px 20px', marginBottom: 24, boxShadow: S.card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: C.accent }}>
          <SparkIcon />
          <span style={{ fontSize: 13, fontWeight: 800 }}>AI pricing suggestion</span>
        </div>
        <div style={{ fontSize: 12, color: C.textMuted }}>Aucune suggestion IA disponible pour ce scope.</div>
      </section>
    );
  }
  console.log('suggestion.rules', JSON.stringify(suggestion.rules, null, 2));

  
  return (
    <section
      style={{
        background: 'linear-gradient(180deg, #FFFDF8 0%, #FFFFFF 100%)',
        border: `1.5px solid ${C.accent}`,
        borderRadius: R.xl,
        padding: '20px 22px',
        marginBottom: 28,
        boxShadow: `0 0 0 4px rgba(164,60,18,0.06), ${S.card}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            <SparkIcon />
            <span>AI suggestion</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 6 }}>
            {(suggestion.recommended_strategy_name || suggestion.recommendedStrategyName || 'Unknown')} strategy recommended
          </div>
          <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.65, margin: 0 }}>
            {suggestion.explanation ||
              suggestion.reasoning?.strategy_choice ||
              suggestion.reasoning?.market_position ||
              'No explanation provided.'}
          </p>
        </div>
        <button
          onClick={onDismiss}
          style={{ border: 'none', background: 'transparent', color: C.textFaint, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
          aria-label="Dismiss suggestion"
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <Chip label="Category" value={category} />
        <Chip label="Brand" value={brand} />
        <Chip label="IPP category" value={suggestion.context_used?.own_ipp_category} />
        <Chip label="Own avg price" value={suggestion.context_used?.own_avg_price_eur} />
        <Chip label="Competitors" value={suggestion.context_used?.nb_concurrents} />
        <Chip label="Network tier" value={suggestion.context_used?.network_tier} />
      </div>

      {!!suggestion.rules?.length && (
        <div style={{ background: '#FAFBFF', border: `1px solid ${C.border}`, borderRadius: R.lg, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Suggested rule mix
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {suggestion.rules.map((r, i) => (
              <div key={r.rule_id || i} style={{ fontSize: 12, color: C.text }}>
                <strong>{r.rule_name || `Rule ${i + 1}`}</strong> — coefficient {r.coefficient}
                {r.params && Object.keys(r.params).length > 0 && (
                  <span style={{ color: C.textMuted, marginLeft: 6 }}>
                    ({Object.entries(r.params).map(([k, v]) => `${k}: ${v}`).join(', ')})
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="primary" onClick={onApply}>Apply suggestion</Button>
        <Button variant="secondary" onClick={onDismiss}>Choose manually</Button>
      </div>
    </section>
  );
}