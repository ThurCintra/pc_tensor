import React from 'react';
import { 
  Trophy, 
  X, 
  Clock, 
  Flame, 
  Cpu, 
  Zap, 
  HardDrive, 
  AlertTriangle, 
  CheckCircle2, 
  Download 
} from 'lucide-react';

export function SessionReportModal({ report, onClose }) {
  if (!report) return null;

  const durationMin = report.durationSeconds ? (report.durationSeconds / 60).toFixed(1) : '0';
  const cpuAvg = report.cpu?.avgTemp ? report.cpu.avgTemp.toFixed(1) : '--';
  const cpuPeak = report.cpu?.peakTemp ? report.cpu.peakTemp.toFixed(1) : '--';
  const gpuAvg = report.gpu?.avgTemp ? report.gpu.avgTemp.toFixed(1) : '--';
  const gpuPeak = report.gpu?.peakTemp ? report.gpu.peakTemp.toFixed(1) : '--';
  const ramPeakGb = report.memory?.peakRamGB ? report.memory.peakRamGB.toFixed(1) : '--';
  const ramPeakPercent = report.memory?.peakRamPercent ? report.memory.peakRamPercent.toFixed(0) : '--';
  const throttles = report.throttlingEventsCount || 0;
  const dominantBottleneck = report.dominantBottleneck || 'BALANCED';

  const handleExportJson = () => {
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `pc-sentinel-session-${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e) {
      console.error('Falha ao exportar relatório:', e);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(12, 14, 18, 0.85)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '540px',
          maxHeight: '90vh',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--border-radius-card)',
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-hairline)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-inset)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--border-radius-sm)',
                background: 'var(--bg-chip)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-nominal)',
              }}
            >
              <Trophy size={16} />
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Relatório de Sessão
              </div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Diagnóstico Térmico e de Carga
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid var(--border-hairline)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: 'var(--border-radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Corpo do Relatório */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Duração & Gargalo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
            <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--border-radius-sm)', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                <Clock size={12} /> Duração da Carga
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {durationMin} <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>min</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--border-radius-sm)', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                <Zap size={12} /> Balanço de Hardware
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '6px' }}>
                {dominantBottleneck}
              </div>
            </div>
          </div>

          {/* Temperaturas de CPU e GPU */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
            {/* CPU */}
            <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--border-radius-sm)', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                <Cpu size={12} /> CPU (Média / Pico)
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)' }}>{cpuAvg}°C</span>
                <span style={{ fontSize: '0.82rem', color: Number(cpuPeak) > 80 ? 'var(--color-critical)' : 'var(--text-secondary)' }}>
                  Pico {cpuPeak}°C
                </span>
              </div>
            </div>

            {/* GPU */}
            <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--border-radius-sm)', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                <Flame size={12} /> GPU (Média / Pico)
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)' }}>{gpuAvg}°C</span>
                <span style={{ fontSize: '0.82rem', color: Number(gpuPeak) > 80 ? 'var(--color-critical)' : 'var(--text-secondary)' }}>
                  Pico {gpuPeak}°C
                </span>
              </div>
            </div>
          </div>

          {/* RAM e Throttling */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
            <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--border-radius-sm)', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                <HardDrive size={12} /> Pico de RAM
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {ramPeakGb} GB <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>({ramPeakPercent}%)</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--border-radius-sm)', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                <AlertTriangle size={12} color={throttles > 0 ? 'var(--color-critical)' : 'var(--color-nominal)'} /> Estrangulamento Térmico
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 600, color: throttles > 0 ? 'var(--color-critical)' : 'var(--color-nominal)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {throttles > 0 ? `${throttles} ocorrências registradas` : 'Nenhuma ocorrência'}
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé com Ações */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-hairline)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
            background: 'var(--bg-inset)',
            flexShrink: 0,
          }}
        >
          <button
            onClick={handleExportJson}
            className="btn-instrument"
          >
            <Download size={13} /> Exportar JSON
          </button>

          <button
            onClick={onClose}
            className="btn-instrument active"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
