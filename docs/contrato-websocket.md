# Contrato do WebSocket (v2)

Contrato entre o serviço nativo `PcSentinel.Service` (.NET 10) e os clientes (app do PC e HUD do celular).
A fonte da verdade são os tipos em `service/PcSentinel.Service/Contracts/`; este documento descreve o formato JSON.

## Conexão

```
ws://<ip-do-pc>:3891/ws?token=<token-de-pareamento>
```

- **Token:** o mesmo código de pareamento do app (`sessionToken` em `%APPDATA%\pc-sentinel\settings.json`).
  Sem token válido a conexão é recusada com HTTP 401. A comparação é feita em tempo constante.
- **Origem:** navegadores só conectam a partir da própria origem do serviço ou do dev server
  (`http://localhost:5173`). Clientes nativos (Electron, sem cabeçalho `Origin`) são aceitos.
- **Limites:** mensagens do cliente de até 16 KB; clientes lentos perdem os quadros mais antigos em vez de
  atrasar os demais (fila de 8 quadros por cliente).
- **JSON:** nomes em `camelCase`; valores que nenhum sensor informou vêm como `null`, nunca estimados.
- **Versão:** todo envelope leva `"v": 2`. Mudanças incompatíveis incrementam esse número.

## Servidor → cliente

Todas as mensagens usam o mesmo envelope:

```json
{ "v": 2, "type": "telemetry", "seq": 1842, "ts": 1792850400250, "data": { } }
```

| `type` | Quando | `data` |
|---|---|---|
| `hello` | Logo após conectar | Informações do serviço e capacidades |
| `telemetry` | A cada 250 ms | Quadro completo de telemetria |
| `alert` | Na transição de um alerta (não repete enquanto a condição dura) | Alerta |
| `commandResult` | Em resposta a um `command` | Resultado do comando |

### `hello`

```json
{
  "serviceVersion": "1.2.0",
  "machineName": "DESKTOP-UV6BTUV",
  "isElevated": true,
  "tickIntervalMs": 250,
  "throttleLimits": { "cpuC": 95, "gpuC": 90 },
  "profiles": ["COMPETITIVE_FPS", "AAA_GRAPHICS", "DEV_WORKSTATION", "IDLE"],
  "capabilities": { "stutterBuster": true, "foregroundDetection": true, "frametime": false }
}
```

`frametime` é `false` nesta versão: o serviço ainda não lê o tempo de quadro dos jogos (exigiria PresentMon/ETW).

### `telemetry`

```json
{
  "cpu": {
    "name": "AMD Ryzen 5 9600X",
    "tempC": 71.5,
    "tempSource": "sensor",
    "loadPct": 64.2,
    "maxCoreLoadPct": 97.0,
    "powerW": 88.4,
    "clockMhz": 5385,
    "vcoreV": 1.284,
    "thermal": { "slopeCPerS": 0.42, "timeToThrottleS": 56.0, "limitC": 95, "throttling": false }
  },
  "gpu": {
    "name": "AMD Radeon RX 7600",
    "tempC": 68.0,
    "hotspotC": 81.0,
    "memoryTempC": 78.0,
    "loadPct": 98.0,
    "powerW": 151.0,
    "clockMhz": 2655,
    "vcoreV": 1.12,
    "vramUsedMb": 7420,
    "vramTotalMb": 8176,
    "fanRpm": 1820,
    "fanPct": 54.0,
    "thermal": { "slopeCPerS": 0.08, "timeToThrottleS": null, "limitC": 90, "throttling": false }
  },
  "memory": { "usedMb": 11240, "totalMb": 15560, "loadPct": 72.2 },
  "board": { "name": "MSI PRO B650M-P (MS-7E27)", "systemTempC": 36.0, "vrmTempC": 58.0 },
  "storage": [{ "name": "KINGSTON SNV3S500G", "tempC": 44.0 }],
  "fans": [{ "name": "CPU Fan", "rpm": 1240, "pct": 48.0 }],
  "network": {
    "adapter": "Ethernet",
    "gateway": "192.168.100.1",
    "gatewayLatencyMs": 1.2,
    "internetLatencyMs": 18.4,
    "jitterMs": 2.1,
    "lossPct": 0.0
  },
  "lag": {
    "verdict": "NORMAL",
    "reasons": []
  },
  "context": { "profile": "COMPETITIVE_FPS", "foregroundExe": "cs2.exe", "foregroundPid": 18232 },
  "energy": {
    "systemPowerW": 299.4,
    "baseLoadW": 60,
    "tariffBrlPerKwh": 0.95,
    "sessionKwh": 0.412,
    "sessionCostBrl": 0.39,
    "monthKwh": 38.71,
    "monthCostBrl": 36.77
  },
  "maintenance": {
    "warning": false,
    "component": null,
    "tempDeltaC": null,
    "fanDeltaPct": null,
    "baselineAgeDays": null
  },
  "efficiency": {
    "cpu": { "mhzPerWatt": 60.9, "vcoreStdDevMv": 9.4, "samples": 1840 },
    "gpu": { "mhzPerWatt": 17.6, "vcoreStdDevMv": 6.1, "samples": 1622 }
  }
}
```

Campos de cada bloco:

