// src/components/ui/tokens.js
// Source unique de vérité JS — valeurs SYNCHRONISÉES avec global.css.
// Les composants React utilisent ces tokens via inline styles.
// Ne JAMAIS hard-coder des couleurs directement dans les composants.

export const C = {
  // Surfaces
  bg:           '#FAFBFF',
  surface:      '#FFFFFF',
  surfaceAlt:   '#F8FAFF',
  border:       '#C5D5EC',
  divider:      'rgba(197,213,236,0.5)',

  // Texte
  text:         '#022448',
  textMuted:    '#6B7280',
  textFaint:    '#8AA4CF',
  textInverse:  '#FFFFFF',

  // Accent (orange-brun)
  accent:       '#A43C12',
  accentHover:  '#8a3210',
  accentBg:     '#E8EFFA',

  // Primaire (navy)
  primary:      '#1E3A5F',
  primaryLight: '#2A5298',

  // États sémantiques
  success: { bg: '#F0FDF4', text: '#166534', border: '#86EFAC' },
  info:    { bg: '#EFF6FF', text: '#1D4ED8', border: '#93C5FD' },
  danger:  { bg: '#FEF2F2', text: '#dc2626', border: '#FECACA' },
  warning: { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
  neutral: { bg: '#F4F7FF', text: '#1E3A5F', border: '#8AA4CF' },
};

// Border-radius en px (pour inline styles)
export const R = {
  xs:   4,
  sm:   7,
  md:   9,
  lg:   12,
  xl:   16,
  xxl:  18,
  full: 9999,
};

// Ombres
export const S = {
  card:   '0 1px 4px rgba(0,0,0,0.04)',
  md:     '0 4px 16px rgba(0,0,0,0.08)',
  lg:     '0 16px 48px rgba(0,0,0,0.12)',
  modal:  '0 24px 64px rgba(0,0,0,0.20)',
  button: '0 4px 16px rgba(164,60,18,0.28)',
};

// Typographie — tailles en rem synchronisées avec global.css
export const T = {
  xs:   '0.6875rem',  // 11px
  sm:   '0.8125rem',  // 13px
  base: '0.875rem',   // 14px
  md:   '0.9375rem',  // 15px
  lg:   '1.125rem',   // 18px
  xl:   '1.375rem',   // 22px
  '2xl':'1.75rem',    // 28px
};

// Familles de polices
export const F = {
  display: "'Sora', sans-serif",
  body:    "'Inter', sans-serif",
};

// Statuts de jobs
export const STATUS = {
  completed: { bg: '#F0FDF4', color: '#166534', border: '#86EFAC', label: 'Completed' },
  running:   { bg: '#EFF6FF', color: '#1D4ED8', border: '#93C5FD', label: 'Running'   },
  failed:    { bg: '#FEF2F2', color: '#dc2626', border: '#FECACA', label: 'Failed'    },
  pending:   { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', label: 'Pending'   },
  scheduled: { bg: '#F4F7FF', color: '#1E3A5F', border: '#8AA4CF', label: 'Scheduled' },
};