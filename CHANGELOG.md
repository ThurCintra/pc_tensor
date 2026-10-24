# Changelog

Mudanças relevantes do PC Sentinel. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

## [1.2.0] - 2026-10-24

### Adicionado

- **Pit Wall**: nova página (no PC e no celular) que muda de layout conforme o que está aberto no PC — FPS
  competitivo, jogo gráfico pesado, trabalho ou uso leve.
  - Temperatura de CPU e GPU com tendência e contagem regressiva até o limite (throttling).
  - Juiz de Lag: diz se o travamento no jogo é culpa da rede, de um gargalo de CPU ou da memória de vídeo cheia.
  - Raio-X: o gabinete desenhado com cada peça colorida pela temperatura real e as ventoinhas na rotação lida.
  - Taxímetro de energia: quanto a sessão e o mês estão custando em reais, com a tarifa da sua conta.
  - Stutter Buster: um botão que libera o cache de memória do Windows e baixa a prioridade de navegadores e
    launchers por 5 minutos (exige o app aberto como administrador).
  - Saúde térmica: avisa quando o PC esquenta mais que há semanas com o mesmo consumo (poeira ou pasta térmica).
  - Eficiência do silício: MHz por watt e estabilidade da tensão sob carga.
- **Caixa preta**: o celular guarda os últimos 60 segundos de telemetria. Se o PC travar ou der tela azul, abre o
  **Post-Mortem** com a linha do tempo até o milissegundo da queda e os picos de temperatura, potência e VRAM.
- Vibração no celular durante jogos: 2 toques curtos para problema de rede, 3 médios para "vai esquentar" e longa
  para temperatura crítica.
- **Atualização automática**: o app procura versões novas sempre que abre, baixa em segundo plano e instala ao
  reiniciar (aviso "Reiniciar e atualizar" ou Configurações → Atualizações). Vale a partir desta versão.
- Serviço de telemetria nativo (.NET 10), iniciado junto com o app, com histórico em SQLite. O instalador libera
  a porta 3891 no firewall para o celular.

### Alterado

- Versões no padrão de projetos grandes (Versionamento Semântico) a partir da 1.0.0: as antigas 0.1.0 e 0.2.0 são
  a 1.0.0 e a 1.1.0.
- Electron, React 19 e demais dependências atualizados.

### Corrigido

- Com a porta 3890 ocupada por outro programa, o app mostrava "A JavaScript error occurred in the main process" e
  não abria; agora usa a porta seguinte.
- A página Hardware não faz mais uma renderização extra ao abrir.

### Para desenvolvedores

- TypeScript (`npm run typecheck`), Tailwind 4 nas telas novas e configurações do Vite em `.mjs`.
- Contrato do WebSocket v2 em `docs/contrato-websocket.md`; serviço em `service/` com 40 testes xUnit.
- `PC_SENTINEL_DATA_DIR` roda uma cópia de desenvolvimento ao lado do app instalado.

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

[Não lançado]: https://github.com/ThurCintra/pc_tensor/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/ThurCintra/pc_tensor/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ThurCintra/pc_tensor/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ThurCintra/pc_tensor/releases/tag/v1.0.0
