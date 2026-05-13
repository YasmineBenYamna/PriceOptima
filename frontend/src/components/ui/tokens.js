// src/components/ui/tokens.js
// Source unique de vérité — importer depuis ici dans tous les fichiers.
// Ne JAMAIS hard-coder des couleurs ou dimensions directement dans les composants.

export const C = {
  bg:         '#FAFBFF',
  surface:    '#FFFFFF',
  surfaceAlt: '#F8FAFF',
  border:     '#C5D5EC',
  text:       '#022448',
  textMuted:  '#6B7280',
  textFaint:  '#8AA4CF',
  accent:     '#A43C12',
  accentBg:   '#E8EFFA',

  success: { bg: '#F0FDF4', text: '#166534', border: '#86EFAC' },
  info:    { bg: '#EFF6FF', text: '#1D4ED8', border: '#93C5FD' },
  danger:  { bg: '#FEF2F2', text: '#dc2626', border: '#FECACA' },
  warning: { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
  neutral: { bg: '#F4F7FF', text: '#1E3A5F', border: '#8AA4CF' },
};

export const R = { sm: 7, md: 9, lg: 12, xl: 16, xxl: 18 };

export const S = {
  card:   '0 1px 4px rgba(0,0,0,0.04)',
  modal:  '0 24px 64px rgba(0,0,0,0.20)',
  button: '0 4px 16px rgba(164,60,18,0.28)',
};

export const STATUS = {
  completed: { bg: '#F0FDF4', color: '#166534', border: '#86EFAC', label: 'Completed'  },
  running:   { bg: '#EFF6FF', color: '#1D4ED8', border: '#93C5FD', label: 'Running'    },
  failed:    { bg: '#FEF2F2', color: '#dc2626', border: '#FECACA', label: 'Failed'     },
  pending:   { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', label: 'Pending'    },
  scheduled: { bg: '#F4F7FF', color: '#1E3A5F', border: '#8AA4CF', label: 'Scheduled'  },
};
