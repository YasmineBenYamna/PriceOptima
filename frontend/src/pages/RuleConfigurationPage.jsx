import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import {
  Alert,
  Button,
  EmptyState,
  PageSpinner,
  SectionLabel,
} from '../components/ui';

import WorkflowPage from '../components/workflow/WorkflowPage.jsx';
import CoefficientSummary from '../components/rules/CoefficientSummary.jsx';
import RuleCard from '../components/rules/RuleCard.jsx';

import {
  getUserStrategy,
  getStrategy,
  updateUserStrategy,
  deleteUserStrategy,
  updateRule,
  createJob,
} from '../api/api.js';

const RULE_ICON_COLORS = [
  { bg: '#F4F7FF', color: '#1E3A5F' },
  { bg: '#FFFBEB', color: '#8AA4CF' },
  { bg: '#F4F7FF', color: '#1E3A5F' },
  { bg: '#F0FDF4', color: '#166534' },
  { bg: '#FEF2F2', color: '#dc2626' },
];

function ListIcon() {
  return <span style={{ fontSize: 24 }}>📋</span>;
}

export default function RuleConfigurationPage() {
  const { strategyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const isSystemStrategy = !!location.state?.system_strategy_id;
  const scope = location.state?.scope;

  const [strategy, setStrategy] = useState(null);
  const [local, setLocal] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const sRes = isSystemStrategy
          ? await getStrategy(strategyId)
          : await getUserStrategy(strategyId);

        setStrategy(sRes);

        const initial = {};
        sRes.rules.forEach((r) => {
          const key = r.rule_id || r.id;
          const params = r.params || {};
          initial[key] = {
            coefficient: Number(r.coefficient ?? 0),
            aggregationFunction: params.aggregation_function ?? 'median',
            discountPct: params.discount_pct ?? 3,
            lowThresholdPct: params.low_threshold_pct ?? 1,
            highThresholdPct: params.high_threshold_pct ?? 15,
            isActive: r.active !== false,
            name: r.name,
            description: r.description,
          };
        });

        setLocal(initial);
        setLoading(false);
      } catch (e) {
        setError(e.message);
        setLoading(false);
      }
    })();
  }, [strategyId, isSystemStrategy]);

  const strategyRules = strategy?.rules?.map((r) => ({
    ...r,
    key: r.rule_id || r.id,
  })) ?? [];

  const activeRules = strategyRules.filter((r) => local[r.key]?.isActive !== false);
  const coeffSum = activeRules.reduce(
    (sum, r) => sum + parseFloat(local[r.key]?.coefficient || 0),
    0
  );
  const coeffValid = activeRules.length > 0 && Math.abs(coeffSum - 1.0) < 0.01;

  const change = (key, field, value) => {
    setLocal((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
  };

  const toggleActive = (key) => {
    setLocal((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        isActive: !prev[key].isActive,
      },
    }));
  };

  const handleSave = async () => {
    if (!coeffValid) {
      setError(`Coefficient sum must equal 1.0, current ${coeffSum.toFixed(3)}`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      for (const rule of strategyRules) {
        const key = rule.key;
        const l = local[key];
        const params = {};

        if (l.aggregationFunction) params.aggregation_function = l.aggregationFunction;
        if (l.discountPct !== undefined) params.discount_pct = Number(l.discountPct);
        if (l.lowThresholdPct !== undefined) params.low_threshold_pct = Number(l.lowThresholdPct);
        if (l.highThresholdPct !== undefined) params.high_threshold_pct = Number(l.highThresholdPct);

        try {
          await updateRule(key, params);
        } catch {
          // ignore custom rule update if endpoint unsupported
        }
      }

      if (!isSystemStrategy) {
        await updateUserStrategy(strategyId, {
          name: strategy.name,
          rules: strategyRules.map((r) => ({
            rule_id: r.key,
            coefficient: Number(local[r.key]?.coefficient ?? 0),
          })),
        });
      }

      const jobPayload = {
        strategy_name: strategy?.name || 'STRATEGY',
        system_strategy_id: isSystemStrategy ? strategyId : null,
        user_strategy_id: !isSystemStrategy ? strategyId : null,
      };

      if (scope?.scopeType === 'Product' && scope?.eans?.length) {
        jobPayload.eans = scope.eans;
      } else if (scope?.scopeType === 'Category' && scope?.categories?.[0]) {
        jobPayload.category = scope.categories[0];
      } else if (scope?.scopeType === 'Brand' && scope?.brands?.[0]) {
        jobPayload.brand = scope.brands[0];
      }

      await createJob(jobPayload);
      navigate('/jobs');
    } catch (e) {
      setError(typeof e?.message === 'object' ? JSON.stringify(e.message) : e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageSpinner message="Loading configuration..." />;
  }

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
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 20 }}>
        <Button variant="secondary" onClick={() => navigate('/pricing-rules/strategy-configuration')}>
          Back
        </Button>
        <Button variant="primary" loading={saving} disabled={!coeffValid} onClick={handleSave}>
          Apply Changes
        </Button>
      </div>

      {error && <Alert variant="danger" style={{ marginBottom: 20 }}>{error}</Alert>}

      <SectionLabel>
        {strategyRules.length} rule{strategyRules.length !== 1 ? 's' : ''} in this strategy
      </SectionLabel>

      <CoefficientSummary
        count={activeRules.length}
        coeffSum={coeffSum}
        coeffValid={coeffValid}
      />

      {!strategyRules.length ? (
        <EmptyState
          icon={ListIcon}
          title="No rules configured for this strategy"
          description="Go back and configure rules from the Strategy Configuration page."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          {strategyRules.map((rule, idx) => (
            <RuleCard
              key={rule.key}
              rule={rule}
              localRule={local[rule.key]}
              active={local[rule.key]?.isActive !== false}
              iconTheme={RULE_ICON_COLORS[idx % RULE_ICON_COLORS.length]}
              onToggle={() => toggleActive(rule.key)}
              onChange={(field, value) => change(rule.key, field, value)}
            />
          ))}
        </div>
      )}

      {!coeffValid && activeRules.length > 0 && (
        <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
          Coefficients must sum to 1.0, current {coeffSum.toFixed(3)}.
        </div>
      )}
    </WorkflowPage>
  );
}