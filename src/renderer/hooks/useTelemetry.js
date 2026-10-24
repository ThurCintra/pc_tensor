import { useEffect, useState } from 'react';
import { getTransport } from '../lib/transport';
import { isNum } from '../lib/format';

// ~18 minutos de amostras com o loop de 1,2 s do processo principal
const MAX_HISTORY = 900;

function toSample(m) {
  return {
    t: m.timestamp || Date.now(),
    cpuTemp: isNum(m.temperatures?.cpuMain) ? m.temperatures.cpuMain : null,
    gpuTemp: isNum(m.temperatures?.gpu) ? m.temperatures.gpu : null,
    cpuLoad: isNum(m.cpu?.loadPercent) ? m.cpu.loadPercent : null,
    ramPercent: isNum(m.memory?.percentUsed) ? m.memory.percentUsed : null,
  };
}

/**
 * Estado ao vivo da telemetria: último snapshot, histórico da sessão, picos reais,
 * status da conexão e o último relatório de sessão térmica.
 */
export function useTelemetry() {
  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState('connecting');
  const [sessionReport, setSessionReport] = useState(null);

  useEffect(() => {
    const transport = getTransport();

    const unsubMetrics = transport.subscribeMetrics((data) => {
      setMetrics(data);
      setHistory((prev) => {
        const next = prev.length >= MAX_HISTORY ? prev.slice(prev.length - MAX_HISTORY + 1) : prev.slice();
        next.push(toSample(data));
        return next;
      });
    });
    const unsubReport = transport.subscribeSessionReport(setSessionReport);
    const unsubStatus = transport.subscribeStatus(setStatus);

    return () => {
      unsubMetrics();
      unsubReport();
      unsubStatus();
    };
  }, []);

  return {
    metrics,
    history,
    status,
    sessionReport,
    dismissSessionReport: () => setSessionReport(null),
  };
}

export function peakOf(history, key) {
  let peak = null;
  for (const sample of history) {
    if (isNum(sample[key]) && (peak === null || sample[key] > peak)) peak = sample[key];
  }
  return peak;
}
