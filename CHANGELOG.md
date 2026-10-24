# Changelog

Mudanças relevantes do PC Sentinel. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Alterado

- React 19, Vite 8, ESLint 10 e eslint-plugin-react-hooks 7. O eslint-plugin-react saiu (ainda sem suporte ao
  ESLint 10, que já reconhece os componentes usados no JSX).
- Configurações do Vite e do Vitest em `.mjs`.

### Corrigido

- A página Hardware não dispara mais uma renderização extra ao abrir.
- O filtro de tempo do Histórico usa a amostra mais recente como referência, e não o relógio a cada renderização.

## [0.2.0] - 2026-10-24

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

## [0.1.0] - 2026-10-23

Primeira versão publicada.

- Telemetria em tempo real de CPU, GPU, memória, discos, rede e processos, com temperaturas reais pela ponte
  de sensores (LibreHardwareMonitorLib).
- Histórico térmico, relatório de sessões de carga e alertas de temperatura com notificação do Windows.
- Acesso pelo celular na rede local (PWA) com pareamento por QR Code e token revogável.
- Controles remotos: encerrar processo, plano de energia, Modo Boost e mídia.
- Instalador para Windows com início automático e liberação da porta no firewall.

[Não lançado]: https://github.com/ThurCintra/pc_tensor/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ThurCintra/pc_tensor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ThurCintra/pc_tensor/releases/tag/v0.1.0
