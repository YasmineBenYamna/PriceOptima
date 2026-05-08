// src/components/ui/EmptyState.jsx
import React from 'react';
import { C, R } from './tokens.js';

/**
 * État vide générique.
 *
 * Exemple :
 *   <EmptyState
 *     icon={<CalIcon />}
 *     title="Aucun job trouvé"
 *     description="Les jobs apparaîtront ici après le lancement d'un pricing workflow."
 *   />
 */
export function EmptyState({ icon, title, description }) {
  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        '64px 20px',
      background:     C.surface,
      border:         `1.5px dashed ${C.border}`,
      borderRadius:   R.xl,
      textAlign:      'center',
      gap:            14,
    }}>
      {icon && (
        <div style={{
          width:          56,
          height:         56,
          borderRadius:   R.xl,
          background:     C.accentBg,
          color:          C.accent,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}>
          {icon}
        </div>
      )}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>
          {title}
        </div>
        {description && (
          <div style={{ fontSize: 13, color: C.textMuted, maxWidth: 340, lineHeight: 1.6 }}>
            {description}
          </div>
        )}
      </div>
    </div>
  );
}