// src/components/ui/tokens.js
export const C = {
  bg:           '#F7F5F0',
  surface:      '#FDFCFA',
  surfaceAlt:   '#F2F0EB',
  border:       '#E2DDD6',
  divider:      'rgba(226,221,214,0.5)',

  text:         '#1C1A17',
  textMuted:    '#6B6560',
  textFaint:    '#A09890',
  textInverse:  '#FFFFFF',

  accent:       '#2C3E50',
  accentHover:  '#3D5268',
  accentBg:     '#E8EBF0',

  primary:      '#2C3E50',
  primaryLight: '#3D5268',

  success: { bg: '#EBF0ED', text: '#4A5D52', border: '#C2D0C9' },
  info:    { bg: '#E8EBF0', text: '#2C3E50', border: '#C8D2DE' },
  danger:  { bg: '#F5EDEB', text: '#7A3C2C', border: '#DEC8C2' },
  warning: { bg: '#F3EDE5', text: '#7A5C3A', border: '#D9C8B4' },
  neutral: { bg: '#F2F0EB', text: '#6B6560', border: '#E2DDD6' },
};

export const R = {
  xs:   4,
  sm:   6,
  md:   9,
  lg:   13,
  xl:   18,
  xxl:  22,
  full: 9999,
};

export const S = {
  card:   '0 1px 3px rgba(28,26,23,0.06)',
  md:     '0 4px 14px rgba(28,26,23,0.08)',
  lg:     '0 16px 48px rgba(28,26,23,0.12)',
  modal:  '0 24px 64px rgba(28,26,23,0.18)',
  button: '0 4px 14px rgba(44,62,80,0.22)',
};

export const T = {
  xs:   '0.6875rem',
  sm:   '0.8125rem',
  base: '0.875rem',
  md:   '0.9375rem',
  lg:   '1.125rem',
  xl:   '1.375rem',
  '2xl':'1.75rem',
};

export const F = {
  display: "'DM Serif Display', Georgia, serif",
  body:    "'DM Sans', system-ui, sans-serif",
};

export const STATUS = {
  completed: { bg: '#EBF0ED', color: '#4A5D52', border: '#C2D0C9', label: 'Completed' },
  running:   { bg: '#E8EBF0', color: '#2C3E50', border: '#C8D2DE', label: 'Running'   },
  failed:    { bg: '#F5EDEB', color: '#7A3C2C', border: '#DEC8C2', label: 'Failed'    },
  pending:   { bg: '#F3EDE5', color: '#7A5C3A', border: '#D9C8B4', label: 'Pending'   },
  scheduled: { bg: '#F2F0EB', color: '#6B6560', border: '#E2DDD6', label: 'Scheduled' },
};