| Campo | Significado |
|---|---|
| `cpu.tempSource` | `sensor` (núcleos, exige administrador), `amdDriver` (driver da placa AMD) ou `ioDie` (die de E/S do Ryzen pela GPU integrada: real, porém mais frio que os núcleos). Com `ioDie` a previsão de throttling e a linha de base de degradação da CPU ficam desligadas |
| `cpu.vcoreV` | Tensão medida (SVI2/SVI3 na AMD, "CPU Core" na Intel); o VID pedido pelo processador não é usado |
| `thermal.slopeCPerS` | dT/dt em °C/s: inclinação da reta de mínimos quadrados sobre os últimos 10 s |
| `thermal.timeToThrottleS` | Segundos até `limitC` mantida a inclinação; `null` se a temperatura está estável, caindo ou levaria mais de 120 s |
| `thermal.throttling` | Temperatura já está no limite |
| `lag.verdict` | `NORMAL`, `CAUSE_NETWORK`, `CAUSE_CPU_BOTTLENECK` ou `CAUSE_VRAM_OVERFLOW` |
| `lag.verdict` (CPU) | `CAUSE_CPU_BOTTLENECK` exige um núcleo a 95% ou mais com a GPU entre 30% e 85% (jogo rodando, mas esperando a CPU) |
| `lag.reasons` | Frases curtas explicando o veredito (ex.: `"Perda de pacotes de 4%"`) |
| `context.profile` | `COMPETITIVE_FPS`, `AAA_GRAPHICS`, `DEV_WORKSTATION` ou `IDLE` |
| `energy.systemPowerW` | P_CPU + P_GPU + carga base estimada |
| `energy.monthKwh` | Consumo do mês corrente, gravado no SQLite |
| `maintenance.warning` | Para o mesmo consumo, a temperatura subiu ≥ 5 °C ou a ventoinha gira ≥ 15 % mais que a linha de base de semanas anteriores |
| `efficiency.*.mhzPerWatt` | Clock médio dividido pela potência média sob carga (≥ 80 %) |
| `efficiency.*.vcoreStdDevMv` | Desvio-padrão da tensão sob carga, em milivolts (estabilidade) |

### `alert`

```json
{ "kind": "PREDICTIVE_THROTTLE", "component": "cpu", "severity": "warning", "message": "CPU deve chegar a 95 °C em 24 s", "value": 24.0 }
```

| `kind` | Disparo | Vibração sugerida no celular |
|---|---|---|
| `PREDICTIVE_THROTTLE` | `timeToThrottleS` abaixo de 30 s | `[300, 100, 300, 100, 300]` |
| `THROTTLING` | Temperatura no limite | `[800, 200, 800]` |
| `NETWORK_SPIKE` | Veredito do Juiz de Lag passou a `CAUSE_NETWORK` | `[100, 50, 100]` |
| `MAINTENANCE` | `maintenance.warning` passou a `true` | nenhuma |

`severity` é `info`, `warning` ou `critical`. Cada alerta só é reenviado depois que a condição some e volta.

### `commandResult`

```json
{ "id": "6f1c2c8e-41b4-4b77-9a51-3c2f7b4d9e10", "ok": true, "data": { }, "error": null }
```

## Cliente → servidor

```json
{ "v": 2, "type": "command", "id": "6f1c2c8e-41b4-4b77-9a51-3c2f7b4d9e10", "action": "STUTTER_BUSTER", "params": {} }
```

| `action` | `params` | Resposta (`data`) |
|---|---|---|
| `STUTTER_BUSTER` | `{}` | `{ "standbyPurged": true, "standbyFreedMb": 2310, "deprioritized": ["chrome.exe", "EpicGamesLauncher.exe"], "restoreAfterS": 300 }` |
| `SET_ENERGY_CONFIG` | `{ "tariffBrlPerKwh": 0.95, "baseLoadW": 60 }` | A configuração salva |
| `GET_SILICON_CURVE` | `{ "component": "cpu" }` | `{ "points": [{ "clockMhz": 5300, "vcoreV": 1.27, "powerW": 86.2, "samples": 412 }] }` |
| `PING` | `{}` | `{ "pong": true }` |

Comando desconhecido ou parâmetro inválido devolve `ok: false` com `error` em português.

## Estrutura de pastas

```
service/
├── PcSentinel.Service/              Serviço .NET 10 (Kestrel + WebSocket)
│   ├── Program.cs                   Composição, porta, autenticação e endpoint /ws
│   ├── Contracts/                   Envelopes e DTOs deste contrato
│   ├── Sensors/                     Leitura do LibreHardwareMonitor e normalização
│   ├── Analytics/                   Derivada térmica, degradação, silício, Juiz de Lag, energia
│   ├── Context/                     Janela em primeiro plano e perfis (Game-Sense)
│   ├── Control/                     Stutter Buster (lista standby e prioridades)
│   ├── Network/                     Sonda de latência, jitter e perda
│   ├── Native/                      P/Invoke (ntdll, advapi32, user32, kernel32)
│   ├── Persistence/                 SQLite: linhas de base, energia, curva de silício
│   └── Server/                      Hub WebSocket, laço de telemetria e alertas
└── PcSentinel.Service.Tests/        Testes xUnit dos cálculos (sem hardware)

src/                                 App Electron + React atual (Etapas 3 e 4 migram os clientes para este contrato)
```
