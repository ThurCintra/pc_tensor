# PC Sentinel — M0 Foundation

Monorepo foundation for PC Sentinel (remote monitoring of Windows PCs via mobile app).
M0 covers only the protocol contract, tooling, and empty app shells. Backend, mobile, and real Agent come in later milestones.

## Structure

```text
pc-sentinel/
├── apps/backend/        (empty entrypoint, implemented in M1+)
├── apps/mobile/         (placeholder, created in M2)
├── apps/agent/          (only PcSentinel.Protocol + Tests in M0)
├── packages/shared/     (Zod protocol source of truth + generated JSON Schema)
├── tools/fake-agent/    (placeholder, created in M1)
├── docker-compose.yml   (TimescaleDB only, no migrations yet)
└── .github/workflows/ci.yml
```

Contract flow: `packages/shared` Zod schemas → `generated/protocol.schema.json` → C# models in `apps/agent/PcSentinel.Protocol/Generated/Protocol.cs`. Never edit generated files by hand.

## Prerequisites

- Node 24 (see `.nvmrc`), pnpm 12.8.1 (`corepack` or `npm i -g pnpm`)
- .NET SDK 8.0 LTS (`dotnet --list-sdks`)
- Docker + Docker Compose plugin (`docker compose version`)

## Run locally

```bash
cp .env.example .env
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
dotnet build apps/agent/PcSentinel.sln
dotnet test apps/agent/PcSentinel.sln
docker compose up -d db
docker compose ps
```

## Regenerate the contract

```bash
pnpm gen:jsonschema
pnpm gen:csharp
git diff --exit-code
```

The last command must show no diff on a clean repo (deterministic output).
`gen:jsonschema` builds `packages/shared` then writes `packages/shared/generated/protocol.schema.json` via `zod-to-json-schema`.
`gen:csharp` reads that JSON Schema and writes `apps/agent/PcSentinel.Protocol/Generated/Protocol.cs` via pinned `quicktype-core`.

Why quicktype-core (2 lines): it runs on Node without extra .NET tools and emits deterministic single-file C# with System.Text.Json. Version is pinned via the pnpm lockfile and output is normalized with an auto-generated header.

## Add a new message type

1. Start in Zod: add data schema in `packages/shared/src/` (`control.ts`, `metrics.ts`, or new file) and export it from `index.ts`.
2. Add an envelope in `envelope.ts` with `z.literal('<domain>:<name>')` and include it in `envelopeSchema` discriminated union plus `messageTypeSchema`.
3. Add Vitest cases in `packages/shared/test/protocol.test.ts`: one valid payload, null-sensor case if applicable, and invalid cases.
4. Run `pnpm --filter shared test`, `pnpm typecheck`, `pnpm lint`.
5. Run `pnpm gen:jsonschema && pnpm gen:csharp` and commit the regenerated `generated/protocol.schema.json` and `Generated/Protocol.cs`.
6. Extend `apps/agent/PcSentinel.Protocol.Tests/ProtocolTests.cs` with a deserialization test for the new type.
7. Verify `pnpm install && pnpm lint && pnpm typecheck && pnpm test`, `dotnet test`, and `git diff --exit-code` after regeneration.

Conventions: percentages 0–100, temperature °C, memory/disk bytes as non-negative integers, frequency MHz, power W. Unavailable hardware values are `null`, never `0` or empty string.
