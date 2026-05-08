// src/components/ui/tokens.js
// ─────────────────────────────────────────────────────────────
// Source unique de vérité pour tous les design tokens.
// Ne JAMAIS hard-coder couleurs, rayons ou ombres dans les composants.
// ─────────────────────────────────────────────────────────────

// ── Couleurs ─────────────────────────────────────────────────
export const C = {
  // Fonds
  bg:           '#FAFBFF',
  surface:      '#FFFFFF',
  surfaceAlt:   '#F8FAFF',
  surfaceOffset:'#EEF2FB',    // ex: cards imbriquées, zones grises

  // Bordures & séparateurs
  border:       '#C5D5EC',
  divider:      'rgba(2,36,72,0.07)',

  // Textes
  text:         '#022448',
  textMuted:    '#6B7280',
  textFaint:    '#8AA4CF',
  textInverse:  '#FFFFFF',

  // Accent principal (brique/rouille)
  accent:       '#A43C12',
  accentHover:  '#8a3210',
  accentBg:     '#E8EFFA',

  // Navy (CTA, hero, fond dark)
  navy:         '#022448',
  navyLight:    '#1D4ED8',

  // États sémantiques
  success: { bg: '#F0FDF4', text: '#166534', border: '#86EFAC' },
  info:    { bg: '#EFF6FF', text: '#1D4ED8', border: '#93C5FD' },
  danger:  { bg: '#FEF2F2', text: '#dc2626', border: '#FECACA' },
  warning: { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
  neutral: { bg: '#F4F7FF', text: '#1E3A5F', border: '#8AA4CF' },
};

// ── Rayons ────────────────────────────────────────────────────
export const R = {
  sm:   7,
  md:   9,
  lg:   12,
  xl:   16,
  xxl:  18,
  full: 9999,
};

// ── Ombres ────────────────────────────────────────────────────
export const S = {
  sm:     '0 1px 3px rgba(2,36,72,0.06)',
  md:     '0 4px 16px rgba(2,36,72,0.09)',
  lg:     '0 16px 48px rgba(2,36,72,0.13)',
  card:   '0 1px 4px rgba(0,0,0,0.04)',
  modal:  '0 24px 64px rgba(0,0,0,0.20)',
  button: '0 4px 16px rgba(164,60,18,0.28)',
};

// ── Typographie ───────────────────────────────────────────────
export const F = {
  display: "'Sora', sans-serif",
  body:    "'Inter', sans-serif",

  // Tailles fluides (clamp)
  xs:   'clamp(0.75rem,  0.7rem  + 0.25vw, 0.875rem)',
  sm:   'clamp(0.875rem, 0.8rem  + 0.35vw, 1rem)',
  base: 'clamp(1rem,     0.95rem + 0.25vw, 1.125rem)',
  lg:   'clamp(1.125rem, 1rem    + 0.75vw, 1.5rem)',
  xl:   'clamp(1.5rem,   1.2rem  + 1.25vw, 2.25rem)',
  '2xl':'clamp(2rem,     1.2rem  + 2.5vw,  3.5rem)',
  '3xl':'clamp(2.5rem,   1rem    + 4vw,    4.5rem)',
};

// ── Espacements ───────────────────────────────────────────────
export const SP = {
  1:  '0.25rem',
  2:  '0.5rem',
  3:  '0.75rem',
  4:  '1rem',
  5:  '1.25rem',
  6:  '1.5rem',
  8:  '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
};

// ── Statuts jobs / calculs ────────────────────────────────────
export const STATUS = {
  completed: { bg: '#F0FDF4', color: '#166534', border: '#86EFAC', label: 'Completed'  },
  running:   { bg: '#EFF6FF', color: '#1D4ED8', border: '#93C5FD', label: 'Running'    },
  failed:    { bg: '#FEF2F2', color: '#dc2626', border: '#FECACA', label: 'Failed'     },
  pending:   { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', label: 'Pending'    },
  scheduled: { bg: '#F4F7FF', color: '#1E3A5F', border: '#8AA4CF', label: 'Scheduled'  },
};

// ── Helper : border radius en px → string CSS ─────────────────
export const radius = (key) => `${R[key]}px`;

// ── Helper : gradient navy (hero CTA, logo) ───────────────────
export const GRADIENT_NAVY =
  'linear-gradient(135deg, #022448 0%, #1D4ED8 55%, #A43C12 100%)';

export const GRADIENT_CTA =
  'linear-gradient(135deg, #022448 0%, #0f1e38 100%)';