# Status do Projeto e Diário de Bordo: PC Sentinel

## Estado Atual
- **Última Atualização:** 2026-10-18
- **Fase Ativa:** Fase 3 - Servidor Mobile Live & Telemetria em Tempo Real Concluídos
- **Status dos Testes:** 100% GREEN (4/4 testes passando no Vitest)

## Entregas Concluídas
1. **Setup Inicial Completo:**
   - Stack: JavaScript / Node.js, Electron, React, Vite, WebSocket (`ws`), `systeminformation`, `mongodb` e `vitest`.
   - Pipeline de build (`vite build`) gerando os artefatos em `dist/`.
2. **Módulo de Telemetria Térmica & Hardware (TDD):**
   - [`src/main/collector.js`](file:///c:/Users/Administrator/Desktop/pc-sentinel/src/main/collector.js): Coleta temperaturas de CPU e GPU, carga de núcleos, uso de memória RAM e discos com fallback seguro.
   - [`tests/unit/collector.test.js`](file:///c:/Users/Administrator/Desktop/pc-sentinel/tests/unit/collector.test.js): Testes unitários com Vitest passando.
3. **Servidor Mobile Live com WebSocket & QR Code:**
   - [`src/server/mobile-server.js`](file:///c:/Users/Administrator/Desktop/pc-sentinel/src/server/mobile-server.js): Servidor HTTP e WebSocket local para streaming de telemetria térmica em tempo real na porta `3890`.
   - Detecção automática de IP local da máquina e geração dinâmica de QR Code para escaneamento com celular.
   - [`tests/unit/mobile-server.test.js`](file:///c:/Users/Administrator/Desktop/pc-sentinel/tests/unit/mobile-server.test.js): Testes de conexão e broadcast validados.
4. **HUD Mobile Responsivo:**
   - [`src/server/public/index.html`](file:///c:/Users/Administrator/Desktop/pc-sentinel/src/server/public/index.html): Interface web futurista e ultraleve para celulares com medidores de CPU Temp, GPU Temp, gráficos de tendência em canvas e alertas visuais.
5. **Dashboard Desktop em React:**
   - [`src/renderer/App.jsx`](file:///c:/Users/Administrator/Desktop/pc-sentinel/src/renderer/App.jsx): Painel desktop com navegação entre Dashboard e tela de QR Code para conexão com o smartphone.
6. **Main Process & IPC Seguro:**
   - [`src/main/main.js`](file:///c:/Users/Arthur/Desktop/pc_tensor/src/main/main.js) e [`src/preload/preload.js`](file:///c:/Users/Arthur/Desktop/pc_tensor/src/preload/preload.js): ContextIsolation ativo, loop contínuo de métricas sincronizando Electron e WebSocket mobile.
7. **Otimização Extrema de Performance & Redução de Processos:**
   - Diagnóstico da causa raiz: A biblioteca `systeminformation` no Windows disparava 11 processos `powershell.exe`/`conhost.exe` a cada segundo (660 processos/minuto) para GPU, discos e ACPI WMI.
   - Refatoração para métricas nativas do Node.js (`os.cpus()` e `os.totalmem()`/`os.freemem()`) via V8/libuv com 0 subprocessos e latência de ~0.2ms.
   - Cache inteligente de especificações estáticas (GPU, partições de disco e sensores WMI ausentes).
   - Eliminação de processos sobressalentes do Chromium com flags `SpareRendererForSitePerProcess` e lock anti-sobreposição no loop de métricas.

8. **Paridade Total de Funcionalidades entre Desktop e Web:**
   - [`src/server/public/index.html`](file:///c:/Users/Arthur/Desktop/pc_tensor/src/server/public/index.html): Interface web completamente unificada e expandida com todas as funcionalidades do Desktop:
     - Dashboard com Hero Thermal Gauges duplos para CPU e GPU, picos máximos e status dinâmico (Otimizado, Alerta, Crítico).
     - Gráfico Spline interativo com filtros de tempo (5 min, 15 min, 30 min) e métricas estatísticas (Média, Pico, Mínima).
     - Equalizador segmentado multi-core em tempo real para cada núcleo de processamento e barra de alocação de memória RAM.
     - Indicador dinâmico de refrigeração com rotação visual do cooler proporcional ao RPM e monitoramento PWM.
     - Painel de armazenamento com leitura e gravação em tempo real (Disk I/O em MB/s) e ocupação de partições.
     - Aba completa de Hardware & Raio-X do PC com especificações de SO, Placa-Mãe, BIOS, Processador, GPUs com VRAM, slots de memória RAM, Discos e Conectividade de Rede com máscara de privacidade para MAC.
     - Ações de copiar especificações em Markdown para clipboard e download de relatório estruturado em JSON.
     - Aba de controle de streaming e pareamento via QR Code com alternância liga/desliga em tempo real.
     - Modo Mini-Widget HUD compacto flutuante.
   - [`src/server/mobile-server.js`](file:///c:/Users/Arthur/Desktop/pc_tensor/src/server/mobile-server.js): Suporte a endpoints REST (`/api/hardware`, `/api/metrics`, `/api/info`, `/api/server/toggle`) e WebSocket bidirecional com suporte a CORS.
   - [`src/renderer/App.jsx`](file:///c:/Users/Arthur/Desktop/pc_tensor/src/renderer/App.jsx) e [`src/renderer/components/hardware/HardwareSpecsView.jsx`](file:///c:/Users/Arthur/Desktop/pc_tensor/src/renderer/components/hardware/HardwareSpecsView.jsx): Modo híbrido com suporte a WebSocket e REST quando executado em navegadores web.
   - Testes unitários com Vitest atualizados e 100% GREEN (13/13 testes passando).

## Próximos Passos
- Implementar serviço de persistência de picos térmicos no MongoDB ([.project/PLANO.md](file:///c:/Users/Arthur/Desktop/pc_tensor/.project/PLANO.md)).
- Disparo de notificações desktop e sonoras de alerta.
