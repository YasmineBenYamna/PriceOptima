// src/pages/JobsPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { getJobs, getJob, deleteJob } from '../api/api.js';
import {
  C, R, S,
  Button, Alert, PageSpinner, Card, SectionLabel, Breadcrumb,
} from '../components/ui/index.js';

// ── Icônes ────────────────────────────────────────────────────────────────────
const DownloadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const RefreshIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6M14 11v6"/>
  </svg>
);

// ── Badge statut ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const config = {
    completed: { bg: '#F0FDF4', color: '#166534', border: '#86EFAC', label: 'Completed', dot: '#22c55e' },
    failed:    { bg: '#FEF2F2', color: '#dc2626', border: '#FECACA', label: 'Failed',    dot: '#ef4444' },
    pending:   { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', label: 'Pending',   dot: '#f59e0b' },
    running:   { bg: '#EFF6FF', color: '#1d4ed8', border: '#BFDBFE', label: 'Running',   dot: '#3b82f6' },
  };
  const c = config[status] || config.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: c.dot,
        animation: status === 'running' || status === 'pending' ? 'pulse 1.5s ease infinite' : 'none',
      }} />
      {c.label}
    </span>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────
function Timeline({ steps }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(steps || []).map((step, i) => {
        const isDone   = step.status === 'completed';
        const isFailed = step.status === 'failed';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isDone ? '#F0FDF4' : isFailed ? '#FEF2F2' : '#F4F7FF',
              border: `2px solid ${isDone ? '#86EFAC' : isFailed ? '#FECACA' : C.border}`,
            }}>
              {isDone ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : isFailed ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              ) : (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.border }} />
              )}
            </div>
            <span style={{ fontSize: 13, color: isDone ? C.text : isFailed ? '#dc2626' : C.textMuted, fontWeight: isDone ? 600 : 400 }}>
              {step.step}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Téléchargement CSV ────────────────────────────────────────────────────────
