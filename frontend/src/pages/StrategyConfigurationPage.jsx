import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  Alert,
  EmptyState,
  PageSpinner,
  SectionLabel,
} from '../components/ui';
import { WorkflowFooter } from '../components/ui';
import { C, R } from '../components/ui';

import WorkflowPage from '../components/workflow/WorkflowPage.jsx';
import StrategyCard from '../components/strategy/StrategyCard.jsx';
import RuleCheckCard from '../components/strategy/RuleCheckCard.jsx';
import LLMSuggestionPanel from '../components/strategy/LLMSuggestionPanel.jsx';

import {
  getStrategies,
  getRules,
  getStrategy,
  getUserStrategy,
} from '../api/api.js';

import { useLLMSuggestion } from '../hooks/useLLMSuggestion.js';

// ─── Visual metadata ──────────────────────────────────────────────────────────

const STRATEGY_META = {
  AGGRESSIVE: {
    icon: <span>⚡</span>,
    iconColor: '#1E3A5F',
    iconBg: '#F4F7FF',
    tag: 'PRESET',
    tagColor: '#022448',
    tagBg: '#F4F7FF',
    hint: 'High aggressiveness may reduce margins by up to 12%.',
  },
  COMPETITIVE: {
    icon: <span>📈</span>,
    iconColor: '#8AA4CF',
    iconBg: '#FFFBEB',
    tag: 'PRESET',
    tagColor: '#92400E',
    tagBg: '#FFFBEB',
    hint: 'Balanced approach follows competitors without leading.',
  },
  MARKET_ALIGNED: {
    icon: <span>🎯</span>,
    iconColor: '#1E3A5F',
    iconBg: '#F4F7FF',
    tag: 'PRESET',
    tagColor: '#022448',
    tagBg: '#F4F7FF',
    hint: 'Margin-safe strategy.',
  },
  CUSTOM: {
    icon: <span>⚙️</span>,
    iconColor: '#6B7280',
    iconBg: '#F4F7FF',
    tag: 'CUSTOM',
    tagColor: '#1E3A5F',
    tagBg: '#F4F7FF',
    hint: 'Fully configurable strategy.',
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

// ─── Modal: name + description for custom strategy ───────────────────────────

function CustomStrategyModal({ onClose, onConfirm }) {
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [err,         setErr]         = useState('');

  const handleConfirm = () => {
    if (!name.trim()) { setErr('Strategy name is required.'); return; }
    onConfirm({ name: name.trim(), description: description.trim() });
  };

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: R.md,
    border: `1.5px solid ${C.border}`, fontSize: 13, color: C.text,
    outline: 'none', boxSizing: 'border-box', background: C.bg,
  };
  const labelStyle = {
    fontSize: 11, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase',
    letterSpacing: '0.07em', display: 'block', marginBottom: 6,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: R.xl, padding: 28, width: 460,
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 22 }}>⚙️</span>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>New Custom Strategy</div>
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 22 }}>
          Give your strategy a name and description. It will only be saved once you apply pricing.
        </div>

        {err && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{err}</div>}

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Strategy Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My Aggressive Mix"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>
            Description{' '}
            <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10 }}>(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description of what this strategy does..."
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px', borderRadius: R.md, border: `1.5px solid ${C.border}`,
              background: '#fff', color: C.text, fontSize: 13, cursor: 'pointer', fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              padding: '8px 18px', borderRadius: R.md, border: 'none',
              background: '#1E3A5F', color: '#fff', fontSize: 13,
              cursor: 'pointer', fontWeight: 700,
            }}
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Footer coefficient error banner ─────────────────────────────────────────

