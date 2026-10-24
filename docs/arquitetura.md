# Arquitetura do PC Sentinel

## Visão geral

```
pc-sensor-bridge.exe (C#, LibreHardwareMonitor)
        │ JSON por linha via stdout (1 Hz)
        ▼
SystemCollector ──► ThermalAlertMonitor ──► Notificação do Windows
 (processo principal)        │
        │  snapshot + alerts  │
        ├──────────► IPC (contextBridge) ──► Renderer React (dashboard desktop)
        └──────────► MobileLiveServer (HTTP + WebSocket) ──► HUD mobile / navegador
                              │
                              └──► ActionRouter ──► taskkill / powercfg / teclas de mídia
```

| Módulo | Arquivo | Responsabilidade |
|---|---|---|
| Processo principal | `src/main/main.js` | Janela, bandeja, IPC, loop de métricas (1,2 s) |
| Coletor | `src/main/collector.js` | CPU/RAM nativos, sensores via bridge C#, discos e GPU via `systeminformation` |
| Configurações | `src/main/settings-store.js` | Preferências e token de pareamento em `%APPDATA%\pc-sentinel\settings.json` |
| Alertas | `src/main/thermal-alerts.js` | Limites de CPU/GPU com histerese de 5 °C e cooldown configurável |
| Histórico | `src/main/thermal-history.js` | Agregados diários e relatórios de sessão em `%APPDATA%\pc-sentinel` |
| Servidor mobile | `src/server/mobile-server.js` | API REST, WebSocket, QR Code, firewall |
| Ações remotas | `src/server/action-router.js` | Encerrar processo, plano de energia, Boost, mídia |
| Desktop | `src/renderer/` | React + Vite |
| HUD mobile | `src/server/public/index.html` | Página única servida pelo servidor mobile |

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

## Inicialização

- `iniciar.bat` pede elevação (UAC), instala dependências na primeira vez, compila a interface e roda
  `npm start`. Ele **não** faz `git pull`: atualizar é uma ação manual e revisada.
- No app instalado, "Iniciar com o Windows" é ativado só na primeira execução; depois a escolha é do
  usuário (bandeja ou Configurações).

## Testes

`npm test` (Vitest). Os testes injetam um `execFile` simulado (`tests/helpers/fake-exec.js`), então
nenhum comando real de sistema é executado, e os servidores de teste escutam só em `127.0.0.1`.
O workflow `.github/workflows/ci.yml` roda testes e build no Windows a cada push e pull request.
