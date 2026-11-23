import { useEffect, useState } from 'react';
import { PageHeader, Section, Setting, Switch, InfoBar, Badge } from '../components/ui';
import { getTransport } from '../lib/transport';
import { CloudSection } from '../cloud/CloudSection';
import { UpdatesSection } from './UpdatesSection';

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
        <PageHeader title="Configurações" subtitle="Preferências deste PC" />
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
    <div className="page">
      <PageHeader title="Configurações" subtitle="Preferências deste PC" />
      {error && (
        <InfoBar tone="critical" title="Não foi possível salvar.">
          {error}
        </InfoBar>
      )}

      <Section title="Atualizações">
        <UpdatesSection
          appInfo={appInfo}
          updates={updates}
          checkOnStartup={saved.updates?.checkOnStartup ?? true}
          onCheckOnStartupChange={(checkOnStartup) => save({ updates: { checkOnStartup } })}
        />
      </Section>

      <Section title="Alertas de temperatura">
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
      </Section>

      <Section title="Sistema">
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
      </Section>

      <Section title="pc_tensor Cloud">
        <CloudSection />
      </Section>

      <Section title="Celular">
        <Setting
          title="Porta do servidor"
          description="Trocar reinicia a transmissão; os celulares precisam ler o novo QR Code"
        >
          {numberField('mobilePort', (v) => ({ mobilePort: v }))}
        </Setting>
      </Section>

      <Section title="Modo Boost">
        <Setting
          stacked
          title="Apps fechados ao liberar memória"
          description={
            <>
              Um executável por linha, por exemplo <code>Discord.exe</code>. Processos do sistema são ignorados.
            </>
          }
        >
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
        </Setting>
      </Section>
    </div>
  );
}
