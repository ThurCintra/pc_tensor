# Arquitetura do PC Sentinel

## Visão geral

```
pc-sensor-bridge.exe (C#, LibreHardwareMonitor)
        │ JSON por linha via stdout (1 Hz)
        ▼
SystemCollector ──► ThermalAlertMonitor ──► Notificação do Windows
 (processo principal)        │
        │  snapshot + alerts  │
        ├──────────► IPC (contextBridge) ──► Interface React (janela do desktop)
        └──────────► MobileLiveServer (HTTP + WebSocket) ──► Mesma interface React no celular
                              │
                              └──► ActionRouter ──► taskkill / powercfg / teclas de mídia
```

| Módulo | Arquivo | Responsabilidade |
|---|---|---|
| Inicialização | `src/main/index.js` | Cria os serviços, loop de métricas (1,2 s), instância única e encerramento |
| Janelas e bandeja | `src/main/windows.js`, `src/main/tray.js` | Janela principal (destruída ao fechar para liberar RAM), QR Code, modo compacto e menu |
| Atualizações | `src/main/updater.js` | Procura versão nova ao abrir (electron-updater + GitHub Releases), baixa e instala ao reiniciar |
| IPC | `src/main/ipc.js` | Canais expostos à interface pelo `src/preload/index.js` |
| Coletor | `src/main/telemetry/collector.js` | Junta as fontes num snapshot; dependências injetáveis para teste |
| Ponte de sensores | `src/main/telemetry/sensor-bridge.js` | Mantém o `pc-sensor-bridge.exe` rodando e guarda a última leitura |
| LibreHardwareMonitor | `src/main/telemetry/lhm-client.js` | Lê o servidor web do LHM (porta 8085), se estiver aberto |
| Métricas nativas | `src/main/telemetry/native-metrics.js` | Carga de CPU e memória pelo Node, sem abrir processos |
| Inventário | `src/main/telemetry/hardware-info.js` | Dados estáticos da página Hardware, com `null` para o que falhar |
| Configurações | `src/main/settings-store.js` | Preferências e token de pareamento em `%APPDATA%\pc-sentinel\settings.json` |
| Alertas | `src/main/telemetry/thermal-alerts.js` | Limites de CPU/GPU com histerese de 5 °C e cooldown configurável |
| Histórico | `src/main/telemetry/thermal-history.js` | Agregados diários e relatórios de sessão em `%APPDATA%\pc-sentinel` |
| Servidor mobile | `src/server/mobile-server.js` | API REST, WebSocket, QR Code, firewall |
| Ações remotas | `src/server/action-router.js` | Encerrar processo, plano de energia, Boost, mídia |
| Interface | `src/renderer/` | React + Vite; a mesma build roda na janela e no celular |
| Transporte | `src/renderer/lib/transport.js` | IPC no desktop; WebSocket (telemetria) e REST (hardware, ações) no celular |

## Serviço nativo (em migração)

`service/PcSentinel.Service` é o backend .NET 10 da nova arquitetura: lê os sensores pelo LibreHardwareMonitorLib,
calcula derivada térmica, degradação, eficiência do silício, Juiz de Lag e energia, guarda o histórico em SQLite
(`%APPDATA%pc-sentinel	elemetry.db`) e transmite pelo WebSocket v2 descrito em
[contrato-websocket.md](contrato-websocket.md). Usa o mesmo token de pareamento do app. Por enquanto roda separado
(`dotnet run --project service/PcSentinel.Service`); as próximas etapas fazem o Electron iniciá-lo e migram a
interface e o celular para o contrato v2, aposentando a ponte `pc-sensor-bridge.exe` e o servidor Node.

Diagnóstico de sensores: `pc-sentinel-service --dump-sensors` lista todos os sensores lidos neste PC.

## Uma interface, dois modos

O build do Vite (`dist/`) é carregado pela janela do Electron e também servido pelo `MobileLiveServer`
para o celular. `lib/transport.js` decide o modo:

- **desktop** (`window.sentinelAPI` existe): IPC com o processo principal; habilita Celular,
  Configurações, modo compacto e reinício como administrador.
- **web** (celular/navegador): WebSocket para a telemetria ao vivo e REST com o token para hardware e
  ações. O token vem do link do QR Code e fica no `localStorage` do aparelho, para o atalho na tela
  inicial continuar pareado.

