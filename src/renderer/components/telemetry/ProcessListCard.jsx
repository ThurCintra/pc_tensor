import React, { useState } from 'react';
import { BentoCard } from '../ui/BentoCard';
import { Activity, XCircle, HardDrive, ShieldAlert, CheckCircle2 } from 'lucide-react';

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
          setFeedbackMsg({ text: `Encerrado: ${proc.name} (PID ${proc.pid})`, error: false });
        } else {
          setFeedbackMsg({ text: res?.error || `Falha ao encerrar ${proc.name}`, error: true });
        }
      } else if (window.sentinelAPI?.executeAction) {
        const res = await window.sentinelAPI.executeAction('KILL_PROCESS', { pid: proc.pid, processName: proc.name });
        if (res && res.success) {
          setFeedbackMsg({ text: `Encerrado: ${proc.name} (PID ${proc.pid})`, error: false });
        } else {
          setFeedbackMsg({ text: res?.error || `Falha ao encerrar ${proc.name}`, error: true });
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
    <BentoCard className={className} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'rgba(0, 240, 255, 0.08)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Activity size={15} color="#00F0FF" />
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600 }}>
              CONSUMO EM TEMPO REAL
            </div>
            <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#F3F4F6' }}>
              Top 5 Processos
            </div>
          </div>
        </div>

        {feedbackMsg && (
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: feedbackMsg.error ? 'rgba(255, 42, 84, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              border: `1px solid ${feedbackMsg.error ? 'rgba(255, 42, 84, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
              color: feedbackMsg.error ? '#FF2A54' : '#10B981',
            }}
          >
            {feedbackMsg.error ? <ShieldAlert size={12} /> : <CheckCircle2 size={12} />}
            {feedbackMsg.text}
          </span>
        )}
      </div>

      {/* Tabela dos Top 5 Processos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {(!processes || processes.length === 0) ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#6B7280', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
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
                  padding: '7px 10px',
                  borderRadius: '7px',
                  background: 'rgba(11, 15, 25, 0.55)',
                  border: '1px solid #1F2937',
                  transition: 'background 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontFamily: 'var(--font-mono)',
                      color: '#4B5563',
                      minWidth: '14px',
                    }}
                  >
                    {idx + 1}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: '#E5E7EB',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '130px',
                      }}
                      title={proc.name}
                    >
                      {proc.name}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#6B7280', fontFamily: 'var(--font-mono)' }}>
                      PID {proc.pid}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* CPU % */}
                  <div style={{ textAlign: 'right', minWidth: '46px' }}>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        color: proc.cpuPercent > 40 ? '#FF8A00' : '#00F0FF',
                      }}
                    >
                      {cpuVal}%
                    </span>
                    <div style={{ fontSize: '0.6rem', color: '#6B7280' }}>CPU</div>
                  </div>

                  {/* RAM MB */}
                  <div style={{ textAlign: 'right', minWidth: '55px' }}>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        color: proc.memMB > 1500 ? '#FF2A54' : '#9CA3AF',
                      }}
                    >
                      {memMb} MB
                    </span>
                    <div style={{ fontSize: '0.6rem', color: '#6B7280' }}>RAM</div>
                  </div>

                  {/* Botão de Encerramento */}
                  <button
                    onClick={() => handleKill(proc)}
                    disabled={isProtected || isKilling}
                    title={isProtected ? 'Processo crítico do Windows (Protegido)' : `Encerrar ${proc.name}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '4px',
                      cursor: isProtected ? 'not-allowed' : 'pointer',
                      color: isProtected ? '#374151' : isKilling ? '#FF8A00' : '#EF4444',
                      opacity: isProtected ? 0.4 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '4px',
                      transition: 'transform 0.1s ease',
                    }}
                  >
                    <XCircle size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Swap / Arquivo de Paginação */}
      {swapTotal > 0 && (
        <div
          style={{
            marginTop: '4px',
            background: 'rgba(11, 15, 25, 0.4)',
            border: '1px solid #1F2937',
            borderRadius: '8px',
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', color: '#9CA3AF', fontWeight: 600 }}>
              <HardDrive size={12} color="#818CF8" /> Paginação / Swap (Disco)
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: swapPercent > 70 ? '#FF2A54' : swapPercent > 40 ? '#FF8A00' : '#10B981',
              }}
            >
              {swapPercent.toFixed(1)}% ({(swapUsed / 1024).toFixed(1)} / {(swapTotal / 1024).toFixed(1)} GB)
            </span>
          </div>

          <div
            style={{
              width: '100%',
              height: '5px',
              borderRadius: '9999px',
              background: '#1F2937',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, swapPercent))}%`,
                height: '100%',
                background: swapPercent > 70 ? 'linear-gradient(90deg, #FF8A00, #FF2A54)' : 'linear-gradient(90deg, #818CF8, #00F0FF)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      )}
    </BentoCard>
  );
}
