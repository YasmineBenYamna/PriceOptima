import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import {
  Alert, Button, EmptyState, PageSpinner, SectionLabel,
} from '../components/ui';
import { C, R } from '../components/ui';

import WorkflowPage from '../components/workflow/WorkflowPage.jsx';
import CoefficientSummary from '../components/rules/CoefficientSummary.jsx';
import RuleCard from '../components/rules/RuleCard.jsx';

import {
  getUserStrategy, getStrategy, updateUserStrategy,
  createUserStrategy, updateRule, createJob, createCustomRule, getRules,
} from '../api/api.js';

const RULE_ICON_COLORS = [
  { bg: '#F4F7FF', color: '#1E3A5F' },
  { bg: '#FFFBEB', color: '#8AA4CF' },
  { bg: '#F4F7FF', color: '#1E3A5F' },
  { bg: '#F0FDF4', color: '#166534' },
  { bg: '#FEF2F2', color: '#dc2626' },
];

// ─── Helper : extrait une valeur scalaire depuis un param DB (schéma ou valeur directe) ──
function getParamValue(llmVal, schemaOrVal, fallback) {
  if (llmVal !== undefined && llmVal !== null) return llmVal;
  if (schemaOrVal !== undefined && schemaOrVal !== null) {
    if (typeof schemaOrVal === 'object') return schemaOrVal.default ?? fallback;
    return schemaOrVal;
  }
  return fallback;
}

// ─── Modal Add New Rule ────────────────────────────────────────────────────────

function NewCustomRuleModal({ onClose, onAdd }) {
  const [form, setForm] = useState({
    name: '', description: '', coefficient: '', formula: '',
  });
  const [err, setErr] = useState('');

  const handleAdd = () => {
    if (!form.name.trim()) return setErr('Rule name is required.');
    const coeff = parseFloat(form.coefficient);
    if (isNaN(coeff) || coeff <= 0 || coeff > 1) {
      return setErr('Coefficient must be between 0.01 and 1.');
    }
    const tempId = `custom_${Date.now()}`;
    onAdd({
      id: tempId,
      rule_id: tempId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      coefficient: coeff,
      formula: form.formula.trim() || null,
    });
    onClose();
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1.5px solid #ccc', fontSize: 13, boxSizing: 'border-box',
  };
  const labelStyle = {
    fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: R.xl, padding: 28, width: 480,
        boxShadow: '0 10px 50px rgba(0,0,0,0.2)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Add New Rule</div>
        <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 20 }}>
          Create a custom rule and add it to this strategy. You can adjust coefficients
          afterwards — just make sure the total sums to 1.0 before applying.
        </div>

        {err && <Alert variant="danger" style={{ marginBottom: 16 }}>{err}</Alert>}

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Rule Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            style={inputStyle}
            placeholder="e.g. Volume Surge Rule"
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Coefficient (0.01 – 1) *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max="1"
            value={form.coefficient}
            onChange={e => setForm({ ...form, coefficient: e.target.value })}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Formula <span style={{ fontWeight: 400 }}>(optional)</span></label>
          <input
            type="text"
            value={form.formula}
            onChange={e => setForm({ ...form, formula: e.target.value })}
            style={inputStyle}
            placeholder="price * volume * 0.85"
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleAdd}>Add Rule</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Coefficient error banner ─────────────────────────────────────────────────