O visual segue o Windows 11 (tokens em `styles.css`) e troca entre claro e escuro por
`prefers-color-scheme`. Abaixo de 760 px a navegação lateral vira uma barra inferior.

## Princípio dos dados reais

Nenhuma interface inventa leituras. Sem sensor, o coletor envia `null` (temperaturas, RPM) ou
`isReal: false` (I/O de disco), e os painéis mostram `--` / "SEM SENSOR". Quando o motivo é a falta de
privilégio de Administrador, `temperatures.requiresElevation` permite explicar isso ao usuário.

## Modelo de segurança do servidor mobile

O servidor escuta em `0.0.0.0` para ser alcançável pelo celular na LAN, então qualquer aparelho da
rede (e qualquer site aberto no navegador do próprio PC) consegue enviar requisições. As defesas:

1. **Token de sessão.** UUID aleatório guardado em `settings.json`, incluído no link do QR Code.
   Exigido por `/api/metrics`, `/api/hardware`, `/api/server/toggle`, `/api/action` e pelo WebSocket
   (comparação em tempo constante). Revogável pela interface: um novo token é gerado e todos os
   clientes são desconectados com o código `4001`.
2. **`/api/info` público e mínimo.** Sem token devolve só status, porta e IP; nunca o token nem o QR Code.
3. **Origem do navegador.** O CORS só libera a mesma origem e o dev server Vite (`localhost:5173`).
   Outras origens recebem `403`, e o handshake do WebSocket é recusado. Isso impede que uma página
   qualquer leia dados ou dispare ações a partir do navegador do usuário. O token continua sendo a
   defesa principal (protege também contra DNS rebinding).
4. **Ações validadas no servidor.**
   - `KILL_PROCESS`: o nome real do PID é obtido via `tasklist`; o nome enviado pelo cliente não é
     confiável. Processos críticos do Windows, PIDs ≤ 4 e o próprio PC Sentinel são bloqueados.
   - `BOOST_CLEANUP`: só encerra executáveis da lista configurada; curingas e nomes arbitrários vão
     para `rejectedTargets`.
   - `SET_POWER_PLAN`: apenas presets conhecidos ou GUIDs válidos.
   - Todos os comandos usam `execFile` com argumentos separados (sem shell).
5. **Limites.** Corpo JSON de até 16 KB e mensagens WebSocket de até 64 KB.

O tráfego é HTTP sem TLS: na mesma rede, alguém capturando pacotes pode ler o token. O uso pretendido é
a rede doméstica do usuário.

## Execução e privilégios

- **App instalado:** o manifesto do executável pede administrador (`requestedExecutionLevel:
  requireAdministrator`), então o Windows mostra o UAC ao abrir e os sensores ficam disponíveis. O
  instalador cria a regra de firewall da porta 3890 (removendo a anterior para não duplicar).
- **`npm start`:** abre sem elevação; o app detecta isso (`net session`) e oferece **Reiniciar como
  administrador**, que solta a trava de instância única e a porta, chama `Start-Process -Verb RunAs` e
  encerra. Se o UAC for recusado, restaura a trava e o servidor e segue rodando.
- **`npm run dev`:** o reinício é desativado (mataria o Vite via `concurrently -k`); para ler sensores,
  rode o terminal como administrador.
- "Iniciar com o Windows" é ativado só na primeira execução do app instalado; depois a escolha é do
  usuário (bandeja ou Configurações).
- A ponte de sensores C# (`native/sensor-bridge/`) é recompilada com `npm run build:bridge` (usa o `csc.exe` do
  .NET Framework 4) e o executável vai para `resources/sensor-bridge/`, junto das DLLs do LibreHardwareMonitor.
  O instalador copia essa pasta para fora do `app.asar`.

## Testes e qualidade

`npm run check` roda ESLint, Prettier e Vitest; é o que o CI (`.github/workflows/ci.yml`) executa no Windows a
cada push e pull request. A estrutura de `tests/` espelha a de `src/`.

Os testes nunca dependem da máquina: o coletor recebe fontes simuladas (ponte, LHM, métricas nativas,
processos), o histórico térmico fica em memória, os comandos de sistema usam um `execFile` simulado
(`tests/helpers/fake-exec.js`) e os servidores de teste escutam só em `127.0.0.1`.

## Releases

Uma tag `vX.Y.Z` (criada por `npm version`) dispara `.github/workflows/release.yml`: confere se a tag bate com o
`package.json`, roda `npm run check`, recompila a ponte, gera o instalador e publica a release no GitHub.
