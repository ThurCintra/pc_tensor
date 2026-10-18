import React, { useRef } from 'react';

/**
 * BentoCard Component
 * Implementa superfície translúcida Dark Cyber-Clean com Radial Spotlight Hover
 * e ambient glow em estado crítico.
 */
export function BentoCard({
  children,
  className = '',
  isCritical = false,
  status = 'stable', // 'stable' | 'warning' | 'critical'
  style = {},
  ...props
}) {
  const cardRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cardRef.current.style.setProperty('--mouse-x', `${x}px`);
    cardRef.current.style.setProperty('--mouse-y', `${y}px`);
  };

  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    cardRef.current.style.setProperty('--mouse-x', `-500px`);
    cardRef.current.style.setProperty('--mouse-y', `-500px`);
  };

  const statusClass = isCritical || status === 'critical' 
    ? 'is-critical' 
    : status === 'warning' 
    ? 'is-warning' 
    : '';

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`bento-card ${statusClass} ${className}`}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
}
