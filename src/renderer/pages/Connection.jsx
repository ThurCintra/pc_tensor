import { useEffect, useState } from 'react';
import { Broadcast, Check, Copy, DeviceMobile, Key } from '@phosphor-icons/react';
import { PageHeader, Card, Rows, Row, Badge, InfoBar, Switch } from '../components/ui';
import { Dialog } from '../components/Dialog';
import { getTransport } from '../lib/transport';

export function Connection() {
  const transport = getTransport();
  const [info, setInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [notice, setNotice] = useState(null);

  // Atualiza a contagem de aparelhos conectados enquanto a página está aberta
  useEffect(() => {
    let alive = true;
    const refresh = () => transport.getServerInfo().then((i) => alive && setInfo(i));
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [transport]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(info.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleServer = async (start) => setInfo(await transport.toggleServer(start));

  const revoke = async () => {
    setConfirmRevoke(false);
    setInfo(await transport.revokeToken());
    setNotice('Novo código gerado. Aparelhos pareados antes foram desconectados.');
  };

  return (
    <div className="page">
      <PageHeader title="Celular" subtitle="Acompanhe e controle o PC pelo navegador do celular, na mesma rede Wi-Fi" />

      {notice && <InfoBar tone="success">{notice}</InfoBar>}

      <div className="grid-2">
        <Card title="Conectar" icon={DeviceMobile}>
          {info?.isRunning ? (
            <div className="stack-center">
              {info.qrCodeDataUrl && (
                <img className="qr" src={info.qrCodeDataUrl} alt="QR Code para conectar o celular" />
              )}
              <p className="muted">Aponte a câmera do celular para o código.</p>
              <button className="btn" onClick={copyLink}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Link copiado' : 'Copiar link'}
              </button>
            </div>
          ) : (
            <p className="muted">A transmissão está desligada. Ligue-a para gerar o código.</p>
          )}
        </Card>

        <Card
          title="Transmissão"
          icon={Broadcast}
          footer={
            <div className="stack-sm">
              <div>
                <button className="btn danger" onClick={() => setConfirmRevoke(true)} disabled={!info}>
                  <Key size={14} /> Desconectar todos os aparelhos
                </button>
              </div>
              <p className="hint">
                Quem tem o link pode encerrar processos e mudar o plano de energia. Compartilhe só com aparelhos seus.
              </p>
            </div>
          }
        >
          <Rows>
            <Row label="Transmitir para o celular">
              <Switch checked={Boolean(info?.isRunning)} onChange={toggleServer} disabled={!info} />
            </Row>
            <Row label="Endereço">{info ? `${info.localIp}:${info.port}` : '…'}</Row>
            <Row label="Aparelhos conectados">
              <Badge tone={info?.connectedClientsCount > 0 ? 'success' : ''} dot>
                {info?.connectedClientsCount ?? 0}
              </Badge>
            </Row>
          </Rows>
        </Card>
      </div>

      {confirmRevoke && (
        <Dialog
          title="Desconectar todos os aparelhos?"
          onClose={() => setConfirmRevoke(false)}
          footer={
            <>
              <button className="btn danger-fill" onClick={revoke}>
                Desconectar
              </button>
              <button className="btn" onClick={() => setConfirmRevoke(false)}>
                Cancelar
              </button>
            </>
          }
        >
          <p className="muted">
            Um novo código será gerado. Os celulares pareados perdem o acesso e precisam ler o QR Code de novo.
          </p>
        </Dialog>
      )}
    </div>
  );
}
