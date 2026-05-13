import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  getStrategies, getRules, getStrategy, getUserStrategy,
  createUserStrategy,
} from '../api/api.js';
import {
  C, R, S,
  Button, Alert, EmptyState, PageSpinner,
  SectionLabel, Breadcrumb, Field, Stepper,
  Modal, ModalHeader,
} from '../components/ui/index.js';
import { WorkflowFooter } from '../components/ui/WorkflowFooter.jsx';
import { useLLMSuggestion } from '../hooks/useLLMSuggestion.js';
import LLMSuggestionPanel from '../components/strategy/LLMSuggestionPanel.jsx';

const STRATEGY_META = {
  AGGRESSIVE: {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
    iconColor: '#1E3A5F', iconBg: '#F4F7FF',
    tag: 'PRESET', tagColor: '#022448', tagBg: '#F4F7FF',
    hint: 'High aggressiveness — may reduce margins by up to 12%',
  },
  COMPETITIVE: {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    iconColor: '#8AA4CF', iconBg: '#FFFBEB',
    tag: 'PRESET', tagColor: '#92400E', tagBg: '#FFFBEB',
    hint: 'Balanced approach — follows competitors without leading',
  },
  ALIGNED: {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    iconColor: '#1E3A5F', iconBg: '#F4F7FF',
    tag: 'PRESET', tagColor: '#022448', tagBg: '#F4F7FF',
    hint: 'Margin-safe — protects profitability while staying competitive',
  },
  MARKET_ALIGNED: {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    iconColor: '#1E3A5F', iconBg: '#F4F7FF',
    tag: 'PRESET', tagColor: '#022448', tagBg: '#F4F7FF',
    hint: 'Margin-safe — protects profitability while staying competitive',
  },
  CUSTOM: {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="17" y2="18"/><circle cx="18" cy="6" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="20" cy="18" r="2"/></svg>,
    iconColor: '#6B7280', iconBg: '#F4F7FF',
    tag: 'CUSTOM', tagColor: '#1E3A5F', tagBg: '#F4F7FF',
    hint: 'Fully configurable — add, remove and weight your own rules',
  },
};

const AGG_BADGE = {
  lowest: { label: 'LOWEST', bg: '#FEF2F2', color: '#dc2626' },
  min:    { label: 'MIN',    bg: '#FEF2F2', color: '#dc2626' },
  max:    { label: 'MAX',    bg: '#F0FDF4', color: '#166534' },
  avg:    { label: 'AVG',    bg: '#FAFBFF', color: '#1E3A5F' },
  median: { label: 'MEDIAN', bg: '#FAFBFF', color: '#1E3A5F' },
  none:   { label: 'NONE',   bg: '#F8FAFF', color: '#6B7280' },
};

const LightningIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
  </svg>
);

function NameStrategyModal({ onClose, onConfirm, saving }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [err, setErr] = useState('');

  const handleConfirm = () => {
    if (!name.trim()) { setErr('Le nom est requis.'); return; }
    onConfirm(name.trim(), description.trim());
  };

  return (
    <Modal onClose={onClose} maxWidth={440}>
      <ModalHeader
        title="Nommer votre stratégie"
        subtitle={<div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Donnez un nom et une description à cette stratégie custom</div>}
        onClose={onClose}
      />
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {err && <Alert variant="danger">{err}</Alert>}
        <Field
          label="Nom de la stratégie *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex: Ma stratégie promo été"
          autoFocus
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Décrivez l'objectif de cette stratégie..."
            rows={3}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: R.md,
              border: `1.5px solid ${C.border}`, fontSize: 13, color: C.text,
              outline: 'none', fontFamily: 'inherit', resize: 'vertical',
              boxSizing: 'border-box', background: C.bg,
            }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: `1px solid ${C.border}` }}>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button variant="primary" loading={saving} onClick={handleConfirm}>Continuer</Button>
      </div>
    </Modal>
  );
}

