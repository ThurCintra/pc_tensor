import { useState } from 'react';
import { ShieldCheck } from '@phosphor-icons/react';
import { PageHeader, Card, InfoBar, EmptyState } from '../components/ui';
import { Dialog } from '../components/Dialog';
import { ProcessIcon } from '../components/ProcessIcon';
import { useAction } from '../hooks/useAction';
import { fixed } from '../lib/format';

export function Processes({ metrics }) {
  const processes = metrics?.processes || [];
  const { run, busy, result, clearResult } = useAction();
  const [confirm, setConfirm] = useState(null);

  const kill = async () => {
    const proc = confirm;
    setConfirm(null);
    await run('KILL_PROCESS', { pid: proc.pid, processName: proc.name }, proc.pid);
  };

  return (
    <div className="page">
      <PageHeader title="Processos" subtitle="Programas que mais usam processador e memória agora" />

      {result && (
        <InfoBar tone={result.tone} onDismiss={clearResult}>
          {result.message}
        </InfoBar>
      )}

      <Card
        footer={
          <p className="hint cluster">
            <ShieldCheck size={14} aria-hidden />
            Processos essenciais do Windows são protegidos e não podem ser encerrados.
          </p>
        }
      >
        {processes.length === 0 ? (
          <EmptyState>Nenhum processo com consumo relevante no momento.</EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th className="hide-sm">PID</th>
                <th className="num">CPU</th>
                <th className="num">Memória</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {processes.map((p) => (
                <tr key={p.pid}>
                  <td className="name" title={p.name}>
                    <span className="process-name">
                      <ProcessIcon pid={p.pid} />
                      <span>{p.name}</span>
                    </span>
                  </td>
                  <td className="hide-sm faint">{p.pid}</td>
                  <td className="num">{fixed(p.cpuPercent, 1)}%</td>
                  <td className="num">{fixed(p.memoryMB)} MB</td>
                  <td className="num">
                    <button className="btn subtle danger" disabled={busy === p.pid} onClick={() => setConfirm(p)}>
                      Encerrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {confirm && (
        <Dialog
          title={`Encerrar ${confirm.name}?`}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="btn danger-fill" onClick={kill}>
                Encerrar
              </button>
              <button className="btn" onClick={() => setConfirm(null)}>
                Cancelar
              </button>
            </>
          }
        >
          <p className="muted">
            O processo (PID {confirm.pid}) será fechado imediatamente. Trabalho não salvo nesse programa será perdido.
          </p>
        </Dialog>
      )}
    </div>
  );
}
