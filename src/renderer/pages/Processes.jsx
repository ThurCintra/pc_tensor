import { useState } from 'react';
import { X } from 'lucide-react';
import { PageHeader, Card, InfoBar, EmptyState } from '../components/ui';
import { Dialog } from '../components/Dialog';
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
        <InfoBar
          tone={result.tone}
          actions={
            <button className="btn subtle" onClick={clearResult} aria-label="Fechar">
              <X size={14} />
            </button>
          }
        >
          {result.message}
        </InfoBar>
      )}

      <Card>
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
                    {p.name}
                  </td>
                  <td className="hide-sm faint">{p.pid}</td>
                  <td className="num">{fixed(p.cpuPercent, 1)}%</td>
                  <td className="num">{fixed(p.memoryMB)} MB</td>
                  <td className="num">
                    <button className="btn danger" disabled={busy === p.pid} onClick={() => setConfirm(p)}>
                      Encerrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        Processos essenciais do Windows são protegidos e não podem ser encerrados.
      </p>

      {confirm && (
        <Dialog
          title={`Encerrar ${confirm.name}?`}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="btn accent" onClick={kill}>
                Encerrar
              </button>
              <button className="btn" onClick={() => setConfirm(null)}>
                Cancelar
              </button>
            </>
          }
        >
          <p className="muted" style={{ margin: 0 }}>
            O processo (PID {confirm.pid}) será fechado imediatamente. Trabalho não salvo nesse programa será perdido.
          </p>
        </Dialog>
      )}
    </div>
  );
}
