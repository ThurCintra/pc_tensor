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

1. Crie um banco PostgreSQL gratuito no [Neon](https://neon.tech) ou no [Supabase](https://supabase.com).
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

## Hospedagem

- **Site:** Vercel (ou qualquer host de Next.js). Use a URL com pool do banco (no Neon, o host `-pooler`).
- **Tempo real:** um serviço com WebSocket longo (Railway, Render, Fly.io), com `CORS_ORIGINS` apontando para
  o domínio do site. A Vercel não mantém conexões WebSocket abertas.
