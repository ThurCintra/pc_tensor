# Como contribuir

Obrigado pelo interesse no PC Sentinel! Este guia explica como preparar o ambiente e enviar uma mudança.

## Ambiente

- Windows 10 ou 11 (o app e a ponte de sensores são específicos do Windows)
- Node.js 20 ou mais recente
- .NET Framework 4.x (já vem no Windows) para recompilar a ponte de sensores

```bash
npm install
npm run dev
```

Para ler as temperaturas durante o desenvolvimento, abra o terminal como administrador.

## Antes de abrir um pull request

```bash
npm run check
```

O comando roda o ESLint, confere a formatação do Prettier e executa os testes. O CI roda o mesmo comando.

- Use `npm run format` para formatar o código automaticamente.
- Todo módulo novo em `src/main` ou `src/server` deve ter teste em `tests/`, na pasta equivalente.
- Os testes não podem depender do hardware da máquina: injete fontes simuladas (veja
  `tests/main/telemetry/collector.test.js`).

## Mensagens de commit

O projeto segue o [Conventional Commits](https://www.conventionalcommits.org/pt-br/), em português:

```
feat: alerta de temperatura da placa-mãe
fix(server): rejeitar token vazio no WebSocket
docs: explicar o pareamento pelo celular
```

Tipos usados: `feat`, `fix`, `refactor`, `test`, `docs`, `ci`, `build` e `chore`.

## Versões

O projeto segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/) no formato `MAIOR.MENOR.CORREÇÃO`:

| Mudança | Comando | Exemplo |
|---|---|---|
| Correção de bug, sem recurso novo | `npm version patch` | 1.2.0 → 1.2.1 |
| Recurso novo, compatível com o que já existe | `npm version minor` | 1.2.1 → 1.3.0 |
| Mudança que quebra compatibilidade (configurações, API do celular) | `npm version major` | 1.3.0 → 2.0.0 |

## Publicar uma versão

1. Mova as entradas de "Não lançado" no `CHANGELOG.md` para a nova versão.
2. Rode o `npm version` adequado (tabela acima) e depois `git push --follow-tags`.

O GitHub Actions gera o instalador e publica a release com as notas do CHANGELOG. Os apps já instalados encontram a
versão nova sozinhos na próxima vez que forem abertos.
