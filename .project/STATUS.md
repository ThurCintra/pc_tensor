# Status do Projeto e Diário de Bordo: PC Sentinel

## Estado Atual
- **Última Atualização:** 2026-10-23
- **Fase Ativa:** Fase 4 - Segurança do servidor mobile, alertas térmicos e configurações
- **Status dos Testes:** suíte Vitest verde, também executada no GitHub Actions (`.github/workflows/ci.yml`)

## Entregas Concluídas
1. **Setup Inicial Completo:**
   - Stack: JavaScript / Node.js, Electron, React, Vite, WebSocket (`ws`), `systeminformation`, `mongodb` e `vitest`.
   - Pipeline de build (`vite build`) gerando os artefatos em `dist/`.
2. **Módulo de Telemetria Térmica & Hardware (TDD):**
   - [`src/main/collector.js`](../src/main/collector.js): Coleta temperaturas de CPU e GPU, carga de núcleos, uso de memória RAM e discos com fallback seguro.
   - [`tests/unit/collector.test.js`](../tests/unit/collector.test.js): Testes unitários com Vitest passando.
3. **Servidor Mobile Live com WebSocket & QR Code:**
   - [`src/server/mobile-server.js`](../src/server/mobile-server.js): Servidor HTTP e WebSocket local para streaming de telemetria térmica em tempo real na porta `3890`.
   - Detecção automática de IP local da máquina e geração dinâmica de QR Code para escaneamento com celular.
   - [`tests/unit/mobile-server.test.js`](../tests/unit/mobile-server.test.js): Testes de conexão e broadcast validados.
4. **HUD Mobile Responsivo:**
   - [`src/server/public/index.html`](../src/server/public/index.html): Interface web futurista e ultraleve para celulares com medidores de CPU Temp, GPU Temp, gráficos de tendência em canvas e alertas visuais.
5. **Dashboard Desktop em React:**
   - [`src/renderer/App.jsx`](../src/renderer/App.jsx): Painel desktop com navegação entre Dashboard e tela de QR Code para conexão com o smartphone.
6. **Main Process & IPC Seguro:**
   - [`src/main/main.js`](../src/main/main.js) e [`src/preload/preload.js`](../src/preload/preload.js): ContextIsolation ativo, loop contínuo de métricas sincronizando Electron e WebSocket mobile.
7. **Otimização Extrema de Performance & Redução de Processos:**
   - Diagnóstico da causa raiz: A biblioteca `systeminformation` no Windows disparava 11 processos `powershell.exe`/`conhost.exe` a cada segundo (660 processos/minuto) para GPU, discos e ACPI WMI.
   - Refatoração para métricas nativas do Node.js (`os.cpus()` e `os.totalmem()`/`os.freemem()`) via V8/libuv com 0 subprocessos e latência de ~0.2ms.
   - Cache inteligente de especificações estáticas (GPU, partições de disco e sensores WMI ausentes).
   - Eliminação de processos sobressalentes do Chromium com flags `SpareRendererForSitePerProcess` e lock anti-sobreposição no loop de métricas.

8. **Paridade Total de Funcionalidades entre Desktop e Web:**
   - [`src/server/public/index.html`](../src/server/public/index.html): Interface web completamente unificada e expandida com todas as funcionalidades do Desktop:
     - Dashboard com Hero Thermal Gauges duplos para CPU e GPU, picos máximos e status dinâmico (Otimizado, Alerta, Crítico).
     - Gráfico Spline interativo com filtros de tempo (5 min, 15 min, 30 min) e métricas estatísticas (Média, Pico, Mínima).
     - Equalizador segmentado multi-core em tempo real para cada núcleo de processamento e barra de alocação de memória RAM.
     - Indicador dinâmico de refrigeração com rotação visual do cooler proporcional ao RPM e monitoramento PWM.
     - Painel de armazenamento com leitura e gravação em tempo real (Disk I/O em MB/s) e ocupação de partições.
     - Aba completa de Hardware & Raio-X do PC com especificações de SO, Placa-Mãe, BIOS, Processador, GPUs com VRAM, slots de memória RAM, Discos e Conectividade de Rede com máscara de privacidade para MAC.
     - Ações de copiar especificações em Markdown para clipboard e download de relatório estruturado em JSON.
     - Aba de controle de streaming e pareamento via QR Code com alternância liga/desliga em tempo real.
     - Modo Mini-Widget HUD compacto flutuante.
   - [`src/server/mobile-server.js`](../src/server/mobile-server.js): Suporte a endpoints REST (`/api/hardware`, `/api/metrics`, `/api/info`, `/api/server/toggle`) e WebSocket bidirecional com suporte a CORS.
   - [`src/renderer/App.jsx`](../src/renderer/App.jsx) e [`src/renderer/components/hardware/HardwareSpecsView.jsx`](../src/renderer/components/hardware/HardwareSpecsView.jsx): Modo híbrido com suporte a WebSocket e REST quando executado em navegadores web.
   - Testes unitários com Vitest atualizados e 100% GREEN (13/13 testes passando).

9. **Segurança do Servidor Mobile (2026-10-23):**
   - Token obrigatório em toda a API e no WebSocket; `/api/info` não expõe mais o token.
   - CORS e WebSocket restritos à mesma origem e ao dev server Vite.
   - `KILL_PROCESS` valida o nome real do PID; Boost aceita só a lista configurada.
   - `iniciar.bat` sem `git pull` elevado; roda o build de produção.
   - Modelo de segurança documentado em [docs/arquitetura.md](../docs/arquitetura.md).

10. **Alertas, Configurações e Dados Reais (2026-10-23):**
   - Alertas térmicos com limite configurável, histerese e cooldown: notificação do Windows, banner no dashboard e vibração no celular.
   - Aba Configurações (alertas, iniciar com o Windows, porta, lista do Boost) persistida em `%APPDATA%`.
   - Token de pareamento persistente e revogável.
   - Interfaces desktop e mobile mostram "SEM SENSOR" em vez de inventar temperaturas, RPM e discos; aviso quando falta privilégio de Administrador.
   - Histórico térmico movido para `%APPDATA%`; dependência `mongodb` removida (não era usada).

11. **Refatoração da Interface e da Execução (2026-10-23):**
   - Interface refeita no visual do Windows 11 (tema claro/escuro do sistema), com páginas Visão geral, Histórico, Processos, Controles, Hardware, Celular e Configurações.
   - HUD mobile unificado: o celular usa a mesma build React via `lib/transport.js` (WebSocket/REST); a página separada de 2.182 linhas foi removida.
   - Todos os `.bat` removidos: instalador pede administrador sozinho, desenvolvimento via `npm run dev`, `npm start` com "Reiniciar como administrador" no app, `npm run build:bridge` para a ponte C#.

## Próximos Passos
- Alertas sonoros opcionais e histórico de alertas disparados.
- Avaliar remover os binários de `tools/LibreHardwareMonitor` do Git (baixar/compilar no build).
