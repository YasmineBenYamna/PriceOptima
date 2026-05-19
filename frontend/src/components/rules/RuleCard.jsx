import React from 'react';
import { C, Card, Field, Toggle } from '../ui';

function getRuleIcon(name) {
  const n = name.toLowerCase();
  if (n.includes('aggregat')) return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><path d="M14 17h6M17 14v6"/>
    </svg>
  );
  if (n.includes('competitor') || n.includes('beat')) return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
  if (n.includes('floor') || n.includes('min store')) return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="20" x2="21" y2="20"/><polyline points="7 10 12 5 17 10"/>
      <line x1="12" y1="5" x2="12" y2="17"/>
    </svg>
  );
  if (n.includes('market') || n.includes('average')) return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  );
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
    </svg>
  );
}

export default function RuleCard({ rule, localRule, active, iconTheme, onToggle, onChange }) {
  const ruleName      = rule.name || localRule?.name || rule.rule_name || (typeof rule.key === 'string' && !rule.key.startsWith('custom_') ? rule.key : 'Custom Rule');
  const ruleNameLc    = ruleName.toLowerCase();
  const isAggregation  = ruleNameLc.includes('aggregat');
  const isCompetitorBeat = ruleNameLc.includes('competitor') || ruleNameLc.includes('beat');
  const isStability    = ruleNameLc.includes('stability');

  return (
    <Card overflow="hidden" style={{
      border:     active ? '1.5px solid #D4845A' : `1.5px solid ${C.border}`,
      boxShadow:  active ? '0 2px 12px rgba(2,36,72,0.10)' : '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10,
            background: iconTheme.bg, color: iconTheme.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {getRuleIcon(ruleName)}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3, letterSpacing: '-0.01em' }}>
              {ruleName}
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
              {rule.description || localRule?.description}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{
            fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
            background: active ? C.accentBg : '#F8FAFF',
            color:      active ? '#1E3A5F' : C.textFaint,
            border:     `1px solid ${active ? C.textFaint : C.border}`,
          }}>
            {active ? 'Active' : 'Inactive'}
          </span>
          <Toggle on={active} onToggle={onToggle} />
        </div>
      </div>

      {active && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '16px 22px 20px', borderTop: '1px solid #DCE9FF' }}>
          <div style={{ minWidth: 150 }}>
            <Field
              label="Coefficient"
              type="number"
              min={0} max={1} step={0.05}
              value={localRule?.coefficient ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                // ← fix : convertir en float, NaN → 0
                onChange('coefficient', val === '' ? 0 : parseFloat(val) || 0);
              }}
            />
          </div>

          {isAggregation && (
            <div style={{ minWidth: 190 }}>
              <Field
                label="Aggregation Function"
                type="select"
                value={localRule?.aggregationFunction || 'median'}
                onChange={(e) => onChange('aggregationFunction', e.target.value)}
              >
                {['lowest', 'average', 'median'].map((o) => (
                  <option key={o} value={o}>{o.toUpperCase()}</option>
                ))}
              </Field>
            </div>
          )}

          {isCompetitorBeat && (
            <div style={{ minWidth: 160 }}>
              <Field
                label="Discount" type="number" min={0} max={100} step={0.5} suffix="%"
                value={localRule?.discountPct ?? 3}
                onChange={(e) => onChange('discountPct', e.target.value)}
              />
            </div>
          )}

          {isStability && (
            <>
              <div style={{ minWidth: 160 }}>
                <Field
                  label="Low Threshold" type="number" min={0} max={100} step={0.5} suffix="%"
                  value={localRule?.lowThresholdPct ?? 1}
                  onChange={(e) => onChange('lowThresholdPct', e.target.value)}
                />
              </div>
              <div style={{ minWidth: 160 }}>
                <Field
                  label="High Threshold" type="number" min={0} max={100} step={0.5} suffix="%"
                  value={localRule?.highThresholdPct ?? 15}
                  onChange={(e) => onChange('highThresholdPct', e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}