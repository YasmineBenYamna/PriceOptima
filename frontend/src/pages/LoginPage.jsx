// src/pages/LoginPage.jsx
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register } from '../api/api.js'
import { C, R, F, Button, Field, Alert, Logo } from '../components/ui/index.js'

export default function LoginPage() {
  const navigate = useNavigate()
  const [tab, setTab]       = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  const [loginForm, setLoginForm] = useState({ work_mail: '', password: '' })
  const [regForm,   setRegForm]   = useState({ full_name: '', work_mail: '', company_name: '', password: '' })

  const setLF = k => e => setLoginForm(p => ({ ...p, [k]: e.target.value }))
  const setRF = k => e => setRegForm(p => ({ ...p, [k]: e.target.value }))

  const handleLogin = async () => {
    if (!loginForm.work_mail || !loginForm.password) { setError('Email et mot de passe requis.'); return }
    setLoading(true); setError(null)
    try {
      const data = await login({ work_mail: loginForm.work_mail, password: loginForm.password })
      if (data?.user)         localStorage.setItem('currentuser',  JSON.stringify(data.user))
      if (data?.access_token) {
        localStorage.setItem('accesstoken',  data.access_token)
        localStorage.setItem('access_token', data.access_token)
      }
      navigate('/pricing-rules/scope', { replace: true })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    if (!regForm.full_name || !regForm.work_mail || !regForm.company_name || !regForm.password) {
      setError('Tous les champs sont requis.'); return
    }
    if (regForm.password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return }
    setLoading(true); setError(null)
    try {
      const data = await register({
        full_name:    regForm.full_name,
        work_mail:    regForm.work_mail,
        company_name: regForm.company_name,
        password:     regForm.password,
      })
      if (data?.access_token) {
        localStorage.setItem('accesstoken',  data.access_token)
        localStorage.setItem('access_token', data.access_token)
      }
      if (data?.user) localStorage.setItem('currentuser', JSON.stringify(data.user))
      navigate('/pricing-rules/scope', { replace: true })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = fn => e => { if (e.key === 'Enter') fn() }

  return (
    <div style={{
      minHeight:       '100vh',
      background:      C.bg,
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      padding:         20,
      fontFamily:      F.body,
    }}>
      {/* Décoration fond */}
      <div style={{
        position:      'fixed',
        inset:         0,
        background:    'radial-gradient(ellipse 60% 50% at 70% 20%, rgba(164,60,18,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width:        '100%',
        maxWidth:     420,
        background:   C.surface,
        borderRadius: R.xxl,
        border:       `1px solid ${C.border}`,
        boxShadow:    '0 8px 40px rgba(2,36,72,0.10)',
        overflow:     'hidden',
        position:     'relative',
      }}>

        {/* Header */}
        <div style={{ padding: '28px 32px 24px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ marginBottom: 16 }}><Logo size="md" /></div>
          <h1 style={{
            fontFamily:    F.display,
            fontSize:      20,
            fontWeight:    800,
            color:         C.text,
            margin:        '0 0 4px',
            letterSpacing: '-0.03em',
            lineHeight:    1.15,
          }}>
            {tab === 'login' ? 'Connexion' : 'Créer un compte'}
          </h1>
          <p style={{ fontSize: 13, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>
            {tab === 'login'
              ? 'Accédez à votre espace de gestion des stratégies de prix.'
              : "Rejoignez PriceOptima et optimisez vos prix dès aujourd'hui."}
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
          {[{ key: 'login', label: 'Connexion' }, { key: 'register', label: 'Inscription' }].map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setError(null) }}
              style={{
                flex:        1,
                padding:     '12px 0',
                border:      'none',
                background:  'transparent',
                fontFamily:  F.body,
                fontSize:    13,
                fontWeight:  tab === t.key ? 700 : 400,
                color:       tab === t.key ? C.accent : C.textMuted,
                cursor:      'pointer',
                borderBottom:tab === t.key ? `2px solid ${C.accent}` : '2px solid transparent',
                marginBottom:-1,
                transition:  'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Formulaire */}
        <div style={{ padding: '24px 32px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <Alert variant="danger">{error}</Alert>}

          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            onKeyDown={handleKey(tab === 'login' ? handleLogin : handleRegister)}
          >
            {tab === 'register' && (
              <>
                <Field label="Nom complet"           value={regForm.full_name}    onChange={setRF('full_name')}    placeholder="Yasmine Ben Yamna"  autoComplete="name" />
                <Field label="Email professionnel"   type="email" value={regForm.work_mail}    onChange={setRF('work_mail')}    placeholder="vous@entreprise.com" autoComplete="email" />
                <Field label="Entreprise"            value={regForm.company_name} onChange={setRF('company_name')} placeholder="RetailLab"          autoComplete="organization" />
              </>
            )}

            {tab === 'login' && (
              <Field label="Email professionnel" type="email" value={loginForm.work_mail} onChange={setLF('work_mail')}
                placeholder="vous@entreprise.com" autoComplete="email" />
            )}

            <Field
              label="Mot de passe" type="password"
              value={tab === 'login' ? loginForm.password : regForm.password}
              onChange={tab === 'login' ? setLF('password') : setRF('password')}
              placeholder="Min. 8 caractères"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          <Button variant="primary" size="lg" loading={loading}
            onClick={tab === 'login' ? handleLogin : handleRegister}
            style={{ marginTop: 4, width: '100%' }}>
            {tab === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </Button>
        </div>
      </div>
    </div>
  )
}