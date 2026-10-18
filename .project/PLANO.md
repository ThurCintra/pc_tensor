# Plano de Implementação Atômico: PC Sentinel

## Legenda de Status
- [ ] Pendente
- [/] Em Andamento
- [x] Concluído e Testado

---

## Fase 1: Arquitetura Base e Setup do Projeto
- [x] Tarefa 1.1: Criar diretórios base e documentação mestre universal.
  - **Verificação:** Diretórios `.github/`, `.project/`, `docs/`, `.vscode/`, `src/`, `tests/` configurados.
- [x] Tarefa 1.2: Concluir entrevista de requisitos e consolidar `.project/IDEIA.md`.
  - **Verificação:** Stack Electron + React + MongoDB e transmissão móvel ao vivo documentados.
- [x] Tarefa 1.3: Inicializar `package.json`, scripts de desenvolvimento e dependências (`electron`, `react`, `react-dom`, `vite`, `systeminformation`, `ws`, `qrcode`, `mongodb`, `vitest`).
  - **Verificação:** `npm install` concluído com sucesso e Vitest configurado.
- [x] Tarefa 1.4: Configurar estrutura de pastas em `src/` (main, preload, renderer, server).
  - **Verificação:** Arquivos de entrada criados e build do Vite passando sem erros (`npm run build`).

## Fase 2: Módulo de Telemetria de Hardware & Temperaturas (TDD)
- [x] Tarefa 2.1: Implementar serviço coletor de métricas (`src/main/collector.js`) focado em CPU, GPU, RAM, Discos e Temperaturas.
  - **Verificação:** Testes unitários com Vitest em `tests/unit/collector.test.js` passando (GREEN).
- [x] Tarefa 2.2: Criar canal IPC seguro no Electron (`src/main/main.js` e `src/preload/preload.js`).
  - **Verificação:** Bridge seguro `sentinelAPI` com `contextIsolation: true`.

## Fase 3: Servidor Mobile Live & Transmissão ao Vivo de Temperatura
- [x] Tarefa 3.1: Criar servidor local HTTP e WebSocket (`src/server/mobile-server.js`) que faz broadcast de métricas térmicas e recursos para dispositivos móveis conectados.
  - **Verificação:** Teste automatizado de conexão e recebimento de broadcast via WebSocket em `tests/unit/mobile-server.test.js` passando (GREEN).
- [x] Tarefa 3.2: Criar página Web responsiva para o celular (`src/server/public/index.html`) exibindo medidores de temperatura em tempo real, estado da CPU/GPU, histórico gráfico em canvas e alertas visuais.
  - **Verificação:** Carregamento mobile e WebSocket integrados.
- [x] Tarefa 3.3: Gerar QR Code na tela principal do Electron contendo o endereço IP local da máquina (`http://<IP_LOCAL>:3890`) para conexão de 1 clique com a câmera do smartphone.
  - **Verificação:** Detecção automática de IP da máquina e geração do QR Code com o pacote `qrcode`.

## Fase 4: Dashboard Desktop em React (Interface Principal)
- [x] Tarefa 4.1: Criar componentes e design do dashboard Desktop (Tema escuro/cyber-sentinel, visual de telemetria de alta performance).
  - **Verificação:** Renderização fluida da janela e build estático gerado em `dist/`.
- [x] Tarefa 4.2: Integrar medidores de temperatura da CPU/GPU, uso de memória, discos e aba dedicada com QR Code para pareamento.
  - **Verificação:** Navegação funcional entre Dashboard e tela de QR Code.

## Fase 5: Persistência MongoDB e Alertas
- [ ] Tarefa 5.1: Criar serviço de persistência de picos térmicos e histórico de telemetria no MongoDB com resiliência para modo offline.
  - **Verificação:** Testes unitários de persistência e fallback sem travar a aplicação.
- [ ] Tarefa 5.2: Disparo de alertas no Desktop e no celular quando a temperatura da CPU/GPU ultrapassar limites críticos definidos pelo usuário.
  - **Verificação:** Notificação ativada ao simular limiar crítico.

## Fase 6: Empacotamento Desktop e Testes Finais
- [ ] Tarefa 6.1: Configurar build e empacotamento com `electron-builder` para Windows.
  - **Verificação:** Geração e validação de binário executável `.exe`.
