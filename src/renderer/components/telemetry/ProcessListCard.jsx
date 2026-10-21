import React, { useState } from 'react';
import { BentoCard } from '../ui/BentoCard';
import { Activity, X, HardDrive, ShieldAlert, CheckCircle2 } from 'lucide-react';

const PROTECTED_PROCESSES = new Set([
  'system',
  'system idle process',
  'registry',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'services.exe',
  'lsass.exe',
  'svchost.exe',
  'winlogon.exe',
  'explorer.exe',
  'dwm.exe',
  'runtimebroker.exe',
]);

export function ProcessListCard({ processes = [], swap = null, onKillProcess, className = '' }) {
  const [killingPid, setKillingPid] = useState(null);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  const handleKill = async (proc) => {
    if (!proc || !proc.pid) return;
    if (PROTECTED_PROCESSES.has((proc.name || '').toLowerCase())) {
      setFeedbackMsg({ text: `Processo protegido do sistema (${proc.name})`, error: true });
      setTimeout(() => setFeedbackMsg(null), 3000);
      return;
    }

    setKillingPid(proc.pid);
    try {
      if (onKillProcess) {
        const res = await onKillProcess(proc.pid, proc.name);
        if (res && res.success) {
          setFeedbackMsg({ text: `Finalizado: ${proc.name} (PID ${proc.pid})`, error: false });
        } else {
          setFeedbackMsg({ text: res?.error || `Falha ao finalizar ${proc.name}`, error: true });
        }
      } else if (window.sentinelAPI?.executeAction) {
        const res = await window.sentinelAPI.executeAction('KILL_PROCESS', { pid: proc.pid, processName: proc.name });
        if (res && res.success) {
          setFeedbackMsg({ text: `Finalizado: ${proc.name} (PID ${proc.pid})`, error: false });
        } else {
          setFeedbackMsg({ text: res?.error || `Falha ao finalizar ${proc.name}`, error: true });
        }
      }
    } catch (err) {
      setFeedbackMsg({ text: err.message || 'Erro ao finalizar', error: true });
    } finally {
      setKillingPid(null);
      setTimeout(() => setFeedbackMsg(null), 3000);
    }
  };

  const swapTotal = swap?.totalMB || 0;
  const swapUsed = swap?.usedMB || 0;
  const swapPercent = typeof swap?.percentUsed === 'number' ? swap.percentUsed : 0;

  return (
    <BentoCard className={className} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: 'var(--border-radius-sm)',
              background: 'var(--bg-inset)',
              border: '1px solid var(--border-hairline)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <Activity size={14} />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Processos Ativos
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Top 5 por impacto de carga
            </div>
          </div>
        </div>

        {feedbackMsg && (
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: 'var(--border-radius-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'var(--bg-inset)',
              border: `1px solid ${feedbackMsg.error ? 'var(--color-critical)' : 'var(--color-nominal)'}`,
              color: feedbackMsg.error ? 'var(--color-critical)' : 'var(--color-nominal)',
            }}
          >
            {feedbackMsg.error ? <ShieldAlert size={12} /> : <CheckCircle2 size={12} />}
            {feedbackMsg.text}
          </span>
        )}
      </div>

      {/* Lista de Processos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {(!processes || processes.length === 0) ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.74rem', fontFamily: 'var(--font-mono)' }}>
            Nenhum processo monitorado no momento
          </div>
        ) : (
          processes.slice(0, 5).map((proc, idx) => {
            const isProtected = PROTECTED_PROCESSES.has((proc.name || '').toLowerCase());
            const isKilling = killingPid === proc.pid;
            const cpuVal = typeof proc.cpuPercent === 'number' ? proc.cpuPercent.toFixed(1) : '0.0';
            const memMb = typeof proc.memMB === 'number' ? proc.memMB.toFixed(0) : '0';

            return (
              <div
                key={proc.pid || idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: 'var(--border-radius-sm)',
                  background: 'var(--bg-inset)',
                  border: '1px solid var(--border-hairline)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-dim)',
                      minWidth: '12px',
                    }}
                  >
                    {idx + 1}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        fontSize: '0.76rem',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={proc.name}
                    >
                      {proc.name}
                    </span>
                    <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      PID {proc.pid}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  {/* CPU % */}
                  <div style={{ textAlign: 'right', minWidth: '42px' }}>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        fontFamily: 'var(--font-mono)',
                        color: proc.cpuPercent > 40 ? 'var(--color-elevated)' : 'var(--text-primary)',
                      }}
                    >
                      {cpuVal}%
                    </span>
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>CPU</div>
                  </div>

                  {/* RAM MB */}
                  <div style={{ textAlign: 'right', minWidth: '50px' }}>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        fontFamily: 'var(--font-mono)',
                        color: proc.memMB > 1500 ? 'var(--color-critical)' : 'var(--text-secondary)',
                      }}
                    >
                      {memMb} MB
                    </span>
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>RAM</div>
                  </div>

                  {/* Botão de Encerramento */}
                  <button
                    onClick={() => handleKill(proc)}
                    disabled={isProtected || isKilling}
                    title={isProtected ? 'Processo crítico do Windows (Protegido)' : `Encerrar ${proc.name}`}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border-hairline)',
                      padding: '3px',
                      cursor: isProtected ? 'not-allowed' : 'pointer',
                      color: isProtected ? 'var(--text-dim)' : isKilling ? 'var(--color-elevated)' : 'var(--color-critical)',
                      opacity: isProtected ? 0.3 : 0.8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 'var(--border-radius-sm)',
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Paginação / Swap em Disco */}
      {swapTotal > 0 && (
        <div
          style={{
            marginTop: '2px',
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--border-radius-sm)',
            padding: '6px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              <HardDrive size={11} /> Paginação / Swap em Disco
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: swapPercent > 70 
                  ? 'var(--color-critical)' 
                  : swapPercent > 40 
                  ? 'var(--color-elevated)' 
                  : 'var(--text-secondary)',
              }}
            >
              {swapPercent.toFixed(1)}% ({(swapUsed / 1024).toFixed(1)} / {(swapTotal / 1024).toFixed(1)} GB)
            </span>
          </div>

          <div
            style={{
              width: '100%',
              height: '3px',
              borderRadius: '2px',
              background: 'var(--bg-card)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, swapPercent))}%`,
                height: '100%',
                background: swapPercent > 70 ? 'var(--color-critical)' : 'var(--color-nominal)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}
    </BentoCard>
  );
}
