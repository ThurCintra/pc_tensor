import { Info, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react';
import { isNum } from '../lib/format';

export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="btn-group">{children}</div>}
    </header>
  );
}

export function Card({ title, icon: Icon, action, children, className = '', style }) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || action) && (
        <div className="card-header">
          <div className="card-title">
            {Icon && <Icon size={16} />}
            {title}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Meter({ value, level = 'normal', label }) {
  const pct = isNum(value) ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div
      className={`meter ${level === 'normal' || level === 'none' ? '' : level}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={isNum(value) ? Math.round(value) : undefined}
      aria-label={label}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Badge({ tone, dot = false, children }) {
  return (
    <span className={`badge ${tone || ''}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

const INFOBAR_ICONS = { info: Info, caution: AlertTriangle, critical: XCircle, success: CheckCircle2 };

export function InfoBar({ tone = 'info', title, children, actions }) {
  const Icon = INFOBAR_ICONS[tone] || Info;
  return (
    <div className={`infobar ${tone === 'info' ? '' : tone}`} role={tone === 'critical' ? 'alert' : 'status'}>
      <Icon size={16} />
      <div className="infobar-body">
        {title && <span className="infobar-title">{title}</span>}
        {children}
      </div>
      {actions && <div className="infobar-actions">{actions}</div>}
    </div>
  );
}

export function Rows({ children }) {
  return <div className="rows">{children}</div>;
}

export function Row({ label, children }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-value">{children}</span>
    </div>
  );
}

export function Switch({ checked, onChange, disabled, label }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          className={value === opt.value ? 'active' : ''}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>;
}

/** Valor grande de métrica; sem leitura mostra o motivo em vez de um número. */
export function StatValue({ value, unit, digits = 0, emptyText = 'Sem sensor' }) {
  if (!isNum(value)) return <div className="stat-value empty">{emptyText}</div>;
  return (
    <div className="stat-value">
      {value.toFixed(digits)}
      {unit && <small>{unit}</small>}
    </div>
  );
}
