import { useEffect, useState } from 'react';
import { PageHeader, Switch, InfoBar, Badge } from '../components/ui';
import { getTransport } from '../lib/transport';
import { CloudSection } from '../cloud/CloudSection';
import { UpdatesSection } from './UpdatesSection';

function Setting({ title, description, children }) {
  return (
    <div className="setting">
      <div className="setting-text">
        <div>{title}</div>
        {description && <div className="setting-desc">{description}</div>}
      </div>
      {children}
    </div>
  );
}

/**
 * Preferências salvas em %APPDATA%\pc-sentinel\settings.json.
 * Interruptores salvam na hora; campos de texto salvam ao sair do campo
 * (o processo principal ajusta valores fora da faixa e a tela mostra o valor final).
 */
export function Settings({ appInfo, updates, onRelaunchAsAdmin }) {
  const transport = getTransport();
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);

  const apply = (settings) => {
    setSaved(settings);
    setDraft({
      cpuTempC: String(settings.alerts.cpuTempC),
      gpuTempC: String(settings.alerts.gpuTempC),
      cooldownMinutes: String(settings.alerts.cooldownMinutes),
      mobilePort: String(settings.mobilePort),
      boostTargets: (settings.boostTargets || []).join('\n'),
    });
  };

  useEffect(() => {
    transport.getSettings().then(apply);
  }, [transport]);

  const save = async (partial) => {
    try {
      setError(null);
      apply(await transport.updateSettings(partial));
    } catch (err) {
      setError(err.message);
    }
  };

  if (!saved || !draft)
    return (
      <div className="page">
        <PageHeader title="Configurações" />
      </div>
    );

  const numberField = (key, saveAs) => (
    <input
      className="input"
      type="number"
      value={draft[key]}
      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      onBlur={() => save(saveAs(Number(draft[key])))}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <PageHeader title="Configurações" />
      {error && (
        <InfoBar tone="critical" title="Não foi possível salvar.">
          {error}
        </InfoBar>
      )}

      <h2 className="section-title">Atualizações</h2>
      <UpdatesSection
        appInfo={appInfo}
        updates={updates}
        checkOnStartup={saved.updates?.checkOnStartup ?? true}
        onCheckOnStartupChange={(checkOnStartup) => save({ updates: { checkOnStartup } })}
      />

      <h2 className="section-title">Alertas de temperatura</h2>
      <div>
        <Setting
          title="Avisar quando esquentar"
          description="Notificação do Windows, aviso no app e vibração no celular"
        >
          <Switch checked={saved.alerts.enabled} onChange={(enabled) => save({ alerts: { enabled } })} />
        </Setting>
        <Setting title="Limite do processador" description="Em °C, entre 50 e 105">
          {numberField('cpuTempC', (v) => ({ alerts: { cpuTempC: v } }))}
        </Setting>
        <Setting title="Limite da placa de vídeo" description="Em °C, entre 50 e 105">
          {numberField('gpuTempC', (v) => ({ alerts: { gpuTempC: v } }))}
        </Setting>
        <Setting
          title="Intervalo entre avisos"
          description="Minutos mínimos entre duas notificações do mesmo componente"
        >
          {numberField('cooldownMinutes', (v) => ({ alerts: { cooldownMinutes: v } }))}
        </Setting>
      </div>

      <h2 className="section-title">Sistema</h2>
      <div>
        <Setting
          title="Iniciar com o Windows"
          description={
            saved.autoLaunch?.supported ? 'Abre na bandeja ao entrar no Windows' : 'Disponível no app instalado'
          }
        >
          <Switch
            checked={Boolean(saved.autoLaunch?.enabled)}
            disabled={!saved.autoLaunch?.supported}
            onChange={(autoLaunch) => save({ autoLaunch })}
          />
        </Setting>
        <Setting
          title="Privilégio de administrador"
          description="Necessário para ler temperaturas, ventoinhas e criar a regra do firewall"
        >
          {appInfo?.isElevated ? (
            <Badge tone="success" dot>
              Ativo
            </Badge>
          ) : appInfo?.canRelaunchElevated ? (
            <button className="btn" onClick={onRelaunchAsAdmin}>
              Reiniciar como administrador
            </button>
          ) : (
            <Badge tone="caution">Rode o terminal como administrador</Badge>
          )}
        </Setting>
      </div>

      <h2 className="section-title">pc_tensor Cloud</h2>
      <CloudSection />

      <h2 className="section-title">Celular</h2>
      <div>
        <Setting
          title="Porta do servidor"
          description="Trocar reinicia a transmissão; os celulares precisam ler o novo QR Code"
        >
          {numberField('mobilePort', (v) => ({ mobilePort: v }))}
        </Setting>
      </div>

      <h2 className="section-title">Modo Boost</h2>
      <div className="setting" style={{ display: 'block' }}>
        <div style={{ marginBottom: 8 }}>Apps fechados ao liberar memória</div>
        <div className="setting-desc" style={{ marginBottom: 8 }}>
          Um executável por linha, por exemplo <code>Discord.exe</code>. Processos do sistema são ignorados.
        </div>
        <textarea
          className="input"
          rows={6}
          spellCheck={false}
          value={draft.boostTargets}
          onChange={(e) => setDraft({ ...draft, boostTargets: e.target.value })}
          onBlur={() =>
            save({
              boostTargets: draft.boostTargets
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
    </div>
  );
}
