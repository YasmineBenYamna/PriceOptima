import React, { useState, useEffect, useCallback } from 'react'
import { getJobs, getJobById, deleteJob } from '../api/api.js'
import { useRequireAuth } from '../hooks/useAuth.js'
import { C, Button, IconButton, StatusBadge, Alert, EmptyState, PageSpinner, Card, Modal, ModalHeader, Breadcrumb, PageHeader, SectionLabel } from '../components/ui/index.js'

const EyeIcon = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
const TrashIcon = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
const RefreshIcon = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
const CalIcon = <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>

function JobDetailModal({ jobId, onClose }) {
  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getJobById(jobId)
      .then(setJob)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [jobId])

  return (
    <Modal onClose={onClose}>
      <ModalHeader
        title={`Détail du Job${job ? ` — ${job.job_number}` : ''}`}
        subtitle={job ? <StatusBadge status={job.status} /> : null}
        onClose={onClose}
      />
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {loading && <div style={{ textAlign: 'center', padding: '40px 0', color: C.textMuted, fontSize: 13 }}>Chargement...</div>}
        {error && <Alert variant="danger">{error}</Alert>}
        {job && !loading && (
          <>
            {/* Timeline */}
            {Array.isArray(job.execution_timeline) && job.execution_timeline.length > 0 && (
              <div>
                <SectionLabel>Timeline</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {job.execution_timeline.map((evt, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, marginTop: 5, flexShrink: 0 }} />
                      <div style={{ fontSize: 12, color: C.textMuted }}>
                        {typeof evt === 'object' ? JSON.stringify(evt) : evt}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Price changes */}
            {Array.isArray(job.price_changes) && job.price_changes.length > 0 && (
              <div>
                <SectionLabel>Changements de prix ({job.price_changes.length})</SectionLabel>
                <Card overflow="hidden">
                  {job.price_changes.slice(0, 20).map((pc, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: i < Math.min(job.price_changes.length, 20) - 1 ? `1px solid ${C.border}` : 'none', fontSize: 12 }}>
                      <span style={{ color: C.textMuted, fontFamily: 'monospace' }}>{pc.product_id || pc.id || JSON.stringify(pc)}</span>
                      {pc.old_price !== undefined && pc.new_price !== undefined && (
                        <span style={{ color: C.text, fontWeight: 600 }}>{pc.old_price} → {pc.new_price}</span>
                      )}
                    </div>
                  ))}
                  {job.price_changes.length > 20 && (
                    <div style={{ padding: '8px 14px', fontSize: 11, color: C.textFaint, textAlign: 'center' }}>
                      +{job.price_changes.length - 20} autres
                    </div>
                  )}
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

const COL = '1fr 140px 120px 100px 60px'

function JobRow({ job, isLast, onView, onDelete, deleting }) {
  const [hov, setHov] = React.useState(false)
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'grid', gridTemplateColumns: COL, padding: '14px 20px', alignItems: 'center',
        borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
        background: hov ? C.surfaceAlt : 'transparent', transition: 'background 0.12s' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{job.job_number || job.id}</div>
        <div style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>ID {job.id}</div>
      </div>
      <div><StatusBadge status={job.status} /></div>
      <div style={{ fontSize: 13, color: C.textMuted }}>{job.total_processed ?? '—'} produits</div>
      <div style={{ fontSize: 12, color: C.textFaint }}>
        {job.created_at ? new Date(job.created_at).toLocaleDateString('fr-FR') : '—'}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <IconButton icon={EyeIcon} onClick={onView} title="Voir le détail" />
        <IconButton icon={TrashIcon} onClick={onDelete} title="Supprimer" variant="danger" disabled={deleting} />
      </div>
    </div>
  )
}

function JobsTable({ jobs, onView, onDelete, deletingId }) {
  return (
    <Card overflow="hidden">
      <div style={{ display: 'grid', gridTemplateColumns: COL, padding: '10px 20px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
        {['Job', 'Statut', 'Produits', 'Créé le', ''].map(h => (
          <span key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
        ))}
      </div>
      {jobs.map((job, i) => (
        <JobRow key={job.id} job={job} isLast={i === jobs.length - 1}
          onView={() => onView(job.id)} onDelete={() => onDelete(job.id)}
          deleting={deletingId === job.id} />
      ))}
    </Card>
  )
}

export default function JobsPage() {
  useRequireAuth()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [detailJobId, setDetailJobId] = useState(null)

  const fetchJobs = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await getJobs()
      setJobs(Array.isArray(data) ? data : (data?.jobs ?? []))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  const stats = jobs.reduce((acc, j) => {
    acc[j.status] = (acc[j.status] || 0) + 1
    return acc
  }, {})

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce job ?')) return
    setDeletingId(id)
    try {
      await deleteJob(id)
      setJobs(prev => prev.filter(j => j.id !== id))
    } catch (e) {
      setError(e.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <Breadcrumb items={[{ label: 'Pricing Workflow' }, { label: 'Jobs', active: true }]} />
      <PageHeader
        title="Jobs de Pricing"
        subtitle="Historique et gestion des calculs de prix exécutés ou planifiés."
        actions={<Button icon={RefreshIcon} onClick={fetchJobs}>Rafraîchir</Button>}
      />

      {Object.keys(stats).length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          {Object.entries(stats).map(([key, val]) => (
            <Card key={key} style={{ padding: '12px 18px', minWidth: 100 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.03em' }}>{val}</div>
              <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'capitalize', marginTop: 2 }}>{key}</div>
            </Card>
          ))}
        </div>
      )}

      {error && <Alert variant="danger" style={{ marginBottom: 20 }}>{error}</Alert>}
      {loading
        ? <PageSpinner message="Chargement des jobs..." />
        : jobs.length === 0
          ? <EmptyState icon={CalIcon} title="Aucun job trouvé" description="Les jobs apparaîtront ici après le lancement d'un pricing workflow." />
          : <JobsTable jobs={jobs} onView={id => setDetailJobId(id)} onDelete={handleDelete} deletingId={deletingId} />
      }

      {detailJobId && <JobDetailModal jobId={detailJobId} onClose={() => setDetailJobId(null)} />}
    </div>
  )
}
