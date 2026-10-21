import React from 'react';

/**
 * BentoCard Component
 * Módulo estrutural de precisão com borda hairline e indicador discreto de estado.
 */
export function BentoCard({
  children,
  className = '',
  isCritical = false,
  status = 'stable', // 'stable' | 'nominal' | 'warning' | 'critical'
  style = {},
  ...props
}) {
  const isWarn = status === 'warning';
  const isCrit = isCritical || status === 'critical';

  const statusClass = isCrit 
    ? 'is-critical' 
    : isWarn 
    ? 'is-warning' 
    : '';

  return (
    <div
      className={`bento-card ${statusClass} ${className}`.trim()}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
}