function CoeffErrorBanner({ coeffSum, activeCount }) {
  if (activeCount === 0) return null;
  const diff = (coeffSum - 1.0).toFixed(3);
  const isOver = coeffSum > 1.0;

  return (
    <div style={{
      background: '#FEF2F2', border: '1.5px solid #FCA5A5',
      borderRadius: 10, padding: '12px 16px',
      display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#991B1B', marginBottom: 2 }}>
          Coefficient sum must equal exactly 1.0
        </div>
        <div style={{ fontSize: 12, color: '#B91C1C' }}>
          Current total: <strong>{coeffSum.toFixed(3)}</strong>
          {' '}—{' '}
          {isOver
            ? `reduce coefficients by ${Math.abs(diff)} to proceed.`
            : `increase coefficients by ${Math.abs(diff)} to proceed.`}
          {' '}Adjust individual rule coefficients below, then apply changes.
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RuleConfigurationPage() {
  const { strategyId } = useParams();
  const navigate       = useNavigate();
  const location       = useLocation();

  const isNewCustom          = location.state?.is_new_custom === true;
  const customMeta           = location.state?.custom_meta;
  const customRulesFromState = location.state?.custom_rules || [];
  const scope                = location.state?.scope;
  const isSystemStrategy     = !!location.state?.system_strategy_id && !isNewCustom;
  const llmRules             = location.state?.llm_rules || [];

  const [strategy,               setStrategy]             = useState(null);
  const [local,                  setLocal]                = useState({});
  const [loading,                setLoading]              = useState(true);
  const [saving,                 setSaving]               = useState(false);
  const [error,                  setError]                = useState(null);
  const [showNewCustomRuleModal, setShowNewCustomRuleModal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        let sRes;

        if (isNewCustom) {
          // ── Nouvelle stratégie custom (depuis LLM ou sélection manuelle) ──
          const rulesWithNames = customRulesFromState.map((r, idx) => ({
            ...r,
            id:          r.rule_id || r.custom_rule_code || `llm_custom_${idx}`,
            name:        r.name        || r.rule_name || r.rule_id || `Rule ${idx + 1}`,
            description: r.description || '',
            active:      r.active      ?? true,
            params:      r.params      || {},
          }));
          sRes = {
            id:          'new-custom',
            name:        customMeta?.name || 'My Custom Strategy',
            description: customMeta?.description || '',
            rules:       rulesWithNames,
          };

        } else if (isSystemStrategy) {
          // ── Stratégie système — charger depuis DB puis merger rules LLM extra ──
          sRes = await getStrategy(strategyId);

          if (llmRules.length > 0) {
            const sysRuleIds = new Set((sRes.rules || []).map((r) => r.rule_id || r.id));
            const extraLlmRules = llmRules
              .filter((lr) => lr.rule_id && !sysRuleIds.has(lr.rule_id))
              .map((lr, idx) => ({
                rule_id:     lr.rule_id,
                id:          lr.rule_id,
                name:        lr.rule_name || lr.rule_id,
                description: '',
                active:      true,
                coefficient: lr.coefficient,
                params:      lr.params || {},
              }));
            if (extraLlmRules.length > 0) {
              sRes = { ...sRes, rules: [...(sRes.rules || []), ...extraLlmRules] };
            }
          }

        } else {
          // ── Stratégie user existante ──
          sRes = await getUserStrategy(strategyId);
        }

        setStrategy(sRes);

        // ── Construire l'état local des paramètres de chaque rule ──
        const initial = {};
        (sRes.rules || []).forEach((r) => {
          const key       = r.rule_id || r.id;
          const params    = r.params  || {};
          const llmRule   = llmRules.find((lr) => lr.rule_id === key);
          const llmParams = llmRule?.params || {};

          initial[key] = {
            coefficient:         llmRule?.coefficient ?? parseFloat(r.coefficient ?? 0),
            aggregationFunction: getParamValue(llmParams.aggregation_function, params.aggregation_function, 'median'),
            discountPct:         getParamValue(llmParams.discount_pct,         params.discount_pct,         3),
            lowThresholdPct:     getParamValue(llmParams.low_threshold_pct,    params.low_threshold_pct,    1),
            highThresholdPct:    getParamValue(llmParams.high_threshold_pct,   params.high_threshold_pct,   15),
            isActive:            r.active !== false,
            name:                r.name || r.rule?.name || r.rule_name || key,
            description:         r.description || r.rule?.description || '',
          };
        });

        setLocal(initial);
        setLoading(false);
      } catch (e) {
        setError(e.message || 'Strategy not found');
        setLoading(false);
      }
    })();
  }, [strategyId, isSystemStrategy, isNewCustom]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived state ────────────────────────────────────────────────────────────

  const strategyRules = strategy?.rules?.map((r) => ({ ...r, key: r.rule_id || r.id })) ?? [];
  const activeRules   = strategyRules.filter((r) => local[r.key]?.isActive !== false);
  const coeffSum      = activeRules.reduce(
    (sum, r) => sum + (parseFloat(local[r.key]?.coefficient) || 0), 0,
  );
  const coeffValid    = activeRules.length > 0 && Math.abs(coeffSum - 1.0) < 0.01;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const change = (key, field, value) =>
    setLocal(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));

  const toggleActive = (key) =>
    setLocal(prev => ({ ...prev, [key]: { ...prev[key], isActive: !prev[key].isActive } }));

  const handleAddNewRule = (newRule) => {
    setStrategy(prev => ({
      ...prev,
      rules: [...(prev?.rules || []), newRule],
    }));
    setLocal(prev => ({
      ...prev,
      [newRule.rule_id]: {
        coefficient:         newRule.coefficient,
        aggregationFunction: 'median',
        discountPct:         3,
        lowThresholdPct:     1,
        highThresholdPct:    15,
        isActive:            true,
        name:                newRule.name,
        description:         newRule.description,
      },
    }));
  };

  const handleDiscardStrategy = () => {
    navigate('/pricing-rules/strategy-configuration', { state: { scope } });
  };

  const handleSave = async () => {
    if (!coeffValid) {
      setError(`Coefficient sum must equal exactly 1.0 (current: ${coeffSum.toFixed(3)})`);
      return;
    }
    if (!scope) {
      setError('Scope is missing. Please go back and select a scope.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // ── Step 1 : persister les nouvelles custom rules (temp ID) ──────────
      const tempIdMap = {};
      for (const rule of strategyRules) {
        const key = rule.key;
        if (String(key).startsWith('custom_')) {
          try {
            const created = await createCustomRule({
              name:        local[key]?.name        || rule.name,
              description: local[key]?.description || rule.description || '',
              formula:     rule.formula || 'price',
            });
            tempIdMap[key] = created.id;
          } catch (e) {
            console.warn('Failed to persist custom rule:', e.message);
            tempIdMap[key] = key;
          }
        }
      }

      const resolveKey = (key) => tempIdMap[key] || key;

      // ── Step 2 : mettre à jour les params des rules existantes ────────────
      for (const rule of strategyRules) {
        const key = rule.key;
        if (String(key).startsWith('custom_') || tempIdMap[key]) continue;
        const l = local[key];
        if (!l) continue;
        const params = {};
        if (l.aggregationFunction !== undefined) params.aggregation_function = l.aggregationFunction;
        if (l.discountPct         !== undefined) params.discount_pct         = Number(l.discountPct);
        if (l.lowThresholdPct     !== undefined) params.low_threshold_pct    = Number(l.lowThresholdPct);
        if (l.highThresholdPct    !== undefined) params.high_threshold_pct   = Number(l.highThresholdPct);
        try { await updateRule(key, params); } catch { /* non-blocking */ }
      }

      // ── Step 3 : persister UserStrategy ──────────────────────────────────
      let userStrategyId = null;

      if (isNewCustom) {
        const created = await createUserStrategy({
          name:        customMeta?.name        || strategy.name,
          description: customMeta?.description || '',
          is_custom:   true,
          rules: strategyRules.map((r) => ({
            rule_id:     resolveKey(r.key),
            coefficient: parseFloat(local[r.key]?.coefficient ?? 0),
          })),
        });
        userStrategyId = created.id;

      } else if (isSystemStrategy) {
        try {
          const created = await createUserStrategy({
            name:             strategy.name,
            description:      strategy.description || '',
            is_custom:        false,
            base_strategy_id: strategyId,
            rules: strategyRules.map((r) => ({
              rule_id:     resolveKey(r.key),
              coefficient: parseFloat(local[r.key]?.coefficient ?? 0),
            })),
          });
          userStrategyId = created.id;
        } catch { /* non-blocking */ }

      } else {
        await updateUserStrategy(strategyId, {
          name:  strategy.name,
          rules: strategyRules.map((r) => ({
            rule_id:     resolveKey(r.key),
            coefficient: parseFloat(local[r.key]?.coefficient ?? 0),
          })),
        });
        userStrategyId = strategyId;
      }

      // ── Step 4 : créer le job de pricing ─────────────────────────────────
      const jobPayload = {
        strategy_name:      strategy?.name || 'STRATEGY',
        user_strategy_id:   userStrategyId,
        system_strategy_id: isSystemStrategy ? strategyId : null,
        eans:               scope?.eans               || [],
        category:           scope?.categories?.[0]    || scope?.category || null,
        brand:              scope?.brands?.[0]         || scope?.brand    || null,
      };

      await createJob(jobPayload);
      navigate('/jobs', { state: { flash: 'Pricing job submitted successfully.' } });

    } catch (e) {
      setError(e.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <PageSpinner message="Loading configuration..." />;

  return (
    <WorkflowPage
      breadcrumbItems={[
        { label: 'Pricing Workflow' },
        { label: 'Strategy Configuration' },
        { label: strategy?.name || 'Strategy', active: true },
      ]}
      title={`Rule Configuration — ${strategy?.name || 'Strategy'}`}
      subtitle="Define logic parameters for market-dominance price adjustments."
    >
      {/* ── Top action bar ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 20,
      }}>
        <Button variant="secondary" onClick={() => navigate('/pricing-rules/strategy-configuration', { state: { scope } })}>
          Back
        </Button>

        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" onClick={() => setShowNewCustomRuleModal(true)}>
            + Add New Rule
          </Button>
          <Button variant="danger" onClick={handleDiscardStrategy}>
            Discard Strategy
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!coeffValid || saving}
            onClick={handleSave}
            title={
              !coeffValid
                ? `Coefficients must sum to 1.0 — current: ${coeffSum.toFixed(3)}`
                : undefined
            }
          >
            Apply Changes
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger" style={{ marginBottom: 20 }}>{error}</Alert>}

      {!coeffValid && activeRules.length > 0 && (
        <CoeffErrorBanner coeffSum={coeffSum} activeCount={activeRules.length} />
      )}

      <SectionLabel>
        {strategyRules.length} rule{strategyRules.length !== 1 ? 's' : ''} in this strategy
      </SectionLabel>

      <CoefficientSummary count={activeRules.length} coeffSum={coeffSum} coeffValid={coeffValid} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
        {strategyRules.map((rule, idx) => (
          <RuleCard
            key={rule.key || rule.id || idx}
            rule={rule}
            localRule={local[rule.key]}
            active={local[rule.key]?.isActive !== false}
            iconTheme={RULE_ICON_COLORS[idx % RULE_ICON_COLORS.length]}
            onToggle={() => toggleActive(rule.key)}
            onChange={(field, value) => change(rule.key, field, value)}
          />
        ))}
      </div>

      {!coeffValid && activeRules.length > 0 && (
        <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, textAlign: 'right' }}>
          ⚠️ Coefficients must sum to 1.0 — current: {coeffSum.toFixed(3)}
        </div>
      )}

      {showNewCustomRuleModal && (
        <NewCustomRuleModal
          onClose={() => setShowNewCustomRuleModal(false)}
          onAdd={handleAddNewRule}
        />
      )}
    </WorkflowPage>
  );
}