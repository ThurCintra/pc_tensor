# Revisão Estrutural, Telemetria Real e Painéis do PC Sentinel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar todas as simulações e dados falsos do projeto, reorganizar a arquitetura em camadas desacopladas (coleta de hardware, estado/API e interface), integrar telemetria física real do Windows (CPU, GPU, Placa-mãe, NVMe e I/O) com indicação técnica de privilégios de Administrador, e estruturar três painéis especializados com estética autoral de instrumento de laboratório.

**Architecture:** A camada de coleta física é centralizada no executável C# `pc-sensor-bridge.exe` (baseado em `LibreHardwareMonitorLib.dll`, AMD ADL PMLog e PerformanceCounters de disco do Windows) com saída JSON contínua via stdout, indicando se opera como Administrador ou usuário padrão. O backend Node.js (`src/main/collector.js`) consome o streaming sem gerar curvas artificiais (`Math.sin`/`Math.random`), expondo status de sensores, dados térmicos reais e flags de privilégios. O frontend React (`src/renderer/`) consome telemetria via IPC ou WebSocket, sem temporizadores de mock, apresentando três visões dedicadas: Visão Geral em Tempo Real, Linha do Tempo e Detalhamento Técnico de Hardware e Processos.

**Tech Stack:** Electron 35, Node.js (v8/libuv), C# (.NET Framework 4.8 / LibreHardwareMonitorLib 0.9.4 / AMD ADL), React 18, Vite 6, Tailwind/CSS Vanilla Tokens, Vitest 3.

**Spec:** Requisitos do usuário em `<USER_REQUEST>`: eliminação estrita de números simulados, telemetria real de CPU, GPU, Placa-mãe e Discos no Windows, aviso técnico de privilégio de Administrador se ring-0 for restrito, divisão em 3 painéis de monitoramento, redesign autoral (sem clichês de IA) e textos naturais e técnicos em português.

## Global Constraints
- Proibido o uso de `Math.random()`, `Math.sin()` ou curvas simuladas para temperaturas, cargas, velocidades de ventoinha ou taxas de I/O.
- Se um sensor térmico exigir privilégio de Administrador (como registradores MSR de núcleos Zen 5 ou SMART de NVMe), o valor retornado deve ser `null` e a interface deve exibir um aviso técnico objetivo indicando a necessidade de elevação.
- A aplicação deve funcionar tanto no Electron (desktop) quanto via navegador no servidor móvel (`mobile-server.js` / WebSocket).
- Todos os 45 testes automatizados existentes no Vitest devem continuar passando sem regressão.
- Tipografia com `tabular-nums` para dados numéricos em tempo real, sem vibração de layout.
- Todos os rótulos e textos da interface devem seguir a skill `humanizer` (sem jargões vazios, sem clichês de IA e sem hipérboles comerciais).

## Review Focus
- Hardware sem privilégios de Administrador: CPU package/SoC e GPU dedicada continuam sendo lidas via ADL sem travar; NVMe e sensores de chip da placa-mãe informam `requiresElevation: true` sem preencher números falsos.
- Fechamento gracioso do processo `pc-sensor-bridge.exe` ao encerrar ou reiniciar o coletor sem deixar processos zumbis no Windows.
- Buffer de histórico temporal no frontend mantendo amostras reais com carimbo de data/hora e intervalo constante.
- Resiliência na reconexão WebSocket e IPC quando a janela é restaurada ou quando o backend reinicia.
- Exibição de nomes exatos de hardware detectado (ex: "AMD Ryzen 5 9600X", "AMD Radeon RX 7600", "MSI PRO B650M-P", "KINGSTON SNV3S500G") em vez de termos genéricos.

---

### Task 1: Reestruturação do Sensor Bridge C# (`pc-sensor-bridge.cs`)

**Files:**
- Modify: `tools/LibreHardwareMonitor/pc-sensor-bridge.cs`
- Build Output: `tools/LibreHardwareMonitor/pc-sensor-bridge.exe`

**Interfaces:**
- Produces: JSON streaming na saída padrão com estrutura:
  ```json
  {
    "success": true,
    "isAdmin": false,
    "cpu": { "name": "AMD Ryzen 5 9600X", "temp": 51.0, "load": 42.0, "powerWatts": null },
    "gpu": { "name": "AMD Radeon RX 7600", "temp": 70.0, "memoryTemp": 80.0, "hotspotTemp": 79.0, "fanRpm": 830.0, "load": 100.0, "powerWatts": 85.0, "vramUsedMB": 6161.0, "vramTotalMB": 8176.0 },
    "motherboard": { "name": "MSI PRO B650M-P (MS-7E27)", "temp": null, "requiresElevation": true },
    "storage": [
      { "name": "KINGSTON SNV3S500G", "temp": null, "load": 0.0, "requiresElevation": true }
    ],
    "diskIo": { "readBytesSec": 3194475.0, "writeBytesSec": 140245.0 },
    "fanRpm": 830.0,
    "realSensors": { "cpu": true, "gpu": true, "motherboard": false, "storage": false }
  }
  ```

