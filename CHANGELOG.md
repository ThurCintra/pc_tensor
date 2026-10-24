# Changelog

Mudanças relevantes do PC Sentinel. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado

- Serviço nativo `PcSentinel.Service` (.NET 10, em `service/`), primeira parte da nova arquitetura descrita em
  `docs/contrato-websocket.md`: WebSocket v2 na porta 3891 com o token de pareamento, previsão de thermal
  throttling (dT/dt por mínimos quadrados em 10 s), detector de degradação térmica com linhas de base no SQLite,
  curva de eficiência do silício, Juiz de Lag (rede × CPU × VRAM), perfis pelo app em foco (Game-Sense),
  taxímetro de energia em kWh e R$ e o comando Stutter Buster (limpa a lista standby e baixa a prioridade de apps
  de segundo plano).
- O app inicia o serviço nativo junto (e ele se encerra com o app); o instalador o inclui com o runtime .NET
  embutido e libera a porta 3891 no firewall.
- Camada de tempo real da interface em TypeScript (`src/renderer/realtime`): cliente do WebSocket v2 com comandos,
  reconexão e detecção de PC travado (2 s sem quadros), caixa preta com os últimos 60 s em buffer circular
  espelhado no IndexedDB do celular e relatórios de travamento, vibração por tipo de alerta durante jogos e o hook
  `useSentinel`. As telas que usam essa camada chegam na próxima etapa.
- TypeScript no projeto: `npm run typecheck`, incluído no `npm run check`.
- Página **Pit Wall** (Etapa 4) com Bento Grid que muda de layout conforme o app em foco no PC (FPS competitivo,
  jogo gráfico, trabalho, uso leve): temperatura com contagem regressiva até o throttling, Juiz de Lag, Raio-X do
  gabinete em SVG com cores pela temperatura, taxímetro de energia em R$ com tarifa editável, Stutter Buster,
  saúde térmica, eficiência do silício e a tela Post-Mortem com a linha do tempo até a queda.
- Tailwind 4 para as telas novas, sem reset de estilos e usando os mesmos tokens de cor do app.
- `PC_SENTINEL_DATA_DIR` roda uma cópia de desenvolvimento ao lado do app instalado.

- Verificação de atualizações sempre que o app abre: a versão nova é baixada em segundo plano e instalada ao
  reiniciar (botão "Reiniciar e atualizar" no aviso ou em Configurações → Atualizações).

### Alterado

- Numeração das versões segue o Versionamento Semântico a partir da 1.0.0: as releases 0.1.0 e 0.2.0 passaram a
  ser 1.0.0 e 1.1.0.

- React 19, Vite 8, ESLint 10 e eslint-plugin-react-hooks 7. O eslint-plugin-react saiu (ainda sem suporte ao
  ESLint 10, que já reconhece os componentes usados no JSX).
- Configurações do Vite e do Vitest em `.mjs`.

### Corrigido

- Com a porta 3890 ocupada por outro programa, o app mostrava "A JavaScript error occurred in the main process"
  (EADDRINUSE) e não abria a janela; agora usa a porta seguinte.
- A página Hardware não dispara mais uma renderização extra ao abrir.
- O filtro de tempo do Histórico usa a amostra mais recente como referência, e não o relógio a cada renderização.

## [1.1.0] - 2026-10-24

### Alterado

- Estrutura do projeto reorganizada: `src/main` dividido em janelas, bandeja, IPC e sistema; telemetria em
  `src/main/telemetry` (ponte de sensores, LibreHardwareMonitor, métricas nativas e inventário de hardware).
- O snapshot simulado saiu do código do app; os testes usam fontes simuladas injetadas no coletor.
- Ponte de sensores: código C# em `native/sensor-bridge/` e executável com as DLLs em `resources/sensor-bridge/`,
  sem os arquivos da interface gráfica do LibreHardwareMonitor (~5 MB a menos no instalador).
- Electron 34 (sem suporte) atualizado para o 44, corrigindo as falhas de segurança conhecidas; Vitest 3 → 4.
  `npm audit` sem vulnerabilidades.
- React e React DOM passam a ser só dependências de build (já vão embutidos na interface compilada).
- A versão exibida na página Hardware vem do `package.json`.

### Adicionado

- ESLint, Prettier e EditorConfig, com `npm run lint`, `npm run format` e `npm run check`.
- Licença MIT, avisos de licença de terceiros, guia de contribuição, política de segurança e modelos de
  issue e pull request.
- Dependabot para dependências npm e GitHub Actions.

### Corrigido

- A página Hardware dizia que havia temperatura de GPU mesmo sem nenhum sensor.
- Os testes gravavam `thermal_history.json` na raiz do projeto.

## [1.0.0] - 2026-10-23

Primeira versão publicada.

- Telemetria em tempo real de CPU, GPU, memória, discos, rede e processos, com temperaturas reais pela ponte
  de sensores (LibreHardwareMonitorLib).
- Histórico térmico, relatório de sessões de carga e alertas de temperatura com notificação do Windows.
- Acesso pelo celular na rede local (PWA) com pareamento por QR Code e token revogável.
- Controles remotos: encerrar processo, plano de energia, Modo Boost e mídia.
- Instalador para Windows com início automático e liberação da porta no firewall.

[Não lançado]: https://github.com/ThurCintra/pc_tensor/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/ThurCintra/pc_tensor/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ThurCintra/pc_tensor/releases/tag/v1.0.0
