// src/pages/RuleConfigurationPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  getUserStrategy, getStrategy, updateUserStrategy,
  deleteUserStrategy, updateRule, createUserStrategy, createJob,
} from '../api/api.js';
import {
  C, R,
  Button,
  Alert,
  EmptyState,
  PageSpinner,
  Card, SectionLabel,
  Breadcrumb,
  Field,
  Toggle,
  Modal, ModalHeader,
} from '../components/ui/index.js';

const RULE_ICON_COLORS = [
  { bg: '#F4F7FF', color: '#1E3A5F' },
  { bg: '#FFFBEB', color: '#8AA4CF' },
  { bg: '#F4F7FF', color: '#1E3A5F' },
  { bg: '#F0FDF4', color: '#166534' },
  { bg: '#FEF2F2', color: '#dc2626' },
  { bg: '#F4F7FF', color: '#1E3A5F' },
];

function getRuleIcon(name = '') {
  const n = name.toLowerCase();
  if (n.includes('aggregat'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 17h6M17 14v6"/></svg>;
  if (n.includes('competitor') || n.includes('beat'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
  if (n.includes('floor') || n.includes('min store'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="20" x2="21" y2="20"/><polyline points="7 10 12 5 17 10"/><line x1="12" y1="5" x2="12" y2="17"/></svg>;
  if (n.includes('market') || n.includes('average'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
  if (n.includes('stability'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>;
}

const DownloadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const ListIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6"  x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);

const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

// ─── Modal Add New Rule ───────────────────────────────────────────────────────
function AddRuleModal({ onClose, onAdd, existingCoeffSum }) {
  const remaining = Math.max(0, Math.round((1 - existingCoeffSum) * 1000) / 1000);
  const isBlocked = remaining === 0;

  const [form, setForm] = useState({
    name:        '',
    description: '',
    formula:     '',
    coefficient: isBlocked ? '' : String(remaining),
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim())    { setErr('Le nom est requis.');      return; }
    if (!form.formula.trim()) { setErr('La formule est requise.'); return; }
    const coeff = parseFloat(form.coefficient);
    if (isNaN(coeff) || coeff <= 0 || coeff > 1) {
      setErr('Le coefficient doit être entre 0 (exclus) et 1.'); return;
    }
    if (coeff > remaining + 0.001) {
      setErr(`Coefficient trop élevé — restant : ${remaining.toFixed(3)}`); return;
    }
    setSaving(true); setErr('');
    try {
      await onAdd({ name: form.name.trim(), description: form.description.trim() || undefined, formula: form.formula.trim(), coefficient: coeff });
      onClose();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal onClose={onClose} maxWidth={500}>
      <ModalHeader title="Add New Rule" subtitle={<div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Create a custom pricing rule for this strategy</div>} onClose={onClose} />
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{
          background: isBlocked ? '#FEF2F2' : '#F0FDF4',
          border: `1.5px solid ${isBlocked ? '#FECACA' : '#86EFAC'}`,
          borderRadius: R.md, padding: '10px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: isBlocked ? '#dc2626' : '#166534' }}>
              {isBlocked ? 'Aucun coefficient disponible' : `Coefficient restant : ${remaining.toFixed(3)}`}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
              Somme actuelle : {existingCoeffSum.toFixed(3)} / 1.000
            </div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: isBlocked ? '#dc2626' : '#166534' }}>
            {Math.round(remaining * 100)}%
          </div>
        </div>

        {isBlocked ? (
          <Alert variant="danger">La somme des coefficients est déjà 1.0. Réduisez un coefficient existant avant d'ajouter une règle.</Alert>
        ) : (
          <>
            {err && <Alert variant="danger">{err}</Alert>}
            <Field label="Rule Name *" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="e.g. PROMO_DISCOUNT_RULE" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Description</label>
              <textarea value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="Décrivez ce que fait cette règle..." rows={2}
                style={{ width: '100%', padding: '9px 12px', borderRadius: R.md, border: `1.5px solid ${C.border}`, fontSize: 13, color: C.text, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', background: C.bg }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Formule *</label>
              <textarea value={form.formula} onChange={(e) => setField('formula', e.target.value)} placeholder="e.g. market_average * 0.95" rows={3}
                style={{ width: '100%', padding: '9px 12px', borderRadius: R.md, border: `1.5px solid ${C.border}`, fontSize: 13, color: C.text, outline: 'none', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', background: C.bg }} />
              <div style={{ fontSize: 11, color: C.textFaint }}>
                Variables : <code>market_average</code>, <code>competitor_price</code>, <code>cost_price</code>, <code>floor_price</code>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Coefficient * <span style={{ fontWeight: 400, textTransform: 'none', color: C.textMuted }}>(max {remaining.toFixed(3)})</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="number" min={0.001} max={remaining} step={0.05} value={form.coefficient}
                  onChange={(e) => setField('coefficient', e.target.value)}
                  style={{ flex: 1, padding: '9px 12px', borderRadius: R.md, border: `1.5px solid ${C.border}`, fontSize: 13, fontWeight: 700, color: C.accent, background: '#FFF', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: C.textMuted, minWidth: 40, textAlign: 'right' }}>
                  {Math.round((parseFloat(form.coefficient) || 0) * 100)}%
                </div>
              </div>
              <div style={{ height: 4, background: C.border, borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${Math.min((parseFloat(form.coefficient) || 0) * 100, 100)}%`,
                  background: (parseFloat(form.coefficient) || 0) > remaining + 0.001 ? '#dc2626' : C.accent,
                  borderRadius: 99, transition: 'width 0.2s',
                }} />
              </div>
            </div>
          </>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: `1px solid ${C.border}` }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        {!isBlocked && <Button variant="primary" loading={saving} onClick={handleSubmit}>Create Rule</Button>}
      </div>
    </Modal>
  );
}

// ─── Modal confirmation suppression ──────────────────────────────────────────
function ConfirmDeleteModal({ strategyName, onClose, onConfirm, deleting }) {
  return (
    <Modal onClose={onClose} maxWidth={400}>
      <ModalHeader title="Supprimer la stratégie" subtitle={<div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Cette action est irréversible</div>} onClose={onClose} />
      <div style={{ padding: '20px 24px' }}>
        <p style={{ fontSize: 13, color: C.text, margin: 0, lineHeight: 1.6 }}>
          Êtes-vous sûr de vouloir supprimer la stratégie <strong>"{strategyName}"</strong> ? Elle sera définitivement supprimée.
        </p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: `1px solid ${C.border}` }}>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button variant="danger" loading={deleting} onClick={onConfirm}>Supprimer</Button>
      </div>
    </Modal>
  );
}

// ─── Modal succès job lancé ───────────────────────────────────────────────────
function JobSuccessModal({ job, onClose, onGoToJobs }) {
  return (
    <Modal onClose={onClose} maxWidth={440}>
      <ModalHeader title="Pricing lancé avec succès ✓" onClose={onClose} />
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: R.md, padding: '14px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 6 }}>
            Job créé — {job?.job_number || job?.id}
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span>Stratégie : <strong>{job?.strategy_name}</strong></span>
            <span>Produits traités : <strong>{job?.total_processed ?? '—'}</strong></span>
            <span>Statut : <strong style={{ textTransform: 'capitalize' }}>{job?.status}</strong></span>
          </div>
        </div>
        <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>
          Vous pouvez consulter le détail et l'historique de ce job dans la page Jobs.
        </p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: `1px solid ${C.border}` }}>
        <Button variant="secondary" onClick={onClose}>Rester ici</Button>
        <Button variant="primary" onClick={onGoToJobs}>Voir les Jobs</Button>
      </div>
    </Modal>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function RuleConfigurationPage() {
  const { strategyId }   = useParams();
  const navigate         = useNavigate();
  const location         = useLocation();
  const isSystemStrategy = !!location.state?.system_strategy_id;

  // Scope transmis depuis ProductScopePage via navigation state
  const scopeType  = location.state?.scopeType  || null;
  const scopeEans  = location.state?.eans        || [];
  const scopeCat   = location.state?.categories?.[0] || null;
  const scopeBrand = location.state?.brands?.[0]     || null;

  const [strategy,        setStrategy]        = useState(null);
  const [local,           setLocal]           = useState({});
  const [loading,         setLoading]         = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [deleting,        setDeleting]        = useState(false);
  const [error,           setError]           = useState('');
  const [showModal,       setShowModal]       = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [jobResult,       setJobResult]       = useState(null); // modal succès

  useEffect(() => {
    (async () => {
      try {
        const sRes = isSystemStrategy
          ? await getStrategy(strategyId)
          : await getUserStrategy(strategyId);
        setStrategy(sRes);
        const l = {};
        (sRes.rules || []).forEach((r) => {
          const key    = r.rule_id || r.id;
          const params = r.params || {};
          l[key] = {
            coefficient:          Number(r.coefficient ?? 0),
            aggregation_function: params.aggregation_function || 'median',
            discount_pct:         params.discount_pct         ?? 3,
            low_threshold_pct:    params.low_threshold_pct    ?? 1,
            high_threshold_pct:   params.high_threshold_pct   ?? 15,
            is_active:            r.active !== false,
            name:                 r.name        || '',
            description:          r.description || '',
          };
        });
        setLocal(l);
        setLoading(false);
      } catch (e) { setError(e.message); setLoading(false); }
    })();
  }, [strategyId]);

  const change       = (key, field, val) => setLocal((p) => ({ ...p, [key]: { ...p[key], [field]: val } }));
  const toggleActive = (key)             => setLocal((p) => ({ ...p, [key]: { ...p[key], is_active: !p[key].is_active } }));

  const strategyRules = (strategy?.rules || []).map((r) => ({ ...r, _key: r.rule_id || r.id }));
  const activeRules   = strategyRules.filter((r) => local[r._key]?.is_active !== false);
  const coeffSum      = activeRules.reduce((sum, r) => sum + (parseFloat(local[r._key]?.coefficient) || 0), 0);
  const coeffValid    = activeRules.length === 0 || Math.abs(coeffSum - 1.0) <= 0.01;

  // ─── Ajouter une nouvelle rule custom ────────────────────────────────────────
  const handleAddRule = async (body) => {
    const token = localStorage.getItem('access_token');

    // 1. Créer la rule custom dans la base
    const res = await fetch('/api/v1/rules/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(typeof data?.detail === 'string' ? data.detail : `HTTP ${res.status}`);
    }
    const created = await res.json();

    // 2. Si stratégie système → la convertir en user strategy d'abord
    let targetStrategyId = strategyId;
    if (isSystemStrategy) {
      const existingRules = strategyRules.map((r) => ({
        rule_id:     r._key,
        coefficient: Number(local[r._key]?.coefficient || 0),
      }));
      existingRules.push({ rule_id: created.id, coefficient: body.coefficient });
      const newStrat = await createUserStrategy({
        name:             `${strategy?.name || 'STRATEGY'} CUSTOM`,
        description:      strategy?.description || '',
        rules:            existingRules,
        base_strategy_id: strategyId,
      });
      targetStrategyId = newStrat.id;
      navigate(`/pricing-rules/configure/${newStrat.id}`, {
        replace: true,
        state:   { user_strategy_id: newStrat.id, scopeType, eans: scopeEans, categories: scopeCat ? [scopeCat] : [], brands: scopeBrand ? [scopeBrand] : [] },
      });
    }

    // 3. Mettre à jour le state local
    setStrategy((prev) => ({
      ...prev,
      rules: [...(prev.rules || []), {
        rule_id: created.id, id: created.id,
        name: created.name, description: created.description || '',
        coefficient: body.coefficient, active: true, params: {},
      }],
    }));
    setLocal((prev) => ({
      ...prev,
      [created.id]: {
        coefficient: body.coefficient, aggregation_function: 'median',
        discount_pct: 3, low_threshold_pct: 1, high_threshold_pct: 15,
        is_active: true, name: created.name, description: created.description || '',
      },
    }));
  };

  // ─── Supprimer la stratégie ──────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true); setError('');
    try {
      await deleteUserStrategy(strategyId);
      setShowDeleteModal(false);
      navigate('/pricing-rules/strategy-configuration');
    } catch (e) { setError(e.message); setDeleting(false); setShowDeleteModal(false); }
  };

  // ─── Apply Changes → màj règles + créer job + modal succès ──────────────────
  const handleSave = async () => {
    if (!coeffValid) { setError(`Coefficient sum must equal 1.0 (current: ${coeffSum.toFixed(2)})`); return; }
    setSaving(true); setError('');
    try {
      // 1. Mettre à jour les params de chaque règle système
      for (const rule of strategyRules) {
        const key    = rule._key;
        const l      = local[key] || {};
        const name   = (rule.name || '').toLowerCase();
        const params = {};
        if (name.includes('aggregat') && l.aggregation_function)  params.aggregation_function = l.aggregation_function;
        if ((name.includes('competitor') || name.includes('beat')) && l.discount_pct !== undefined) params.discount_pct = Number(l.discount_pct);
        if (name.includes('stability')) {
          if (l.low_threshold_pct  !== undefined) params.low_threshold_pct  = Number(l.low_threshold_pct);
          if (l.high_threshold_pct !== undefined) params.high_threshold_pct = Number(l.high_threshold_pct);
        }
        if (Object.keys(params).length > 0) {
          try { await updateRule(key, { params }); } catch (_) { /* règle custom — pas de PUT */ }
        }
      }

      // 2. Pour user strategy : mettre à jour les coefficients
      let finalUserStrategyId = isSystemStrategy ? null : strategyId;
      if (!isSystemStrategy) {
        const updatedRules = strategyRules.map((r) => ({
          rule_id:     r._key,
          coefficient: Number(local[r._key]?.coefficient || 0),
        }));
        await updateUserStrategy(strategyId, { name: strategy.name, rules: updatedRules });
      }

      // 3. Construire le payload du job selon le scope
      const jobPayload = {
        strategy_name:      strategy?.name || 'STRATEGY',
        system_strategy_id: isSystemStrategy   ? strategyId          : null,
        user_strategy_id:   !isSystemStrategy  ? strategyId          : null,
      };

     // Scope
    if (scopeType === 'Product' && scopeEans.length > 0) {
      jobPayload.eans = scopeEans;
    } else if (scopeType === 'Category' && scopeCat) {
      jobPayload.category = scopeCat;
    } else if (scopeType === 'Brand' && scopeBrand) {
      jobPayload.brand = scopeBrand;
    } else if (scopeEans.length > 0) {
      jobPayload.eans = scopeEans;
    } else if (scopeCat) {
      jobPayload.category = scopeCat;
    } else if (scopeBrand) {
      jobPayload.brand = scopeBrand;
    } else {
      setError("Aucun produit sélectionné. Retournez à l'étape 1 pour sélectionner des produits.");
      setSaving(false);
      return;
}

      // 4. Créer le job
      const job = await createJob(jobPayload);

      // 5. Afficher le modal de succès
      setJobResult(job);

    } catch (e) {
      // Extraire le message proprement (évite [object Object])
      let msg = e.message;
      if (typeof msg === 'object') msg = JSON.stringify(msg);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ strategy: strategy?.name, rules: local }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `config-${strategy?.name || 'export'}.json`;
    a.click();
  };

  if (loading) return <PageSpinner message="Loading configuration..." />;

  const strategyLabel = strategy?.name
    ? `${strategy.name.charAt(0)}${strategy.name.slice(1).toLowerCase()} Strategy`
    : 'Strategy';

  return (
    <div style={{ paddingBottom: 40 }}>
      <Breadcrumb items={[
        { label: 'Pricing Workflow' },
        { label: 'Strategy Configuration' },
        { label: strategyLabel, active: true },
      ]} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>
            Rule Configuration: {strategyLabel}
          </h1>
          <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>
            Define logic parameters for market-dominance price adjustments.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <Button icon={<PlusIcon />} variant="primary" onClick={() => setShowModal(true)}>Add New Rule</Button>
          <Button icon={<DownloadIcon />} onClick={handleExport}>Export Config</Button>
        </div>
      </div>

      {error && <Alert variant="danger" style={{ marginBottom: 20 }}>{error}</Alert>}

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <SectionLabel>{strategyRules.length} rule{strategyRules.length !== 1 ? 's' : ''} in this strategy</SectionLabel>
          {activeRules.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: coeffValid ? '#166534' : '#dc2626' }}>
                Coefficient sum: {coeffSum.toFixed(3)} / 1.000
              </span>
              <span style={{
                fontSize: 11, borderRadius: 6, padding: '2px 8px',
                color: coeffValid ? '#166534' : '#dc2626',
                background: coeffValid ? '#F0FDF4' : '#FEF2F2',
                border: `1px solid ${coeffValid ? '#86EFAC' : '#FECACA'}`,
              }}>
                {coeffValid ? 'Valid' : 'Must equal 1.0'}
              </span>
            </div>
          )}
        </div>
        {activeRules.length > 0 && (
          <div style={{ height: 5, background: C.border, borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.min(coeffSum * 100, 100)}%`,
              background: coeffValid ? '#166534' : coeffSum > 1 ? '#dc2626' : '#1E3A5F',
              borderRadius: 99, transition: 'width 0.3s, background 0.3s',
            }} />
          </div>
        )}
      </div>

      {strategyRules.length === 0 ? (
        <EmptyState icon={<ListIcon />} title="No rules configured for this strategy" description="Go back and configure rules from the Strategy Configuration page." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          {strategyRules.map((rule, idx) => {
            const key          = rule._key;
            const l            = local[key] || {};
            const active       = l.is_active !== false;
            const iconTheme    = RULE_ICON_COLORS[idx % RULE_ICON_COLORS.length];
            const ruleName     = rule.name || l.name || key;
            const ruleNameLc   = ruleName.toLowerCase();
            const isAggregation    = ruleNameLc.includes('aggregat');
            const isCompetitorBeat = ruleNameLc.includes('competitor') || ruleNameLc.includes('beat');
            const isStability      = ruleNameLc.includes('stability');

            return (
              <Card key={key} overflow="hidden" style={{
                border:    active ? '1.5px solid #D4845A' : `1.5px solid ${C.border}`,
                boxShadow: active ? '0 2px 12px rgba(2,36,72,0.10)' : '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: iconTheme.bg, color: iconTheme.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {getRuleIcon(ruleName)}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3, letterSpacing: '-0.01em' }}>{ruleName}</div>
                      <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>{rule.description || l.description || '—'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                      background: active ? C.accentBg : '#F8FAFF',
                      color:      active ? '#1E3A5F'  : C.textFaint,
                      border:     `1px solid ${active ? C.textFaint : C.border}`,
                    }}>
                      {active ? 'Active' : 'Inactive'}
                    </span>
                    <Toggle on={active} onToggle={() => toggleActive(key)} />
                  </div>
                </div>

                {active && (
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '16px 22px 20px', borderTop: `1px solid #DCE9FF` }}>
                    <div style={{ minWidth: 150 }}>
                      <Field label="Coefficient" type="number" min={0} max={1} step={0.05} value={l.coefficient ?? ''} onChange={(e) => change(key, 'coefficient', e.target.value)} />
                    </div>
                    {isAggregation && (
                      <div style={{ minWidth: 190 }}>
                        <Field label="Aggregation Function" type="select" value={l.aggregation_function || 'median'} onChange={(e) => change(key, 'aggregation_function', e.target.value)}>
                          {['lowest', 'average', 'median'].map((o) => <option key={o} value={o}>{o.toUpperCase()}</option>)}
                        </Field>
                      </div>
                    )}
                    {isCompetitorBeat && (
                      <div style={{ minWidth: 160 }}>
                        <Field label="Discount %" type="number" min={0} max={100} step={0.5} value={l.discount_pct ?? 3} onChange={(e) => change(key, 'discount_pct', e.target.value)} suffix="%" />
                      </div>
                    )}
                    {isStability && (
                      <>
                        <div style={{ minWidth: 160 }}>
                          <Field label="Low Threshold %" type="number" min={0} max={100} step={0.5} value={l.low_threshold_pct ?? 1} onChange={(e) => change(key, 'low_threshold_pct', e.target.value)} suffix="%" />
                        </div>
                        <div style={{ minWidth: 160 }}>
                          <Field label="High Threshold %" type="number" min={0} max={100} step={0.5} value={l.high_threshold_pct ?? 15} onChange={(e) => change(key, 'high_threshold_pct', e.target.value)} suffix="%" />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
        <Button
          variant="dangerGhost"
          disabled={isSystemStrategy}
          title={isSystemStrategy ? 'Les stratégies système ne peuvent pas être supprimées' : ''}
          onClick={() => !isSystemStrategy && setShowDeleteModal(true)}
        >
          Delete Strategy
        </Button>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" onClick={() => navigate('/pricing-rules/strategy-configuration')}>Back</Button>
          <Button variant="primary" loading={saving} disabled={!coeffValid}
            title={!coeffValid ? `Coefficient sum must equal 1.0 (current: ${coeffSum.toFixed(2)})` : ''}
            onClick={handleSave}>
            Apply Changes
          </Button>
        </div>
      </div>

      {showModal && <AddRuleModal onClose={() => setShowModal(false)} onAdd={handleAddRule} existingCoeffSum={coeffSum} />}

      {showDeleteModal && (
        <ConfirmDeleteModal strategyName={strategy?.name || ''} onClose={() => setShowDeleteModal(false)} onConfirm={handleDelete} deleting={deleting} />
      )}

      {jobResult && (
        <JobSuccessModal
          job={jobResult}
          onClose={() => setJobResult(null)}
          onGoToJobs={() => navigate('/jobs')}
        />
      )}

      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
    </div>
  );
}