function downloadCSV(job, detail) {
  const rows   = detail?.price_changes || [];
  if (!rows.length) return;

  const header = ['EAN', 'Prix Original (€)', 'Prix Final (€)', 'Variation (€)', 'Variation (%)', 'Règle déclenchée'];
  const lines  = rows.map(r => [
    r.product_id,
    r.old_price,
    r.new_price,
    (r.new_price - r.old_price).toFixed(4),
    r.change_pct,
    r.rule_triggered || 'N/A',
  ].join(','));

  const csv  = [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `pricing_results_${job.job_number || job.id}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function JobsPage() {
  const [jobs,         setJobs]         = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [selectedJob,  setSelectedJob]  = useState(null);
  const [jobDetail,    setJobDetail]    = useState(null);
  const [loadingDetail,setLoadingDetail]= useState(false);
  const [deleting,     setDeleting]     = useState(null);

  const fetchJobs = useCallback(async () => {
    try {
      const data = await getJobs();
      setJobs(data?.jobs || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    // Auto-refresh toutes les 10s pour les jobs pending/running
    const interval = setInterval(() => {
      fetchJobs();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  // Quand un job completed apparaît → télécharger automatiquement
  useEffect(() => {
    jobs.forEach(async (job) => {
      if (job.status === 'completed' && !job._downloaded) {
        job._downloaded = true;
        try {
          const detail = await getJob(job.id);
          if (detail?.price_changes?.length > 0) {
            downloadCSV(job, detail);
          }
        } catch {}
      }
    });
  }, [jobs]);

  const handleSelectJob = async (job) => {
    if (selectedJob?.id === job.id) {
      setSelectedJob(null);
      setJobDetail(null);
      return;
    }
    setSelectedJob(job);
    setLoadingDetail(true);
    try {
      const detail = await getJob(job.id);
      setJobDetail(detail);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDelete = async (jobId, e) => {
    e.stopPropagation();
    setDeleting(jobId);
    try {
      await deleteJob(jobId);
      setJobs(prev => prev.filter(j => j.id !== jobId));
      if (selectedJob?.id === jobId) { setSelectedJob(null); setJobDetail(null); }
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = async (job, e) => {
    e.stopPropagation();
    try {
      const detail = await getJob(job.id);
      downloadCSV(job, detail);
    } catch (err) {
      setError(err.message);
    }
  };

  // Stats
  const stats = {
    total:     jobs.length,
    pending:   jobs.filter(j => j.status === 'pending' || j.status === 'running').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed:    jobs.filter(j => j.status === 'failed').length,
  };

  if (loading) return <PageSpinner message="Chargement des jobs..." />;

  return (
    <div style={{ paddingBottom: 40 }}>
      <Breadcrumb items={[{ label: 'Jobs', active: true }]} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>
            Jobs de Pricing
          </h1>
          <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>
            Historique des calculs de prix — les résultats sont téléchargés automatiquement en CSV.
          </p>
        </div>
        <Button icon={<RefreshIcon />} onClick={fetchJobs} variant="secondary">
          Actualiser
        </Button>
      </div>

      {error && <Alert variant="danger" style={{ marginBottom: 20 }}>{error}</Alert>}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total',     value: stats.total,     color: C.text,    bg: C.surface   },
          { label: 'En attente', value: stats.pending,  color: '#92400E', bg: '#FFFBEB'  },
          { label: 'Complétés', value: stats.completed, color: '#166534', bg: '#F0FDF4'  },
          { label: 'Échoués',   value: stats.failed,    color: '#dc2626', bg: '#FEF2F2'  },
        ].map((s, i) => (
          <div key={i} style={{
            background: s.bg, borderRadius: R.lg, padding: '16px 20px',
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.textMuted, fontSize: 14 }}>
          Aucun job trouvé. Lancez un calcul de pricing pour commencer.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 20 }}>

          {/* Liste des jobs */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SectionLabel>Tous les jobs</SectionLabel>
            {jobs.map(job => (
              <Card key={job.id} onClick={() => handleSelectJob(job)} style={{
                padding: '16px 20px', cursor: 'pointer',
                border: selectedJob?.id === job.id ? `2px solid ${C.accent}` : `1.5px solid ${C.border}`,
                boxShadow: selectedJob?.id === job.id ? `0 0 0 3px rgba(164,60,18,0.08)` : S.card,
                transition: 'all 0.15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>
                        {job.job_number || `JOB-${job.id?.slice(0,6).toUpperCase()}`}
                      </span>
                      <StatusBadge status={job.status} />
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 2 }}>
                      Stratégie : <strong>{job.strategy_name}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 11, color: C.textFaint }}>
                      <span>{job.total_processed} produits traités</span>
                      {job.average_delta !== undefined && (
                        <span style={{ color: job.average_delta < 0 ? '#166534' : job.average_delta > 0 ? '#dc2626' : C.textFaint, fontWeight: 600 }}>
                          {job.average_delta > 0 ? '+' : ''}{job.average_delta?.toFixed(2)}% variation moy.
                        </span>
                      )}
                      <span>{new Date(job.created_at).toLocaleString('fr-FR')}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {job.status === 'completed' && (
                      <Button variant="secondary" icon={<DownloadIcon />} onClick={e => handleDownload(job, e)}>
                        CSV
                      </Button>
                    )}
                    <Button
                      variant="dangerGhost"
                      icon={<TrashIcon />}
                      loading={deleting === job.id}
                      onClick={e => handleDelete(job.id, e)}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Détail du job sélectionné */}
          {selectedJob && (
            <div style={{ width: 380, flexShrink: 0 }}>
              <SectionLabel>Détail du job</SectionLabel>
              <Card style={{ padding: '20px 24px' }}>
                {loadingDetail ? (
                  <div style={{ textAlign: 'center', padding: 24, color: C.textMuted }}>Chargement...</div>
                ) : jobDetail ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Header */}
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 4 }}>
                        {jobDetail.job_number || selectedJob.job_number}
                      </div>
                      <StatusBadge status={jobDetail.status} />
                    </div>

                    {/* Infos */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[
                        ['Stratégie',   jobDetail.strategy_name],
                        ['Produits',    `${jobDetail.total_processed} traités`],
                        ['Mis à jour',  `${jobDetail.prices_updated} prix`],
                        ['Durée',       `${jobDetail.runtime_seconds}s`],
                        ['Variation moy.', `${jobDetail.average_delta > 0 ? '+' : ''}${jobDetail.average_delta?.toFixed(2)}%`],
                      ].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: `1px solid ${C.divider || C.border}` }}>
                          <span style={{ color: C.textMuted }}>{k}</span>
                          <span style={{ fontWeight: 600, color: C.text }}>{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Timeline */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>
                        Logs d'exécution
                      </div>
                      <Timeline steps={jobDetail.execution_timeline} />
                    </div>

                    {/* Distribution */}
                    {jobDetail.distribution && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>
                          Distribution des variations
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {[
                            { label: 'Baisse',  pct: jobDetail.distribution.markdown_pct,  color: '#166534', bg: '#F0FDF4' },
                            { label: 'Stable',  pct: jobDetail.distribution.unchanged_pct, color: C.textMuted, bg: '#F8FAFF' },
                            { label: 'Hausse',  pct: jobDetail.distribution.markup_pct,    color: '#dc2626', bg: '#FEF2F2' },
                          ].map(d => (
                            <div key={d.label} style={{ flex: 1, textAlign: 'center', padding: '10px 8px', borderRadius: R.md, background: d.bg }}>
                              <div style={{ fontSize: 16, fontWeight: 800, color: d.color }}>{d.pct}%</div>
                              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{d.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Erreurs */}
                    {jobDetail.errors?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
                          Erreurs ({jobDetail.errors.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {jobDetail.errors.slice(0, 5).map((err, i) => (
                            <div key={i} style={{ fontSize: 11, color: '#dc2626', background: '#FEF2F2', padding: '6px 10px', borderRadius: R.sm }}>
                              EAN {err.ean || err.product_id} : {err.error}
                            </div>
                          ))}
                          {jobDetail.errors.length > 5 && (
                            <div style={{ fontSize: 11, color: C.textMuted }}>+ {jobDetail.errors.length - 5} autres erreurs</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Bouton télécharger */}
                    {jobDetail.status === 'completed' && (
                      <Button
                        variant="primary"
                        icon={<DownloadIcon />}
                        onClick={() => downloadCSV(selectedJob, jobDetail)}
                        style={{ width: '100%' }}
                      >
                        Télécharger les résultats CSV
                      </Button>
                    )}
                  </div>
                ) : null}
              </Card>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  );
}