- [ ] **Step 1: Adicionar detecção de Administrador e habilitar subsistemas Motherboard e Storage em `pc-sensor-bridge.cs`**
- [ ] **Step 2: Adicionar leitura de contadores reais de I/O de disco (`PhysicalDisk`) e hardware de armazenamento/placa-mãe**
- [ ] **Step 3: Compilar `pc-sensor-bridge.cs` usando `csc.exe` para arquitetura x64**
- [ ] **Step 4: Executar `pc-sensor-bridge.exe` e validar saída JSON com dados reais da máquina física**

---

### Task 2: Refatoração do Coletor Backend (`src/main/collector.js`)

**Files:**
- Modify: `src/main/collector.js`
- Test: `tests/unit/collector.test.js`

**Interfaces:**
- Consumes: JSON emitido por `pc-sensor-bridge.exe` via stdout.
- Produces: Snapshot enriquecido com:
  - `temperatures`: `{ cpuMain, cpuMax, gpu, gpuHotspot, gpuMemory, motherboard, nvme, isEstimated, requiresElevation }`
  - `diskIo`: `{ readMBps, writeMBps, isReal: true }`
  - `disks`: montagens físicas reais via `fsSize`
  - `hardwareInfo`: marcas e modelos reais da máquina

- [ ] **Step 1: Remover simulações `Math.sin`/`Math.random` de temperatura e taxas de I/O em `collector.js`**
- [ ] **Step 2: Conectar métricas de Motherboard, NVMe, I/O real e status de Administrador oriundos do bridge C#**
- [ ] **Step 3: Garantir fallback seguro para os testes unitários (`mockSi`) sem quebrar nenhum contrato**
- [ ] **Step 4: Executar testes unitários com `npm test` para validar 100% de conformidade**

---

### Task 3: Desacoplamento e Limpeza no Frontend (`src/renderer/App.jsx`)

**Files:**
- Modify: `src/renderer/App.jsx`
- Modify: `src/renderer/index.html`

**Interfaces:**
- Consumes: eventos `sentinelAPI.onMetricsUpdate` (Desktop) ou WebSocket `ws://127.0.0.1:3890` (Web).
- Produces: Estado central de telemetria sem temporizador de mock (`Math.random`).

- [ ] **Step 1: Eliminar o `mockTimer` e lista de processos falsos (`Cyberpunk2077.exe`) de `App.jsx`**
- [ ] **Step 2: Adicionar indicador técnico de privilégios de Administrador no cabeçalho**
- [ ] **Step 3: Organizar a navegação entre os 3 painéis: Visão Geral, Histórico Temporal e Diagnóstico Técnico**
- [ ] **Step 4: Validar renderização e compilação do Vite (`npm run build`)**

---

### Task 4: Implementação dos Três Painéis Especializados

**Files:**
- Modify/Create: `src/renderer/components/telemetry/OverviewPanel.jsx` (Visão Geral em Tempo Real)
- Modify/Create: `src/renderer/components/telemetry/HistoryTimelinePanel.jsx` (Histórico e Gráficos Temporais)
- Modify/Create: `src/renderer/components/telemetry/DiagnosticsPanel.jsx` (Detalhamento Técnico de Componentes e Processos)
- Modify: `src/renderer/components/hardware/HardwareSpecsView.jsx`

**Interfaces:**
- Consumes: Objeto `metrics` com dados físicos reais.
- Produces:
  - Painel 1: Indicadores instantâneos de CPU, GPU, Placa-mãe, Discos, memória e alerta de temperatura crítica.
  - Painel 2: Gráficos de linha com histórico temporal contínuo (CPU temp/load, GPU temp/load, RAM %).
  - Painel 3: Especificações técnicas completas do hardware físico com monitor de processos em execução.

- [ ] **Step 1: Estruturar o painel de Visão Geral com medidores térmicos de alta precisão e aviso de elevação**
- [ ] **Step 2: Estruturar o painel de Histórico Temporal com buffers de telemetria em tempo real**
- [ ] **Step 3: Estruturar o painel de Diagnóstico Técnico com processos reais do sistema e especificações de hardware**
- [ ] **Step 4: Testar alternância entre painéis e verificar estabilidade visual**

---

### Task 5: Revisão Textual e Estética Autoral

**Files:**
- Modify: `src/renderer/index.css`
- Review: Todos os componentes em `src/renderer/components/`

**Interfaces:**
- Produces: Interface sem clichês de IA, com tipografia `tabular-nums`, paleta de instrumentos de medição e textos diretos em português sem jargões de marketing.

- [ ] **Step 1: Revisar todos os textos e rótulos de acordo com `humanizer` (eliminar termos como "inteligente", "revolucionário", "robusto", "ecossistema")**
- [ ] **Step 2: Ajustar contrastes, bordas finas e cores semânticas (`#2DD4BF`, `#F59E0B`, `#EF4444`, `#38BDF8`)**
- [ ] **Step 3: Verificar acessibilidade de foco e respeito a `prefers-reduced-motion`**

---

### Task 6: Validação Final e Testes

- [ ] **Step 1: Executar suíte completa de testes (`npm test`)**
- [ ] **Step 2: Executar build de produção (`npm run build`)**
- [ ] **Step 3: Executar a aplicação desktop ou web e validar leitura ao vivo dos sensores reais do Ryzen 5 9600X e RX 7600**
