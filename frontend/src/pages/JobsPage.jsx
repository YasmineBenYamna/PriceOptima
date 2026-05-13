// src/pages/JobsPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { getJobs, getJob, deleteJob } from '../api/api.js';
import {
  C, R, S, F,
  Button, Alert, PageSpinner, Card, SectionLabel, Breadcrumb, PageHeader,
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
    completed: { ...C.success, label: 'Completed', dot: '#22c55e' },
    failed:    { ...C.danger,  label: 'Failed',    dot: '#ef4444' },
    pending:   { ...C.warning, label: 'Pending',   dot: '#f59e0b' },
    running:   { ...C.info,    label: 'Running',   dot: '#3b82f6' },
  };
  const c = config[status] || config.pending;
  return (
    <span style={{
      display:      'inline-flex',
      alignItems:   'center',
      gap:          5,
      fontFamily:   F.body,
      fontSize:     11,
      fontWeight:   700,
      padding:      '3px 10px',
      borderRadius: R.full,
      background:   c.bg,
      color:        c.text,
      border:       `1px solid ${c.border}`,
    }}>
      <span style={{
        width:       6,
        height:      6,
        borderRadius:'50%',
        background:  c.dot,
        animation:   (status === 'running' || status === 'pending') ? 'ui-pulse 1.5s ease infinite' : 'none',
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
              width:          22,
              height:         22,
              borderRadius:   '50%',
              flexShrink:     0,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              background:     isDone ? C.success.bg : isFailed ? C.danger.bg : C.neutral.bg,
              border:         `2px solid ${isDone ? C.success.border : isFailed ? C.danger.border : C.border}`,
            }}>
              {isDone ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.success.text} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : isFailed ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.danger.text} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              ) : (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.border }} />
              )}
            </div>
            <span style={{
              fontFamily: F.body,
              fontSize:   13,
              color:      isDone ? C.text : isFailed ? C.danger.text : C.textMuted,
              fontWeight: isDone ? 600 : 400,
            }}>
              {step.step}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Download CSV ──────────────────────────────────────────────────────────────
