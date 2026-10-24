# pc_tensor Cloud

Painel web multiusuário para acompanhar vários computadores em tempo real, de qualquer rede (4G/5G), sem abrir
portas no roteador nem usar VPN: o PC conecta de dentro para fora no servidor de tempo real.

```
PC (agente)  ──wss /agent──►  Servidor de tempo real (Socket.IO)  ◄──wss /client──  Navegador / celular
                                   │  sala device:{id}, presença
                                   ▼
                              PostgreSQL  ◄──  Site Next.js (login, API, pareamento)
```

## Pacotes

| Pasta | O que é |
|---|---|
| `packages/protocol` | Esquemas zod e tipos compartilhados (mensagens, comandos, status, token de tempo real) |
| `packages/db` | Schema Prisma, migrações e conexão (PostgreSQL real ou PGlite nos testes) |
| `apps/web` | Next.js 16: Auth.js, API REST e, nas próximas etapas, as telas |
| `apps/realtime` | Servidor Socket.IO: autenticação dupla, salas, presença, repasse ao vivo, comandos e travamentos |

## Rodar localmente

1. Crie um banco PostgreSQL gratuito no [Neon](https://neon.tech) ou no [Supabase](https://supabase.com). Para
   só desenvolver, dá para pular esse passo: `npm run db:dev` sobe um PostgreSQL local (PGlite, sem instalar nada)
   em `postgresql://postgres@127.0.0.1:5433/postgres`, já com as migrações aplicadas e os dados em `cloud/.pglite`.
2. Copie `apps/web/.env.example` para `apps/web/.env` e preencha (gere `AUTH_SECRET` com `npx auth secret` e um
   `REALTIME_JWT_SECRET` com pelo menos 32 caracteres).
3. Instale, gere o cliente e aplique as migrações:

```bash
npm install
```

```bash
npm run db:generate
```

```bash
DATABASE_URL="..." npm run db:migrate
```

4. Suba o site e o servidor de tempo real (em terminais separados):

```bash
npm run dev:web
```

```bash
DATABASE_URL="..." REALTIME_JWT_SECRET="..." CORS_ORIGINS="http://localhost:3000" npm run dev:realtime
```

Testes (não precisam de banco: usam PostgreSQL em memória com PGlite): `npm run check`.

## Site (Etapa 4)

Tema escuro por padrão (segue o tema do sistema), Tailwind 4 e ícones Lucide; funciona no celular.

- **Entrar / Cadastrar** (`/entrar`, `/cadastrar`): e-mail e senha, e os botões de Google e GitHub só aparecem
  quando as credenciais estão configuradas. Depois do cadastro o usuário já entra logado. *Esqueci a senha* e
  *Redefinir senha* usam o link de uso único da Etapa 1.
- **Meus Computadores** (`/computadores`): um card por PC com status ao vivo (Online, Em jogo, Alerta térmico,
  Offline), temperaturas de CPU e GPU coloridas pelos limites, hardware e "visto há…". O navegador entra na sala
  `user:{id}` do servidor de tempo real e recebe a mudança de status de todos os seus PCs sem recarregar a página
  e sem ligar o modo ao vivo deles.
- **Adicionar computador:** modal com o código de 6 dígitos, contagem regressiva de 5 minutos, o endereço do site
  para copiar e a confirmação automática quando o PC aparece na conta.
- **Ajustes do PC:** nome, limites de alerta (50 a 110 °C) e remoção com confirmação. Os novos limites chegam ao
  agente em até 1 minuto, sem reiniciar nada.
- **Conta** (`/conta`): nome e tarifa de energia (R$/kWh) usada no taxímetro.

## API (Etapa 1)

Respostas de erro: `{ "error": { "code", "message" } }`. Rotas de usuário usam a sessão do Auth.js (cookie).

| Método e rota | Quem chama | O que faz |
|---|---|---|
| `POST /api/auth/register` | site | Cria conta com nome, e-mail e senha (mínimo 10 caracteres, Argon2id) |
| `/api/auth/*` (Auth.js) | site | Login por e-mail e senha, Google e GitHub (quando configurados) |
| `POST /api/auth/password/forgot` | site | Envia o link de redefinição (sempre 202; não revela se o e-mail existe) |
| `POST /api/auth/password/reset` | site | Troca a senha com o token do e-mail (1 hora, uso único) |
| `GET`/`PATCH /api/me` | site | Conta e tarifa de energia (R$/kWh) |
| `GET /api/devices` | site | "Meus Computadores" com status e últimas temperaturas |
| `GET`/`PATCH`/`DELETE /api/devices/:id` | site | Detalhes, nome, limites de alerta (°C) e remoção |
| `GET /api/devices/:id/history?hours=24` | site | Resumos de 1 minuto |
| `GET /api/devices/:id/alerts` | site | Alertas (superaquecimento, previsão, poeira, travamento) |
| `POST /api/pairing-codes` | site | Gera o código de 6 dígitos (5 minutos, invalida o anterior) |
| `POST /api/agent/pair` | agente | Troca o código pelo `DeviceToken` (devolvido uma única vez) |
| `GET /api/agent/me` | agente | Confere o token (`X-Device-Token`) e devolve os limites de alerta |
| `GET /api/realtime-token` | site | Token de 5 minutos para conectar no servidor de tempo real |

## Tempo real (Etapa 2)

Namespaces do Socket.IO (tipos em `packages/protocol`):

- **`/agent`** (PC): autentica com `auth.token` ou cabeçalho `X-Device-Token`. Recebe `stream:mode`
  (`HEARTBEAT` 60 s ou `LIVE` 250 ms) e `command` (com resposta). Envia `telemetry:live`,
  `telemetry:heartbeat` (com confirmação; gravado em `TelemetryHistory`) e `alert`.
- **`/client`** (navegador): autentica com o token de `/api/realtime-token`. Envia `device:subscribe`,
  `device:unsubscribe` e `device:command`; recebe `device:telemetry`, `device:status` e `device:alert`.

Regras:

- **Isolamento:** só o dono entra na sala `device:{id}`; para os outros, o PC "não existe". Comandos só valem
  para PCs em que o navegador já entrou.
- **Presença:** o primeiro espectador liga o modo `LIVE`; quando o último sai, o PC volta ao `HEARTBEAT`. Os
  quadros ao vivo são repassados na memória, sem passar pelo banco.
- **Comandos:** só `ACTION_CLEAN_RAM`, `ACTION_OPTIMIZE_PRIORITY` e `ACTION_UPDATE_CONFIG` (limites entre 50 e
  110 °C), validados no servidor e de novo no agente; no máximo 5 a cada 10 s por navegador.
- **Travamento:** conexão cortada sem despedida (`transport close`, `ping timeout`) com o PC em jogo ou com
  CPU/GPU acima de 50% no último minuto e meio vira `ABRUPT_CRASH`, se o PC não voltar em 20 s (um Wi-Fi que
  piscou não conta).

Limitação atual: a presença e as conexões ficam na memória de uma instância. Para rodar mais de uma, use o
adaptador Redis do Socket.IO e troque a contagem de espectadores por `fetchSockets()`.

## Agente no PC (Etapa 3)

O agente é o serviço nativo do PC Sentinel (`service/PcSentinel.Service`, .NET 10), que já lê os sensores. A parte
da nuvem fica em `service/PcSentinel.Service/Cloud`:

- **Pareamento:** em *Configurações → pc_tensor Cloud* no app, o usuário informa o endereço do site e o código de
  6 dígitos (uma vez). Sem o app: `pc-sentinel-service --pair 123456 --cloud-url https://site`. O hardware (CPU,
  GPU, RAM) vai junto para o cadastro. O `DeviceToken` fica em `%APPDATA%\pc-sentinel\cloud.json`, cifrado com o
  DPAPI do Windows (inútil se copiado para outro PC ou outra conta).
- **Conexão reversa:** o PC conecta de dentro para fora em `<REALTIME_URL>/agent` (informado por
  `/api/agent/me`). Reconecta sozinho com espera exponencial de 1 s a 60 s e variação aleatória de ±20%.
- **Modos:** em `HEARTBEAT` manda 1 resumo por minuto (médias, máxima e Wh); em `LIVE`, o quadro completo a cada
  250 ms. O resumo por minuto continua no modo ao vivo, para o histórico não ter buracos. Resumos e alertas que
  não saíram ficam numa fila (2 horas de resumos) e são enviados quando a conexão volta.
- **Alertas:** `OVERHEAT` na hora em que a temperatura passa do limite definido no site (rearma 3 °C abaixo),
  `PREDICTIVE_THROTTLE` (derivada térmica) e `DUST_WARNING` (degradação térmica).
- **Comandos:** um `switch` fechado com `ACTION_CLEAN_RAM` (lista standby via `NtSetSystemInformation`),
  `ACTION_OPTIMIZE_PRIORITY` (prioridade BelowNormal por 5 minutos) e `ACTION_UPDATE_CONFIG` (limites entre 50 e
  110 °C). Qualquer outra coisa é recusada; nada vindo da rede vira comando de terminal.
- **PC removido no site:** o servidor derruba a conexão em até 1 minuto, o agente recebe 401, apaga o token e para
  de tentar até um novo pareamento.

Teste de ponta a ponta (serviço C# real + servidor de tempo real + navegador, banco em PGlite):

```bash
npm run e2e:agent
```

## Hospedagem

- **Site:** Vercel (ou qualquer host de Next.js). Use a URL com pool do banco (no Neon, o host `-pooler`).
- **Tempo real:** um serviço com WebSocket longo (Railway, Render, Fly.io), com `CORS_ORIGINS` apontando para
  o domínio do site. A Vercel não mantém conexões WebSocket abertas.
