import React, { useEffect, useState } from 'react';
import { Bell, Power, Radio, Zap, Save, Check, AlertTriangle } from 'lucide-react';
import { BentoCard } from '../ui/BentoCard';

const inputStyle = {
  background: 'var(--bg-inset)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--border-radius-sm)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.82rem',
  padding: '6px 8px',
  width: '96px',
};

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: 'var(--border-radius-sm)',
          background: 'var(--bg-inset)',
          border: '1px solid var(--border-hairline)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-accent)',
          flexShrink: 0,
        }}
      >
        <Icon size={15} />
      </div>
      <div>
        <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{subtitle}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '8px 0',
        borderTop: '1px solid var(--border-hairline)',
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
      }}
    >
      <span>
        {label}
        {hint && <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/**
 * Preferências persistentes do PC Sentinel (salvas em %APPDATA% pelo processo principal).
 * Disponível apenas no app desktop: no navegador não há acesso ao IPC.
 */
export function SettingsPanel({ onServerInfoChange }) {
  const api = typeof window !== 'undefined' ? window.sentinelAPI : null;
  const [draft, setDraft] = useState(null);
  const [boostText, setBoostText] = useState('');
  const [status, setStatus] = useState({ type: 'idle', message: '' });

  useEffect(() => {
    if (!api?.getSettings) return;
    api.getSettings().then((settings) => {
      setDraft(settings);
      setBoostText((settings.boostTargets || []).join('\n'));
    });
  }, [api]);

  if (!api?.getSettings) {
    return (
      <BentoCard style={{ maxWidth: '680px', margin: '8px auto', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
        As configurações só podem ser alteradas no aplicativo desktop do PC Sentinel.
      </BentoCard>
    );
  }

  if (!draft) {
    return <div style={{ padding: '40px', color: 'var(--text-muted)', textAlign: 'center' }}>Carregando configurações...</div>;
  }

  const setAlert = (key, value) => setDraft((d) => ({ ...d, alerts: { ...d.alerts, [key]: value } }));

  const handleSave = async () => {
    setStatus({ type: 'saving', message: 'Salvando...' });
    try {
      const saved = await api.updateSettings({
        alerts: {
          enabled: draft.alerts.enabled,
          cpuTempC: Number(draft.alerts.cpuTempC),
          gpuTempC: Number(draft.alerts.gpuTempC),
          cooldownMinutes: Number(draft.alerts.cooldownMinutes),
        },
        mobilePort: Number(draft.mobilePort),
        boostTargets: boostText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
        autoLaunch: draft.autoLaunch?.supported ? Boolean(draft.autoLaunch.enabled) : undefined,
      });
      // O processo principal ajusta valores fora dos limites; mostra o que foi realmente salvo
      setDraft(saved);
      setBoostText((saved.boostTargets || []).join('\n'));
      if (saved.serverInfo && onServerInfoChange) onServerInfoChange(saved.serverInfo);
      setStatus({ type: 'ok', message: 'Configurações salvas.' });
    } catch (err) {
      setStatus({ type: 'error', message: `Falha ao salvar: ${err.message}` });
    }
  };

  return (
    <div style={{ maxWidth: '760px', margin: '8px auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <BentoCard style={{ padding: '18px 20px' }}>
        <SectionTitle icon={Bell} title="Alertas térmicos" subtitle="Notificação do Windows e alerta no celular ao ultrapassar o limite" />
        <Field label="Alertas ativados">
          <input
            type="checkbox"
            checked={draft.alerts.enabled}
            onChange={(e) => setAlert('enabled', e.target.checked)}
          />
        </Field>
        <Field label="Limite da CPU (°C)" hint="Entre 50 e 105 °C">
          <input type="number" min={50} max={105} style={inputStyle} value={draft.alerts.cpuTempC}
            onChange={(e) => setAlert('cpuTempC', e.target.value)} />
        </Field>
        <Field label="Limite da GPU (°C)" hint="Entre 50 e 105 °C">
          <input type="number" min={50} max={105} style={inputStyle} value={draft.alerts.gpuTempC}
            onChange={(e) => setAlert('gpuTempC', e.target.value)} />
        </Field>
        <Field label="Intervalo mínimo entre avisos (min)" hint="Evita notificações repetidas durante a mesma sessão">
          <input type="number" min={1} max={120} style={inputStyle} value={draft.alerts.cooldownMinutes}
            onChange={(e) => setAlert('cooldownMinutes', e.target.value)} />
        </Field>
      </BentoCard>

      <BentoCard style={{ padding: '18px 20px' }}>
        <SectionTitle icon={Power} title="Sistema" subtitle="Comportamento do aplicativo no Windows" />
        <Field
          label="Iniciar com o Windows"
          hint={draft.autoLaunch?.supported ? 'Abre minimizado na bandeja ao entrar no Windows' : 'Disponível apenas no aplicativo instalado'}
        >
          <input
            type="checkbox"
            disabled={!draft.autoLaunch?.supported}
            checked={Boolean(draft.autoLaunch?.enabled)}
            onChange={(e) => setDraft((d) => ({ ...d, autoLaunch: { ...d.autoLaunch, enabled: e.target.checked } }))}
          />
        </Field>
      </BentoCard>

      <BentoCard style={{ padding: '18px 20px' }}>
        <SectionTitle icon={Radio} title="Transmissão remota" subtitle="Servidor local acessado pelo celular" />
        <Field label="Porta do servidor" hint="Trocar a porta reinicia o servidor; libere-a no firewall se necessário">
          <input type="number" min={1024} max={65530} style={inputStyle} value={draft.mobilePort}
            onChange={(e) => setDraft((d) => ({ ...d, mobilePort: e.target.value }))} />
        </Field>
      </BentoCard>

      <BentoCard style={{ padding: '18px 20px' }}>
        <SectionTitle icon={Zap} title="Modo Boost" subtitle="Apps encerrados ao liberar RAM (um executável por linha)" />
        <textarea
          value={boostText}
          onChange={(e) => setBoostText(e.target.value)}
          rows={6}
          spellCheck={false}
          style={{ ...inputStyle, width: '100%', resize: 'vertical', lineHeight: 1.5 }}
        />
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '6px' }}>
          Somente nomes como <code>Discord.exe</code>; curingas e processos do sistema são ignorados.
        </div>
      </BentoCard>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
        {status.message && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.76rem',
              color: status.type === 'error' ? 'var(--color-critical)' : status.type === 'ok' ? 'var(--color-nominal)' : 'var(--text-muted)',
            }}
          >
            {status.type === 'ok' && <Check size={13} />}
            {status.type === 'error' && <AlertTriangle size={13} />}
            {status.message}
          </span>
        )}
        <button className="btn-instrument active" onClick={handleSave} disabled={status.type === 'saving'}>
          <Save size={13} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
          Salvar configurações
        </button>
      </div>
    </div>
  );
}