function downloadCSV(job, detail) {
  const rows = detail?.price_changes || [];
  if (!rows.length) return;
  const header = ['EAN', 'Prix Original (€)', 'Prix Final (€)', 'Variation (€)', 'Variation (%)', 'Règle déclenchée'];
  const lines  = rows.map(r => [
    r.product_id, r.old_price, r.new_price,
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
  const [jobs,          setJobs]          = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [selectedJob,   setSelectedJob]   = useState(null);
  const [jobDetail,     setJobDetail]     = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deleting,      setDeleting]      = useState(null);

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
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  useEffect(() => {
    jobs.forEach(async (job) => {
      if (job.status === 'completed' && !job._downloaded) {
        job._downloaded = true;
        try {
          const detail = await getJob(job.id);
          if (detail?.price_changes?.length > 0) downloadCSV(job, detail);
        } catch {}
      }
    });
  }, [jobs]);

  const handleSelectJob = async (job) => {
    if (selectedJob?.id === job.id) { setSelectedJob(null); setJobDetail(null); return; }
    setSelectedJob(job);
    setLoadingDetail(true);
    try {
      setJobDetail(await getJob(job.id));
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
    try { downloadCSV(job, await getJob(job.id)); }
    catch (err) { setError(err.message); }
  };

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

      <PageHeader
        title="Jobs de Pricing"
        subtitle="Historique des calculs de prix — les résultats sont téléchargés automatiquement en CSV."
        actions={
          <Button icon={<RefreshIcon />} onClick={fetchJobs} variant="secondary">
            Actualiser
          </Button>
        }
      />

      {error && <Alert variant="danger" style={{ marginBottom: 20 }}>{error}</Alert>}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total',      value: stats.total,     color: C.text,         bg: C.surface,     border: C.border        },
          { label: 'En attente', value: stats.pending,   color: C.warning.text, bg: C.warning.bg,  border: C.warning.border },
          { label: 'Complétés',  value: stats.completed, color: C.success.text, bg: C.success.bg,  border: C.success.border },
          { label: 'Échoués',    value: stats.failed,    color: C.danger.text,  bg: C.danger.bg,   border: C.danger.border  },
        ].map((s, i) => (
          <div key={i} style={{
            background:   s.bg,
            borderRadius: R.lg,
            padding:      '16px 20px',
            border:       `1px solid ${s.border}`,
          }}>
            <div style={{
              fontFamily:    F.display,
              fontSize:      24,
              fontWeight:    800,
              color:         s.color,
              letterSpacing: '-0.03em',
            }}>
              {s.value}
            </div>
            <div style={{
              fontFamily:    F.body,
              fontSize:      11,
              color:         C.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              marginTop:     2,
            }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {jobs.length === 0 ? (
        <div style={{
          textAlign:  'center',
          padding:    60,
          color:      C.textMuted,
          fontFamily: F.body,
          fontSize:   14,
        }}>
          Aucun job trouvé. Lancez un calcul de pricing pour commencer.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 20 }}>

          {/* Liste des jobs */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SectionLabel>Tous les jobs</SectionLabel>
            {jobs.map(job => (
              <Card key={job.id} onClick={() => handleSelectJob(job)} style={{
                padding:   '16px 20px',
                cursor:    'pointer',
                border:    selectedJob?.id === job.id ? `2px solid ${C.accent}` : `1.5px solid ${C.border}`,
                boxShadow: selectedJob?.id === job.id ? `0 0 0 3px rgba(164,60,18,0.08)` : S.card,
                transition:'all 0.15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontFamily: F.body,
                        fontSize:   13,
                        fontWeight: 700,
                        color:      C.text,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {job.job_number || `JOB-${job.id?.slice(0,6).toUpperCase()}`}
                      </span>
                      <StatusBadge status={job.status} />
                    </div>
                    <div style={{ fontFamily: F.body, fontSize: 12, color: C.textMuted, marginBottom: 2 }}>
                      Stratégie : <strong>{job.strategy_name}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontFamily: F.body, fontSize: 11, color: C.textFaint }}>
                      <span>{job.total_processed} produits traités</span>
                      {job.average_delta !== undefined && (
                        <span style={{
                          color:      job.average_delta < 0 ? C.success.text : job.average_delta > 0 ? C.danger.text : C.textFaint,
                          fontWeight: 600,
                        }}>
                          {job.average_delta > 0 ? '+' : ''}{job.average_delta?.toFixed(2)}% variation moy.
                        </span>
                      )}
                      <span>{new Date(job.created_at).toLocaleString('fr-FR')}</span>
                    </div>
                  </div>

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
                  <div style={{ textAlign: 'center', padding: 24, fontFamily: F.body, color: C.textMuted }}>
                    Chargement...
                  </div>
                ) : jobDetail ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Header */}
                    <div>
                      <div style={{
                        fontFamily:    F.display,
                        fontSize:      16,
                        fontWeight:    800,
                        color:         C.text,
                        marginBottom:  4,
                        letterSpacing: '-0.02em',
                      }}>
                        {jobDetail.job_number || selectedJob.job_number}
                      </div>
                      <StatusBadge status={jobDetail.status} />
                    </div>

                    {/* Infos */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[
                        ['Stratégie',      jobDetail.strategy_name],
                        ['Produits',       `${jobDetail.total_processed} traités`],
                        ['Mis à jour',     `${jobDetail.prices_updated} prix`],
                        ['Durée',          `${jobDetail.runtime_seconds}s`],
                        ['Variation moy.', `${jobDetail.average_delta > 0 ? '+' : ''}${jobDetail.average_delta?.toFixed(2)}%`],
                      ].map(([k, v]) => (
                        <div key={k} style={{
                          display:       'flex',
                          justifyContent:'space-between',
                          fontFamily:    F.body,
                          fontSize:      12,
                          padding:       '4px 0',
                          borderBottom:  `1px solid ${C.divider}`,
                        }}>
                          <span style={{ color: C.textMuted }}>{k}</span>
                          <span style={{ fontWeight: 600, color: C.text }}>{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Timeline */}
                    <div>
                      <div style={{
                        fontFamily:    F.body,
                        fontSize:      11,
                        fontWeight:    700,
                        color:         C.textFaint,
                        textTransform: 'uppercase',
                        letterSpacing: '.07em',
                        marginBottom:  12,
                      }}>
                        Logs d'exécution
                      </div>
                      <Timeline steps={jobDetail.execution_timeline} />
                    </div>

                    {/* Distribution */}
                    {jobDetail.distribution && (
                      <div>
                        <div style={{
                          fontFamily:    F.body,
                          fontSize:      11,
                          fontWeight:    700,
                          color:         C.textFaint,
                          textTransform: 'uppercase',
                          letterSpacing: '.07em',
                          marginBottom:  12,
                        }}>
                          Distribution des variations
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {[
                            { label: 'Baisse',  pct: jobDetail.distribution.markdown_pct,  color: C.success.text, bg: C.success.bg },
                            { label: 'Stable',  pct: jobDetail.distribution.unchanged_pct, color: C.textMuted,    bg: C.surfaceAlt },
                            { label: 'Hausse',  pct: jobDetail.distribution.markup_pct,    color: C.danger.text,  bg: C.danger.bg  },
                          ].map(d => (
                            <div key={d.label} style={{
                              flex:         1,
                              textAlign:    'center',
                              padding:      '10px 8px',
                              borderRadius: R.md,
                              background:   d.bg,
                            }}>
                              <div style={{
                                fontFamily:    F.display,
                                fontSize:      16,
                                fontWeight:    800,
                                color:         d.color,
                                letterSpacing: '-0.02em',
                              }}>
                                {d.pct}%
                              </div>
                              <div style={{ fontFamily: F.body, fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                                {d.label}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Erreurs */}
                    {jobDetail.errors?.length > 0 && (
                      <div>
                        <div style={{
                          fontFamily:    F.body,
                          fontSize:      11,
                          fontWeight:    700,
                          color:         C.danger.text,
                          textTransform: 'uppercase',
                          letterSpacing: '.07em',
                          marginBottom:  8,
                        }}>
                          Erreurs ({jobDetail.errors.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {jobDetail.errors.slice(0, 5).map((err, i) => (
                            <div key={i} style={{
                              fontFamily:   F.body,
                              fontSize:     11,
                              color:        C.danger.text,
                              background:   C.danger.bg,
                              padding:      '6px 10px',
                              borderRadius: R.sm,
                            }}>
                              EAN {err.ean || err.product_id} : {err.error}
                            </div>
                          ))}
                          {jobDetail.errors.length > 5 && (
                            <div style={{ fontFamily: F.body, fontSize: 11, color: C.textMuted }}>
                              + {jobDetail.errors.length - 5} autres erreurs
                            </div>
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
    </div>
  );
}