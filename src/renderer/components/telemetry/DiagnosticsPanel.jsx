import React, { useState } from 'react';
import { BentoCard } from '../ui/BentoCard';
import { HardwareSpecsView } from '../hardware/HardwareSpecsView';
import { ProcessListCard } from './ProcessListCard';
import { Cpu, Terminal, ShieldAlert, AlertTriangle, Layers } from 'lucide-react';

export function DiagnosticsPanel({
  metrics,
}) {
  const [activeSubTab, setActiveSubTab] = useState('specs'); // 'specs' | 'processes'

  const processes = metrics?.processes || [];
  const swap = metrics?.swap || { totalMB: 0, usedMB: 0, percentUsed: 0 };
  const degradationAlert = metrics?.degradationAlert;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* Seletor de Sub-visualização */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setActiveSubTab('specs')}
            className={`btn-instrument ${activeSubTab === 'specs' ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Cpu size={14} />
            <span>Inventário de Hardware</span>
          </button>

          <button
            onClick={() => setActiveSubTab('processes')}
            className={`btn-instrument ${activeSubTab === 'processes' ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Terminal size={14} />
            <span>Processos Ativos ({processes.length})</span>
          </button>
        </div>

        {degradationAlert?.hasDegradation && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.74rem',
              color: 'var(--color-critical)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              padding: '4px 10px',
              borderRadius: 'var(--border-radius-sm)',
            }}
          >
            <AlertTriangle size={13} /> Alerta Térmico (+{degradationAlert.delta}°C)
          </span>
        )}
      </div>

      {/* Conteúdo da Sub-aba */}
      {activeSubTab === 'specs' ? (
        <HardwareSpecsView />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
          <ProcessListCard
            processes={processes}
            swap={swap}
            style={{ minHeight: '520px' }}
          />
        </div>
      )}
    </div>
  );
}
