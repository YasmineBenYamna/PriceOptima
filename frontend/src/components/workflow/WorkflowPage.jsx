import React from 'react';
import { Breadcrumb, Stepper } from '../ui';

export default function WorkflowPage({
  breadcrumbItems,
  title,
  subtitle,
  step,
  children,
  footer,
}) {
  return (
    <div style={{ paddingBottom: footer ? 100 : 24 }}>
      {breadcrumbItems && (
        <div style={{ marginBottom: 8 }}>
          <Breadcrumb items={breadcrumbItems} />
        </div>
      )}

      <h1
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: 'var(--color-text)',
          margin: '0 0 4px',
          letterSpacing: '-0.03em',
        }}
      >
        {title}
      </h1>

      {subtitle && (
        <p
          style={{
            fontSize: 13,
            color: 'var(--color-text-muted)',
            margin: '0 0 24px',
            lineHeight: 1.6,
          }}
        >
          {subtitle}
        </p>
      )}

      {step ? <Stepper step={step} /> : null}

      {children}

      {footer}
    </div>
  );
}