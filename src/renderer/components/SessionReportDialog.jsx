import React from 'react';
import { Dialog } from './Dialog';
import { Rows, Row } from './ui';
import { isNum, DASH } from '../lib/format';

const temps = (part) => (isNum(part?.peakTemp) ? `${part.peakTemp} °C (média ${part.avgTemp} °C)` : DASH);

export function SessionReportDialog({ report, onClose }) {
  return (
    <Dialog title="Sessão de carga encerrada" onClose={onClose} footer={<button className="btn accent" onClick={onClose}>Fechar</button>}>
      <p className="muted" style={{ marginTop: 0 }}>Resumo do período em que o PC ficou sob carga alta.</p>
      <Rows>
        <Row label="Duração">{report.durationFormatted}</Row>
        <Row label="Pico da CPU">{temps(report.cpu)}</Row>
        <Row label="Pico da GPU">{temps(report.gpu)}</Row>
        <Row label="Uso médio da CPU">{isNum(report.cpu?.avgLoad) ? `${report.cpu.avgLoad}%` : DASH}</Row>
        <Row label="Memória (pico)">{isNum(report.ram?.peakUsedGB) ? `${report.ram.peakUsedGB} GB` : DASH}</Row>
        <Row label="Gargalo predominante">{report.bottleneckDominant || DASH}</Row>
      </Rows>
    </Dialog>
  );
}
