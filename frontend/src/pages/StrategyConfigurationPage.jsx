import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  Alert,
  EmptyState,
  PageSpinner,
  SectionLabel,
} from '../components/ui';
import { WorkflowFooter } from '../components/ui';

import WorkflowPage from '../components/workflow/WorkflowPage.jsx';
import StrategyCard from '../components/strategy/StrategyCard.jsx';
import RuleCheckCard from '../components/strategy/RuleCheckCard.jsx';
import LLMSuggestionPanel from '../components/strategy/LLMSuggestionPanel.jsx';

import {
  getStrategies,
  getRules,
  getStrategy,
  getUserStrategy,
  createUserStrategy,
} from '../api/api.js';

import { useLLMSuggestion } from '../hooks/useLLMSuggestion.js';

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
  ALIGNED: {
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
  min: { label: 'MIN', bg: '#FEF2F2', color: '#dc2626' },
  max: { label: 'MAX', bg: '#F0FDF4', color: '#166534' },
  avg: { label: 'AVG', bg: '#FAFBFF', color: '#1E3A5F' },
  median: { label: 'MEDIAN', bg: '#FAFBFF', color: '#1E3A5F' },
  none: { label: 'NONE', bg: '#F8FAFF', color: '#6B7280' },
};

function LightningIcon() {
  return <span style={{ fontSize: 22 }}>⚡</span>;
}

export default function StrategyConfigurationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const scope = location.state?.scope;
  const rulesRef = useRef(null);

  const [strategies, setStrategies] = useState([]);
  const [allRules, setAllRules] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [customSelected, setCustomSelected] = useState(new Set());
  const [aiDismissed, setAiDismissed] = useState(false);

  // BUG FIX 3: scope peut être undefined si la page est accédée directement
  // sans navigation depuis /pricing-rules/scope. On log un warning pour aider
  // au debug, et le hook gère proprement le cas scope=undefined.
  useEffect(() => {
    if (!scope) {
      console.warn(
        '[StrategyConfigurationPage] No scope found in location.state. ' +
        'The LLM suggestion panel will not be shown. ' +
        'Make sure to navigate here from /pricing-rules/scope with a scope in state.'
      );
    }
  }, [scope]);

  const {
    loading: aiLoading,
    suggestion: aiSuggestion,
    error: aiError,
    // BUG FIX 1 (côté consommateur): enabled est maintenant retourné par useLLMSuggestion.
    // Sans ce fix, aiEnabled valait toujours undefined → le panel ne s'affichait jamais.
    enabled: aiEnabled,
  } = useLLMSuggestion(scope);

  useEffect(() => {
    Promise.all([getStrategies(), getRules()])
      .then(([sRes, rRes]) => {
        setStrategies(sRes.strategies);
        setAllRules(rRes.rules);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const selectedStrategy = strategies.find((s) => s.id === selectedId);

  const isNewCustom =
    selectedStrategy &&
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
    setError(null);
    setCustomSelected(new Set());

    try {
      const s = strategies.find((x) => x.id === id);
      const data = s?.is_custom ? await getUserStrategy(id) : await getStrategy(id);
      setDetail(data);

      setTimeout(() => {
        rulesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleCustomRule = (ruleId) => {
    setCustomSelected((prev) => {
      const next = new Set(prev);
      next.has(ruleId) ? next.delete(ruleId) : next.add(ruleId);
      return next;
    });
  };

  const handleApplyAISuggestion = async () => {
    const recommendedName =
      aiSuggestion?.recommended_strategy_name ||
      aiSuggestion?.recommendedStrategyName;

    if (!recommendedName) return;

    const matched = strategies.find(
      (s) => s.name?.toUpperCase() === recommendedName.toUpperCase()
    );

    if (!matched) {
      setError(`Suggested strategy "${recommendedName}" was not found.`);
      return;
    }

    await selectStrategy(matched.id);
    setAiDismissed(true);
  };

  const handleNext = async () => {
    setError(null);

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

    try {
      setSaving(true);

      const ids = [...customSelected];
      const base = Math.floor((1 / ids.length) * 10000) / 10000;
      let rem = 1;

      const rules = ids.map((ruleId, i) => {
        const coeff = i === ids.length - 1 ? Math.round(rem * 10000) / 10000 : base;
        rem -= base;
        return { rule_id: ruleId, coefficient: coeff };
      });

      const created = await createUserStrategy({
        name: 'CUSTOM STRATEGY',
        description: 'Generated from selected rules',
        rules,
        base_strategy_id: null,
      });

      navigate(`/pricing-rules/configure/${created.id}`, {
        state: { user_strategy_id: created.id, scope },
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageSpinner message="Loading strategies..." />;
  }

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
        <WorkflowFooter
          label={
            selectedId ? (
              <span style={{ fontStyle: 'italic' }}>
                {selectedStrategy?.name} strategy selected.
              </span>
            ) : (
              <span style={{ fontStyle: 'italic' }}>
                No strategy selected yet.
              </span>
            )
          }
          onBack={() => navigate('/pricing-rules/scope')}
          onNext={handleNext}
          nextDisabled={!isValid}
          nextLoading={saving}
        />
      }
    >
      {error && (
        <Alert variant="danger" style={{ marginBottom: 20 }}>
          {error}
        </Alert>
      )}

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

      <section style={{ marginBottom: 36 }}>
        <SectionLabel>Choose the strategy</SectionLabel>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(236px, 1fr))',
            gap: 14,
          }}
        >
          {strategies.map((strategy) => {
            const meta =
              STRATEGY_META[strategy.name?.toUpperCase()] || STRATEGY_META.CUSTOM;

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

      <section ref={rulesRef}>
        {!detail ? (
          <EmptyState
            icon={LightningIcon}
            title="Select a strategy to configure its rules"
            description="Choose one strategy above to view its rules."
          />
        ) : !isNewCustom ? (
          <>
            <SectionLabel>Rules in strategy</SectionLabel>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 12,
                marginBottom: 22,
              }}
            >
              {detail.rules.map((rule) => {
                const badge =
                  AGG_BADGE[rule.aggregation_function] || AGG_BADGE.none;

                return (
                  <RuleCheckCard
                    key={rule.rule_id || rule.id}
                    rule={rule}
                    badge={badge}
                    selected={false}
                    onToggle={() => {}}
                  />
                );
              })}
            </div>
          </>
        ) : (
          <>
            <SectionLabel>Pick rules for custom strategy</SectionLabel>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allRules.map((rule) => (
                <RuleCheckCard
                  key={rule.id}
                  rule={rule}
                  badge={AGG_BADGE[rule.aggregation_function] || AGG_BADGE.none}
                  selected={customSelected.has(rule.id)}
                  onToggle={() => toggleCustomRule(rule.id)}
                  isUserRule={rule.source === 'user'}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </WorkflowPage>
  );
}
