import { CheckCircle, Info, Warning, X, XCircle } from '@phosphor-icons/react';
import { isNum } from '../lib/format';

/*
 * Componentes visuais compartilhados. As classes ficam em styles/components.css e styles/layout.css;
 * as telas montam a interface com estes blocos em vez de estilos soltos.
 */

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

/** Grupo com título pequeno (Configurações, Caixa preta do Pit Wall); só texto, sem ícone, no visual limpo. */
export function Section({ title, children }) {
  return (
    <section className="section">
      <h2 className="section-title">{title}</h2>
      <div className="section-body">{children}</div>
    </section>
  );
}

/**
 * Card com cabeçalho (ícone, título e ação) e um rodapé opcional que fica sempre no pé,
 * para que medidores e legendas de cards lado a lado fiquem na mesma altura.
 */
export function Card({ title, icon: Icon, action, footer, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-header">
          <h2 className="card-title">
            {Icon && <Icon size={16} aria-hidden />}
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
      {footer && <div className="card-foot">{footer}</div>}
    </section>
  );
}

/** Linha de configuração: texto à esquerda e o controle à direita (ou embaixo, com `stacked`). */
export function Setting({ title, description, stacked = false, children, as: Tag = 'div', ...rest }) {
  return (
    <Tag className={`setting ${stacked ? 'stacked' : ''}`} {...rest}>
      <div className="setting-text">
        <div>{title}</div>
        {description && <div className="setting-desc">{description}</div>}
      </div>
      {children}
    </Tag>
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

/** Medidor com rótulo e valor em cima. */
export function LabeledMeter({ label, valueText, value, level, ariaLabel, strong = false }) {
  return (
    <div>
      <div className={`meter-label ${strong ? 'strong' : ''}`}>
        <span>{label}</span>
        <span className={`tabular ${strong ? 'muted' : ''}`}>{valueText}</span>
      </div>
      <Meter value={value} level={level} label={ariaLabel} />
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

const INFOBAR_ICONS = { info: Info, caution: Warning, critical: XCircle, success: CheckCircle };

/** Aviso em faixa. Com `onDismiss`, ganha o botão de fechar. */
export function InfoBar({ tone = 'info', title, children, actions, onDismiss }) {
  const Icon = INFOBAR_ICONS[tone] || Info;
  return (
    <div className={`infobar ${tone === 'info' ? '' : tone}`} role={tone === 'critical' ? 'alert' : 'status'}>
      <Icon size={16} aria-hidden />
      <div className="infobar-body">
        {title && <span className="infobar-title">{title}</span>}
        {children}
      </div>
      {(actions || onDismiss) && (
        <div className="infobar-actions">
          {actions}
          {onDismiss && (
            <button className="btn subtle icon" onClick={onDismiss} aria-label="Fechar">
              <X size={14} />
            </button>
          )}
        </div>
      )}
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
