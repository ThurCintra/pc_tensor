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
        background: 'rgba(5, 7, 15, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.98), rgba(11, 15, 25, 0.98))',
          border: '1px solid rgba(0, 240, 255, 0.35)',
          borderRadius: '16px',
          boxShadow: '0 0 40px rgba(0, 240, 255, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fadeInScale 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header Cyberpunk */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #1F2937',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 240, 255, 0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #FF8A00, #FF2A54)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 12px rgba(255, 138, 0, 0.3)',
              }}
            >
              <Trophy size={20} color="#0B0F19" />
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#00F0FF', letterSpacing: '0.8px', textTransform: 'uppercase', fontWeight: 700 }}>
                BENCHMARK AUTOMÁTICO
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#F3F4F6' }}>
                Relatório de Sessão Térmica
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#9CA3AF',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Corpo do Relatório */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Duração & Gargalo Dominante */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: 'rgba(11, 15, 25, 0.7)', border: '1px solid #1F2937', borderRadius: '10px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#9CA3AF', fontSize: '0.72rem' }}>
                <Clock size={13} color="#00F0FF" /> Duração da Carga
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#F3F4F6', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {durationMin} <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>min</span>
              </div>
            </div>

            <div style={{ background: 'rgba(11, 15, 25, 0.7)', border: '1px solid #1F2937', borderRadius: '10px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#9CA3AF', fontSize: '0.72rem' }}>
                <Zap size={13} color="#FF8A00" /> Gargalo Dominante
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#FF8A00', marginTop: '6px' }}>
                {dominantBottleneck}
              </div>
            </div>
          </div>

          {/* Temperaturas de CPU e GPU */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* CPU */}
            <div style={{ background: 'rgba(11, 15, 25, 0.7)', border: '1px solid #1F2937', borderRadius: '10px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#9CA3AF', fontSize: '0.72rem' }}>
                <Cpu size={13} color="#00F0FF" /> CPU (Média / Pico)
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#00F0FF' }}>{cpuAvg}°C</span>
                <span style={{ fontSize: '0.85rem', color: Number(cpuPeak) > 85 ? '#FF2A54' : '#FF8A00', fontWeight: 600 }}>
                  Pico {cpuPeak}°C
                </span>
              </div>
            </div>

            {/* GPU */}
            <div style={{ background: 'rgba(11, 15, 25, 0.7)', border: '1px solid #1F2937', borderRadius: '10px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#9CA3AF', fontSize: '0.72rem' }}>
                <Flame size={13} color="#A855F7" /> GPU (Média / Pico)
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#A855F7' }}>{gpuAvg}°C</span>
                <span style={{ fontSize: '0.85rem', color: Number(gpuPeak) > 85 ? '#FF2A54' : '#FF8A00', fontWeight: 600 }}>
                  Pico {gpuPeak}°C
                </span>
              </div>
            </div>
          </div>

          {/* RAM Pico e Throttling */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: 'rgba(11, 15, 25, 0.7)', border: '1px solid #1F2937', borderRadius: '10px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#9CA3AF', fontSize: '0.72rem' }}>
                <HardDrive size={13} color="#10B981" /> Pico de RAM
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#F3F4F6', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {ramPeakGb} GB <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>({ramPeakPercent}%)</span>
              </div>
            </div>

            <div style={{ background: 'rgba(11, 15, 25, 0.7)', border: '1px solid #1F2937', borderRadius: '10px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#9CA3AF', fontSize: '0.72rem' }}>
                <AlertTriangle size={13} color={throttles > 0 ? '#FF2A54' : '#10B981'} /> Thermal Throttling
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: throttles > 0 ? '#FF2A54' : '#10B981', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {throttles > 0 ? `${throttles} eventos detectados` : 'Nenhum engasgo'}
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé com Ações */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #1F2937',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px',
            background: 'rgba(11, 15, 25, 0.6)',
          }}
        >
          <button
            onClick={handleExportJson}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'rgba(0, 240, 255, 0.08)',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              color: '#00F0FF',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Download size={14} /> Exportar JSON
          </button>

          <button
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              background: '#00F0FF',
              border: 'none',
              color: '#0B0F19',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