export default function StrategyConfigurationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const rulesRef = useRef(null);

  const scope = location.state?.scope || {};

  const [strategies, setStrategies] = useState([]);
  const [allRules, setAllRules] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [customSelected, setCustomSelected] = useState(new Set());
  const [llmDismissed, setLlmDismissed] = useState(false);

  const {
    loading: llmLoading,
    suggestion: llmSuggestion,
    error: llmError,
  } = useLLMSuggestion(scope);

  useEffect(() => {
    Promise.all([getStrategies(), getRules()])
      .then(([sRes, rRes]) => {
        setStrategies(sRes.strategies || []);
        setAllRules(rRes.rules || []);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const selectedStrategy = strategies.find((s) => s.id === selectedId);
  const isNewCustom = selectedStrategy &&
    selectedStrategy.name?.toUpperCase() === 'CUSTOM' &&
    !selectedStrategy.is_custom;
  const isExistingUserStrategy = selectedStrategy?.is_custom === true;

  const isValid = isNewCustom ? customSelected.size > 0 : !!selectedId;

  const selectStrategy = async (id) => {
    if (selectedId === id) {
      setSelectedId(null);
      setDetail(null);
      setCustomSelected(new Set());
      return;
    }

    setSelectedId(id);
    setError('');
    setCustomSelected(new Set());

    try {
      const s = strategies.find((x) => x.id === id);
      const d = s?.is_custom ? await getUserStrategy(id) : await getStrategy(id);
      setDetail(d);
      setTimeout(() => rulesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleApplyLLMSuggestion = async () => {
    if (!llmSuggestion?.recommended_strategy_name) return;

    const matched = strategies.find(
      (s) => s.name?.toUpperCase() === llmSuggestion.recommended_strategy_name?.toUpperCase()
    );

    if (!matched) return;

    await selectStrategy(matched.id);
    setLlmDismissed(true);
  };

  const toggleCustomRule = (ruleId) => {
    setCustomSelected((prev) => {
      const next = new Set(prev);
      next.has(ruleId) ? next.delete(ruleId) : next.add(ruleId);
      return next;
    });
  };

  const handleNext = () => {
    setError('');
    if (isNewCustom) {
      setShowNameModal(true);
    } else if (isExistingUserStrategy) {
      navigate(`/pricing-rules/configure/${selectedStrategy.id}`, {
        state: { user_strategy_id: selectedStrategy.id, scope }
      });
    } else {
      navigate(`/pricing-rules/configure/${selectedStrategy.id}`, {
        state: { system_strategy_id: selectedStrategy.id, scope }
      });
    }
  };

  const handleCreateCustom = async (name, description) => {
    setSaving(true);
    setError('');

    try {
      const ids = [...customSelected];
      const base = Math.floor((1 / ids.length) * 10000) / 10000;
      let rem = 1;

      const rules = ids.map((rule_id, i) => {
        const coeff = i === ids.length - 1 ? Math.round(rem * 10000) / 10000 : base;
        rem -= base;
        return { rule_id, coefficient: coeff };
      });

      const created = await createUserStrategy({
        name: name.toUpperCase(),
        description: description || '',
        rules,
        base_strategy_id: null,
      });

      setShowNameModal(false);
      navigate(`/pricing-rules/configure/${created.id}`, {
        state: { user_strategy_id: created.id, scope }
      });
    } catch (e) {
      setError(e.message);
      setSaving(false);
      setShowNameModal(false);
    }
  };

  const footerLabel = selectedId ? (
    <>
      <strong style={{ color: C.text }}>
        {selectedStrategy?.name?.charAt(0).toUpperCase() + selectedStrategy?.name?.slice(1).toLowerCase()} Strategy
      </strong>
      {' '}<span style={{ fontStyle: 'italic' }}>selected for this pricing scope.</span>
    </>
  ) : (
    <span style={{ fontStyle: 'italic' }}>No strategy selected yet.</span>
  );

  if (loading) return <PageSpinner message="Loading strategies..." />;

  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{ marginBottom: 8 }}>
        <Breadcrumb items={[{ label: 'Pricing Workflow' }, { label: 'Strategy Configuration', active: true }]} />
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>
        Strategy Configuration
      </h1>

      <p style={{ fontSize: 13, color: C.textMuted, margin: '0 0 24px', lineHeight: 1.6 }}>
        Configure pricing strategies and their rule coefficients for market-optimized pricing.
      </p>

      <Stepper step={2} />

      {error && <Alert variant="danger" style={{ marginBottom: 20 }}>{error}</Alert>}

      {!llmDismissed && (
        <LLMSuggestionPanel
          scope={scope}
          loading={llmLoading}
          error={llmError}
          suggestion={llmSuggestion}
          onApply={handleApplyLLMSuggestion}
          onDismiss={() => setLlmDismissed(true)}
        />
      )}

      <section style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <SectionLabel>Choose the strategy</SectionLabel>
          <span style={{ fontSize: 12, fontWeight: 500, color: selectedId ? '#166534' : C.accent }}>
            {selectedId ? 'Strategy selected — rules ready below' : 'Select one to configure its rules'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(236px, 1fr))', gap: 14 }}>
          {strategies.map((s) => {
            const meta = STRATEGY_META[s.name?.toUpperCase()] || STRATEGY_META.CUSTOM;
            const active = selectedId === s.id;
            const isC = s.is_custom || s.name?.toUpperCase() === 'CUSTOM';

            return (
              <div
                key={s.id}
                onClick={() => selectStrategy(s.id)}
                style={{
                  background: C.surface,
                  border: active ? `2px solid ${C.accent}` : `1.5px solid ${C.border}`,
                  borderRadius: R.xl,
                  padding: '18px 18px 16px',
                  cursor: 'pointer',
                  position: 'relative',
                  boxShadow: active ? `0 0 0 4px rgba(164,60,18,0.10), 0 4px 16px rgba(0,0,0,0.08)` : S.card,
                  transition: 'all 0.15s',
                }}
              >
                {active && (
                  <div style={{
                    position: 'absolute', top: 14, right: 14,
                    width: 20, height: 20, borderRadius: '50%',
                    background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFF"
                      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                )}

                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: meta.iconBg, color: meta.iconColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
                }}>
                  {meta.icon}
                </div>

                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 5 }}>
                  {s.name.charAt(0).toUpperCase() + s.name.slice(1).toLowerCase()} Strategy
                </div>

                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.55, marginBottom: 10 }}>
                  {s.description || meta.hint}
                </div>

                <div style={{
                  fontSize: 11, color: active ? C.accent : C.textFaint,
                  background: active ? C.accentBg : '#F8FAFF',
                  borderRadius: 6, padding: '5px 8px', marginBottom: 12, lineHeight: 1.4,
                }}>
                  {meta.hint}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                      padding: '2px 8px', borderRadius: 20,
                      background: meta.tagBg, color: meta.tagColor,
                    }}>
                      {isC ? 'CUSTOM' : 'PRESET'}
                    </span>
                    <span style={{ fontSize: 11, color: C.textFaint }}>{s.rules_count} rules</span>
                  </div>

                  {s.name?.toUpperCase() === 'CUSTOM' && !s.is_custom && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.accent }}>Add rules ↓</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {detail && (
        <div ref={rulesRef}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
              Rules for <span style={{ color: C.accent }}>{detail.name}</span>
            </div>
            <p style={{ fontSize: 11, color: C.textMuted, margin: 0 }}>
              {isNewCustom
                ? "Cochez les règles à inclure — les coefficients seront configurés à l'étape suivante."
                : 'Rules included in this strategy — coefficients are configured in the next step.'}
            </p>
          </div>

          {!isNewCustom && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 22 }}>
                {(detail.rules || []).map((rule) => {
                  const ruleKey = rule.rule_id || rule.id;
                  const badge = AGG_BADGE[rule.aggregation_function] || AGG_BADGE.none;

                  return (
                    <div key={ruleKey} style={{
                      background: C.surface, border: `1.5px solid ${C.border}`,
                      borderRadius: R.lg, padding: 16, boxShadow: S.card,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{rule.name}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 20,
                          background: badge.bg, color: badge.color, letterSpacing: '0.04em',
                        }}>{badge.label}</span>
                      </div>
                      <p style={{ fontSize: 12, color: C.textMuted, margin: 0, lineHeight: 1.6 }}>
                        {rule.description || '—'}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: R.lg, padding: '16px 20px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#166534', marginBottom: 2 }}>Ready to apply</div>
                <div style={{ fontSize: 12, color: C.textMuted }}>{(detail.rules || []).length} rules included in this strategy</div>
              </div>
            </>
          )}

          {isNewCustom && (
            <>
              <div style={{
                background: customSelected.size > 0 ? '#F0FDF4' : C.surface,
                border: `1.5px solid ${customSelected.size > 0 ? '#86EFAC' : C.border}`,
                borderRadius: R.lg, padding: '12px 18px', marginBottom: 16,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: customSelected.size > 0 ? '#166534' : C.textMuted }}>
                  {customSelected.size > 0
                    ? `${customSelected.size} rule${customSelected.size > 1 ? 's' : ''} selected — les coefficients seront définis à l'étape suivante`
                    : 'Sélectionnez au moins une règle pour continuer'}
                </div>
              </div>

              <div style={{ fontSize: 10, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: 2, marginBottom: 8 }}>
                System rules
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {allRules.filter(r => r.is_system !== false && r.source !== 'user').map((rule) => (
                  <RuleCheckCard
                    key={rule.id}
                    rule={rule}
                    badge={AGG_BADGE[rule.aggregation_function] || AGG_BADGE.none}
                    selected={customSelected.has(rule.id)}
                    onToggle={() => toggleCustomRule(rule.id)}
                  />
                ))}
              </div>

              {allRules.some(r => r.source === 'user') && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: 2, marginBottom: 8, marginTop: 8 }}>
                    My custom rules
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {allRules.filter(r => r.source === 'user').map((rule) => (
                      <RuleCheckCard
                        key={rule.id}
                        rule={rule}
                        badge={AGG_BADGE.none}
                        selected={customSelected.has(rule.id)}
                        onToggle={() => toggleCustomRule(rule.id)}
                        isUserRule
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {!detail && (
        <EmptyState
          icon={<LightningIcon />}
          title="Select a strategy to configure its rules"
          description="Choose one of the strategies above to view and adjust its pricing rules, coefficients and parameters."
        />
      )}

      <WorkflowFooter
        label={footerLabel}
        onBack={() => navigate('/pricing-rules/scope')}
        onNext={handleNext}
        nextDisabled={!isValid}
        nextLoading={saving}
      />

      {showNameModal && (
        <NameStrategyModal
          onClose={() => setShowNameModal(false)}
          onConfirm={handleCreateCustom}
          saving={saving}
        />
      )}
    </div>
  );
}

function RuleCheckCard({ rule, badge, selected, onToggle, isUserRule }) {
  return (
    <div onClick={onToggle} style={{
      background: C.surface,
      border: selected ? `1.5px solid ${C.accent}` : `1.5px solid ${C.border}`,
      borderRadius: R.lg, padding: '14px 16px',
      boxShadow: selected ? `0 0 0 3px rgba(164,60,18,0.07)` : S.card,
      cursor: 'pointer', transition: 'all 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
          border: `2px solid ${selected ? C.accent : C.border}`,
          background: selected ? C.accent : C.surface,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}>
          {selected && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="#FFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{rule.name}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 20,
              background: badge.bg, color: badge.color, letterSpacing: '0.04em',
            }}>{badge.label}</span>

            {isUserRule && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 20,
                background: '#F4F7FF', color: '#1E3A5F', border: '1px solid #D0D9F0',
              }}>MY RULE</span>
            )}
          </div>

          <p style={{ fontSize: 12, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>
            {rule.description || '—'}
          </p>

          {isUserRule && rule.formula && (
            <code style={{
              fontSize: 11, color: C.accent, background: '#F8FAFF',
              padding: '2px 6px', borderRadius: 4, marginTop: 4, display: 'inline-block',
            }}>
              {rule.formula}
            </code>
          )}
        </div>
      </div>
    </div>
  );
}