function CoeffFooterError({ coeffSum, visible }) {
  if (!visible) return null;
  return (
    <div style={{
      background: '#FEF2F2', border: '1.5px solid #FCA5A5',
      borderRadius: 8, padding: '10px 14px', marginBottom: 12,
      fontSize: 12, color: '#991B1B', fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span>⚠️</span>
      <span>
        Coefficient sum must equal exactly 1.0 — current:{' '}
        <strong>{coeffSum.toFixed(3)}</strong>.
        Adjust rule coefficients before applying changes.
      </span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StrategyConfigurationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const scope    = location.state?.scope;
  const rulesRef = useRef(null);

  const [strategies,        setStrategies]       = useState([]);
  const [systemRules,       setSystemRules]       = useState([]);
  const [customRules,       setCustomRules]       = useState([]);
  const [selectedId,        setSelectedId]        = useState(null);
  const [detail,            setDetail]            = useState(null);
  const [loading,           setLoading]           = useState(true);
  const [saving,            setSaving]            = useState(false);
  const [error,             setError]             = useState(null);
  const [customSelected,    setCustomSelected]    = useState(new Set());
  const [aiDismissed,       setAiDismissed]       = useState(false);
  const [showCustomModal,   setShowCustomModal]   = useState(false);
  const [pendingCustomMeta, setPendingCustomMeta] = useState(null);
  const [showCoeffError,    setShowCoeffError]    = useState(false);

  useEffect(() => {
    if (!scope) {
      console.warn('[StrategyConfigurationPage] No scope found in location.state.');
      navigate('/pricing-rules/scope');
    }
  }, [scope]);

  const { loading: aiLoading, suggestion: aiSuggestion, error: aiError, enabled: aiEnabled } =
    useLLMSuggestion(scope);

  useEffect(() => {
    Promise.all([
      getStrategies(),
      getRules({ is_system: true }),
      getRules({ is_system: false }),
    ])
      .then(([sRes, sysRulesRes, customRulesRes]) => {
        setStrategies(sRes.strategies || []);
        setSystemRules(sysRulesRes.rules || []);
        setCustomRules(customRulesRes.rules || []);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const selectedStrategy       = strategies.find((s) => s.id === selectedId);
  const isNewCustom            = selectedStrategy?.name?.toUpperCase() === 'CUSTOM'
                                 && selectedStrategy?.source === 'system';
  const isExistingUserStrategy = selectedStrategy?.source === 'user' && selectedStrategy?.is_custom === true;

  const customCoeffSum = React.useMemo(() => {
    if (!isNewCustom) return 0;
    return customSelected.size > 0 ? 1.0 : 0;
  }, [isNewCustom, customSelected]);

  const isValid = isNewCustom
    ? (customSelected.size > 0 && !!pendingCustomMeta)
    : !!selectedId;

  // ── Strategy selection ────────────────────────────────────────────────────────

  const selectStrategy = async (id) => {
    const s = strategies.find((x) => x.id === id);
    setShowCoeffError(false);

    if (s?.name?.toUpperCase() === 'CUSTOM' && s?.source === 'system') {
      if (selectedId === id && pendingCustomMeta) {
        setSelectedId(null);
        setDetail(null);
        setCustomSelected(new Set());
        setPendingCustomMeta(null);
        return;
      }
      setSelectedId(id);
      setCustomSelected(new Set());
      setPendingCustomMeta(null);
      setShowCustomModal(true);
      return;
    }

    if (selectedId === id) {
      setSelectedId(null);
      setDetail(null);
      setCustomSelected(new Set());
      setPendingCustomMeta(null);
      return;
    }

    setSelectedId(id);
    setError(null);
    setCustomSelected(new Set());
    setPendingCustomMeta(null);

    try {
      const data = s?.source === 'user' ? await getUserStrategy(id) : await getStrategy(id);

      const allRules = [...systemRules, ...customRules];
      const enrichedRules = (data.rules || []).map((rule) => {
        const found = allRules.find((r) => r.id === (rule.rule_id || rule.id));
        return {
          ...rule,
          name:        rule.name        || found?.name        || rule.rule_id || rule.id,
          description: rule.description || found?.description || '',
        };
      });

      setDetail({ ...data, rules: enrichedRules });
      setTimeout(() => rulesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleCustomModalConfirm = ({ name, description }) => {
    setPendingCustomMeta({ name, description });
    setShowCustomModal(false);
    setDetail({ rules: [] });
    setTimeout(() => rulesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  };

  const handleCustomModalClose = () => {
    setShowCustomModal(false);
    if (!pendingCustomMeta) {
      setSelectedId(null);
      setDetail(null);
    }
  };

  const toggleCustomRule = (ruleId) => {
    setCustomSelected((prev) => {
      const next = new Set(prev);
      next.has(ruleId) ? next.delete(ruleId) : next.add(ruleId);
      return next;
    });
  };

  // ── Apply AI suggestion ───────────────────────────────────────────────────────

  const handleApplyAISuggestion = () => {
    if (!aiSuggestion) return;

    const recommendedName = aiSuggestion.recommended_strategy_name || aiSuggestion.recommendedStrategyName;
    // Vérifier si les rule_ids correspondent exactement à une stratégie système
    const SYSTEM_STRATEGY_RULES = {
      's1': new Set(['r1', 'r2', 'r3']),   // adapte selon ta DB
      's2': new Set(['r1', 'r3', 'r6']),   // adapte selon ta DB
      's3': new Set(['r4', 'r2', 'r6']),   // adapte selon ta DB
    };
const llmRuleIds = new Set(
  (aiSuggestion.rules || []).filter(r => r.rule_id).map(r => r.rule_id)
);
const matchesSystem = Object.values(SYSTEM_STRATEGY_RULES).some(sysSet =>
  sysSet.size === llmRuleIds.size && [...sysSet].every(id => llmRuleIds.has(id))
);
const isCustom = !matchesSystem;

    // Construire les custom_rules depuis les rules LLM
    // Chaque rule LLM a : rule_id, rule_name, coefficient, params, is_new
    const llmCustomRules = (aiSuggestion.rules || []).map((r, idx) => ({
      rule_id:     r.rule_id || r.custom_rule_code || `llm_custom_${idx}`,
      coefficient: r.coefficient,
      name:        r.rule_name || r.rule_id || `Rule ${idx + 1}`,
      description: r.rule_description || r.description || '',
      active:      true,
      params:      r.params || {},
      formula:     r.rule_formula || null,
    }));

    // Nom auto généré depuis le contexte LLM
    const scopeLabel = (
      aiSuggestion.context_used?.categories?.[0]
      || aiSuggestion.context_used?.brands?.[0]
      || 'Strategy'
    );
    const autoMeta = {
      name:        `AI ${recommendedName} — ${scopeLabel}`,
      description: aiSuggestion.explanation || '',
    };

    if (isCustom) {
      // ── CUSTOM : naviguer directement avec toutes les rules LLM ──────────
      navigate('/pricing-rules/configure/new-custom', {
        state: {
          is_new_custom: true,
          custom_meta:   autoMeta,
          custom_rules:  llmCustomRules,   // ← toutes les rules LLM, params inclus
          llm_rules:     aiSuggestion.rules, // ← pour pré-remplir les params dans RuleConfig
          scope,
        },
      });
    } else {
      // ── SYSTÈME : trouver la stratégie correspondante et naviguer ─────────
      const matched = strategies.find((s) =>
        s.name?.toUpperCase() === recommendedName?.toUpperCase()
      );
      if (!matched) {
        setError(`Strategy "${recommendedName}" not found.`);
        return;
      }
      navigate(`/pricing-rules/configure/${matched.id}`, {
        state: {
          system_strategy_id: matched.id,
          llm_rules:          aiSuggestion.rules, // ← params LLM pour pré-remplir RuleConfig
          scope,
        },
      });
    }

    setAiDismissed(true);
  };

  // ── Next / Apply ─────────────────────────────────────────────────────────────

  const handleNext = async () => {
    setError(null);
    setShowCoeffError(false);

    if (!selectedStrategy) return;

    if (isExistingUserStrategy) {
      navigate(`/pricing-rules/configure/${selectedStrategy.id}`, {
        state: { user_strategy_id: selectedStrategy.id, scope },
      });
      return;
    }

    if (!isNewCustom) {
      navigate(`/pricing-rules/configure/${selectedStrategy.id}`, {
        state: { system_strategy_id: selectedStrategy.id, scope },
      });
      return;
    }

    // ── Nouvelle stratégie custom manuelle ───────────────────────────────────
    const ids = [...customSelected];
    if (ids.length === 0) {
      setError('Please select at least one rule.');
      return;
    }

    const base = Math.floor((1 / ids.length) * 10000) / 10000;
    let rem    = 1;
    const allAvailableRules = [...systemRules, ...customRules];
    const rules = ids.map((ruleId, i) => {
      const coeff    = i === ids.length - 1 ? Math.round(rem * 10000) / 10000 : base;
      rem -= base;
      const ruleInfo = allAvailableRules.find((r) => r.id === ruleId) || {};
      return {
        rule_id:     ruleId,
        coefficient: coeff,
        name:        ruleInfo.name        || ruleId,
        description: ruleInfo.description || '',
        active:      ruleInfo.active      ?? true,
        params:      ruleInfo.params      || {},
      };
    });

    const sumCheck = rules.reduce((s, r) => s + r.coefficient, 0);
    if (Math.abs(sumCheck - 1.0) >= 0.01) {
      setShowCoeffError(true);
      return;
    }

    navigate('/pricing-rules/configure/new-custom', {
      state: {
        is_new_custom: true,
        custom_meta:   pendingCustomMeta,
        custom_rules:  rules,
        scope,
      },
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <PageSpinner message="Loading strategies..." />;

  return (
    <WorkflowPage
      breadcrumbItems={[
        { label: 'Pricing Workflow' },
        { label: 'Strategy Configuration', active: true },
      ]}
      title="Strategy Configuration"
      subtitle="Configure pricing strategies and their rule coefficients for market-optimized pricing."
      step={2}
      footer={
        <>
          {showCoeffError && (
            <CoeffFooterError
              coeffSum={customCoeffSum}
              visible={showCoeffError}
            />
          )}
          <WorkflowFooter
            label={
              selectedId
                ? (
                  <span style={{ fontStyle: 'italic' }}>
                    {isNewCustom && pendingCustomMeta
                      ? `"${pendingCustomMeta.name}" — ${customSelected.size} rule(s) selected`
                      : `${selectedStrategy?.name} strategy selected.`}
                  </span>
                )
                : <span style={{ fontStyle: 'italic' }}>No strategy selected yet.</span>
            }
            onBack={() => navigate('/pricing-rules/scope')}
            onNext={handleNext}
            nextDisabled={!isValid || saving}
            nextLoading={saving}
          />
        </>
      }
    >
      {error && <Alert variant="danger" style={{ marginBottom: 20 }}>{error}</Alert>}

      {aiEnabled && !aiDismissed && (
        <LLMSuggestionPanel
          scope={scope}
          loading={aiLoading}
          error={aiError}
          suggestion={aiSuggestion}
          onApply={handleApplyAISuggestion}
          onDismiss={() => setAiDismissed(true)}
        />
      )}

      {/* ── Strategy cards ── */}
      <section style={{ marginBottom: 36 }}>
        <SectionLabel>Choose the strategy</SectionLabel>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(236px, 1fr))',
          gap: 14,
        }}>
          {strategies.map((strategy) => {
            const meta = STRATEGY_META[strategy.name?.toUpperCase()] || STRATEGY_META.CUSTOM;
            return (
              <StrategyCard
                key={strategy.id}
                strategy={strategy}
                meta={meta}
                active={selectedId === strategy.id}
                onClick={() => selectStrategy(strategy.id)}
              />
            );
          })}
        </div>
      </section>

      {/* ── Custom strategy metadata banner ── */}
      {isNewCustom && pendingCustomMeta && (
        <div style={{
          background: '#F4F7FF', border: '1.5px solid #C7D7F0',
          borderRadius: R.lg, padding: '12px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>⚙️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E3A5F' }}>
              {pendingCustomMeta.name}
            </div>
            {pendingCustomMeta.description && (
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                {pendingCustomMeta.description}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#8AA4CF', marginTop: 4 }}>
              Will be saved to your strategies once you apply pricing.
            </div>
          </div>
          <button
            onClick={() => setShowCustomModal(true)}
            style={{
              fontSize: 11, color: '#1E3A5F', background: 'none',
              border: 'none', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0,
            }}
          >
            Edit
          </button>
        </div>
      )}

      {/* ── Rules section ── */}
      <section ref={rulesRef}>
        {!detail ? (
          <EmptyState
            icon={() => <span style={{ fontSize: 22 }}>⚡</span>}
            title="Select a strategy to configure its rules"
            description="Choose one strategy above to view its rules."
          />
        ) : !isNewCustom ? (
          <>
            <SectionLabel>Rules in strategy</SectionLabel>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 12, marginBottom: 22,
            }}>
              {detail.rules.map((rule) => (
                <RuleCheckCard
                  key={rule.rule_id || rule.id}
                  rule={rule}
                  badge={AGG_BADGE[rule.aggregation_function] || null}
                  selected={false}
                  onToggle={() => {}}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <SectionLabel>Pick rules for your custom strategy</SectionLabel>

            {customSelected.size > 0 && (
              <div style={{
                background: '#F0FDF4', border: '1.5px solid #86EFAC',
                borderRadius: 8, padding: '9px 14px', marginBottom: 14,
                fontSize: 12, color: '#166534', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>
                  {customSelected.size} rule{customSelected.size !== 1 ? 's' : ''} selected —
                  coefficients will be split equally (1/{customSelected.size} each) and can be
                  fine-tuned on the next screen.
                </span>
              </div>
            )}

            {systemRules.length > 0 && (
              <>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: '#6B7280',
                  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
                }}>
                  System rules
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {systemRules.map((rule) => (
                    <RuleCheckCard
                      key={rule.id}
                      rule={rule}
                      badge={AGG_BADGE[rule.aggregation_function] || null}
                      selected={customSelected.has(rule.id)}
                      onToggle={() => toggleCustomRule(rule.id)}
                      isUserRule={false}
                    />
                  ))}
                </div>
              </>
            )}

            {customRules.length > 0 && (
              <>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: '#6B7280',
                  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
                }}>
                  My custom rules
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {customRules.map((rule) => (
                    <RuleCheckCard
                      key={rule.id}
                      rule={rule}
                      badge={AGG_BADGE[rule.aggregation_function] || null}
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
      </section>

      {showCustomModal && (
        <CustomStrategyModal
          onClose={handleCustomModalClose}
          onConfirm={handleCustomModalConfirm}
        />
      )}
    </WorkflowPage>
  );
}