# Start Dev Instruções: Guia Mestre Universal para Desenvolvimento Agêntico (start_dev_universal.md)
> **Tecnologias:** Agnóstico a Linguagem e Stack (Node.js/TS, Python, C#, Go, Rust, Java, Flutter, etc.)  
> **LLM Primário:** Google Gemini / Claude / OpenAI (Conforme o agente/IDE configurado)  
> **Metodologia Agêntica:** Inspirada na especificação e padrão de skills do `obra/superpowers` (GitHub) e padrões abertos de Agent Skills (`agentskills.io`)

---

## 1. Visão Geral e Filosofia do Mestre de Desenvolvimento Universal

Este arquivo (`start_dev_universal.md`) serve como o **guia mestre de inicialização e ambiente universal** para o desenvolvimento de qualquer software guiado por Agentes de IA. O objetivo é estabelecer uma arquitetura previsível, modular e disciplinada, independente da linguagem de programação, framework, banco de dados ou provedor de nuvem utilizado.

### Princípios Fundamentais (Inspirados no `obra/superpowers`)
1. **Primeiro Planeje, Depois Execute (*Plan First, Then Implement*):** Nenhuma linha de código de produção é escrita sem antes refinar os requisitos (`brainstorming`) e aprovar um plano estruturado (`writing-plans`).
2. **Desenvolvimento Guiado por Testes (*Test-Driven Development - TDD*):** O ciclo **RED -> GREEN -> REFACTOR** é obrigatório. Todo recurso deve possuir testes automatizados aplicáveis à stack do projeto antes da sua implementação final.
3. **Carregamento Progressivo de Contexto (*Progressive Disclosure*):** As habilidades do agente (*Skills*) contêm metadados leves no cabeçalho e instrução detalhada no corpo `.md`, sendo carregadas no modelo de IA apenas sob demanda.
4. **Depuração Sistemática sobre Adivinhação:** Problemas técnicos são investigados identificando a causa raiz, coletando evidências em logs e criando testes de regressão antes de aplicar correções.
5. **Independência de Stack:** A estrutura de gerenciamento de contexto, planejamento e habilidades permanece idêntica em qualquer projeto; apenas os comandos de terminal, linters e sintaxe adaptam-se à linguagem escolhida.

---

## 2. Estrutura Mestre Universal de Diretórios do Projeto

```text
meu_projeto_universal/
├── .github/                             # [Ativo] Instruções Permanentes e Skills do Agente
│   ├── copilot-instructions.md          # System prompt global (Convenções da stack escolhida)
│   └── skills/                          # Skills executáveis do projeto (Padrão Open)
│       ├── brainstorming/
│       │   └── SKILL.md                 # Skill: Elicitação e refinamento de requisitos
│       ├── writing-plans/
│       │   └── SKILL.md                 # Skill: Criação de planos de implementação atômicos
│       ├── test-driven-development/
│       │   └── SKILL.md                 # Skill: Ciclo TDD adaptável ao test runner da stack
│       ├── systematic-debugging/
│       │   └── SKILL.md                 # Skill: Diagnóstico e causa raiz de bugs
│       └── build-and-deploy/
│           └── SKILL.md                 # Skill: Compilação/Build e deploy na infraestrutura
│
├── .vscode/                             # [Ferramentas] Configurações da IDE e Protocolos
│   └── mcp.json                         # Configuração de Servidores MCP (DB, Playwright, APIs)
│
├── docs/                                # [Contexto Frio] Documentação de Referência Estática
│   ├── requisitos.md                    # Especificação funcional e regras de negócio
│   ├── arquitetura.md                   # Padrão arquitetural, diagramas e contratos de API
│   └── assets/                          # Mockups, wireframes e esquemas de dados
│
├── .project/                            # [Contexto Quente] Gerenciamento do Ciclo do Projeto
│   ├── IDEIA.md                         # Visão do produto e escopo do MVP/Beta
│   ├── PLANO.md                         # Lista de tarefas atômicas para o agente
│   ├── STATUS.md                        # Diário de bordo e histórico de progresso
│   └── handoffs/                        # Arquivos de transição de contexto entre fluxos
│
├── src/ (ou app/, lib/)                 # [Aplicação] Código-fonte (Estruturado conforme a stack)
│   ├── core/                            # Módulos compartilhados, utilitários e contratos
│   ├── modules/ (ou domain/, features/) # Regras de negócio e componentes
│   └── main.*                           # Ponto de entrada da aplicação
│
├── tests/ (ou test/, spec/)             # [Validação] Suíte de Testes Automatizados
│   ├── unit/                            # Testes unitários das regras de negócio
│   ├── integration/                     # Testes de integração e rotas/APIs
│   └── mocks/                           # Mocks e dados de teste
│
└── start_dev_universal.md               # Este arquivo mestre universal de inicialização
```

---

## 3. Descrição dos Diretórios e Funções de Cada Arquivo

| Diretório / Arquivo | Função e Responsabilidade |
| :--- | :--- |
| **`.github/copilot-instructions.md`** | **Instrução de Sistema Permanente.** Lida automaticamente pelo agente de IA em todas as sessões. Define os padrões imutáveis de código, arquitetura, boas práticas e comandos de teste da linguagem escolhida. |
| **`.github/skills/`** | **Repositório de Habilidades (*Skills*).** Contém subpastas para cada fluxo de trabalho especializado. O agente lê os metadados YAML e carrega o arquivo `SKILL.md` apenas quando a tarefa precisa. |
| **`.vscode/mcp.json`** | **Conectores de Ferramentas (Model Context Protocol).** Permite que o agente acesse bancos de dados, executores de terminal, APIs externas ou ferramentas de teste automatizado. |
| **`docs/`** | **Documentação Estática (*Contexto Frio*).** Utilizada como fonte de consulta quando o agente precisa entender a arquitetura da aplicação ou validar regras funcionais complexas. |
| **`.project/IDEIA.md`** | **Briefing Inicial.** Registra o problema, o público-alvo, a stack selecionada e a proposta de valor da solução. |
| **`.project/PLANO.md`** | **Plano Mestre de Execução.** Gerado pela skill `writing-plans`. Divide o desenvolvimento em micro-tarefas atômicas (2 a 5 minutos) prontas para execução via TDD. |
| **`.project/STATUS.md`** | **Diário de Bordo do Agente.** Atualizado a cada entrega para registrar o estado atual do código, testes verdes e dívidas técnicas pendentes. |
| **`.project/handoffs/`** | **Persistência Intermediária.** Arquivos temporários de saída de um agente que servem de entrada para o próximo fluxo, garantindo janelas de contexto limpas. |
| **`src/` & `tests/`** | **Código-fonte e Testes.** Código da aplicação e suíte de testes estruturados no padrão idiomático da linguagem/framework escolhido. |

---

## 4. Arquivos Pré-configurados (Templates Universais Prontos para Uso)

### A. Template: `.github/copilot-instructions.md`
```markdown
# Diretrizes Gerais de Desenvolvimento Universal

## 1. Adaptação de Stack e Idiomatismo
- **Linguagem / Framework:** [Definir a tecnologia: ex: Node.js/TypeScript, Python/FastAPI, C#/.NET, Go, Rust, Flutter, etc.]
- **Arquitetura:** Siga separação clara de responsabilidades (Clean Architecture, Hexagonal ou Layered Architecture).
- **Tipagem e Linter:** Mantenha verificação estrita de tipos e siga o padrão do linter oficial da linguagem.
- **Tratamento de Erros:** Trate exceções e erros de forma explícita na camada apropriada. NUNCA silencie erros sem log explicativo.

## 2. Banco de Dados e Serviços
- **Isolamento de Dados:** Encapsule acessos ao banco de dados em Repositórios ou DAOs. NUNCA execute queries ou chamadas de banco diretamente em componentes de UI ou controllers.
- **Migrações:** Toda alteração de esquema de banco de dados deve ser feita via scripts de migration versionados.

## 3. Regras de Desenvolvimento Agêntico
- **Plan First:** Exija a criação ou atualização do arquivo `.project/PLANO.md` antes de gerar códigos de novos recursos.
- **TDD Obrigatório:** Para cada funcionalidade, escreva ou atualize primeiro os testes no diretório de testes (`tests/`), verifique a falha (RED) e somente então escreva o código de produção para passar o teste (GREEN).
- **Verificação no Terminal:** Execute o comando oficial de teste da stack no terminal para validar todas as alterações.
```

---

### B. Template: `.project/IDEIA.md`
```markdown
# Briefing da Solução Beta: [Nome do Projeto]

## 1. Visão Geral do Produto
- **Objetivo:** [Descrição clara em 2 parágrafos sobre o que o software faz]
- **Público-alvo:** [Quem utilizará a aplicação]

## 2. Stack Tecnológica Selecionada
- **Linguagem / Runtime:** [Ex: TypeScript / Node.js 22]
- **Framework Principal:** [Ex: NestJS / FastAPI / ASP.NET Core / Flutter / Next.js]
- **Banco de Dados:** [Ex: PostgreSQL / MongoDB / Firebase / SQLite]
- **Hospedagem / Deploy:** [Ex: Docker / Vercel / AWS / GCP / Azure]

## 3. Escopo Mínimo Viável (MVP / Beta)
- [ ] Autenticação e Gestão de Usuários
- [ ] CRUD Principal da Regra de Negócio
- [ ] Testes Automatizados de Unidade e Integração
- [ ] Pipeline de Build e Deploy
```

---

### C. Template: `.project/PLANO.md`
```markdown
# Plano de Implementação Atômico

## Legenda de Status
- [ ] Pendente
- [/] Em Andamento
- [x] Concluído e Testado

---

## Fase 1: Configuração do Ambiente e Estrutura Base
- [ ] Tarefa 1.1: Configurar dependências base e script de inicialização do projeto.
  - **Verificação:** Executar comando de build/run inicial e verificar execução sem erros.
- [ ] Tarefa 1.2: Criar contrato do repositório principal e estrutura de domínios.
  - **Verificação:** Criar o primeiro arquivo de teste na pasta de testes.

## Fase 2: Implementação de Recursos
- [ ] Tarefa 2.1: Criar modelo de dados e regra de negócio principal.
  - **Verificação:** Executar suíte de testes no terminal e verificar resultado GREEN.
```

---

### D. Template: `.project/STATUS.md`
```markdown
# Status do Projeto e Diário de Bordo

## Estado Atual
- **Última Atualização:** [Data/Hora]
- **Fase Ativa:** Fase 1 - Configuração Inicial
- **Status dos Testes:** Todos os testes passando (GREEN)

## Decisões Arquiteturais Tomadas
- [Decisão 1]: Definição da estrutura de pastas e contratos da aplicação.

## Próximos Passos
- Executar a próxima tarefa listada em `.project/PLANO.md`.
```

---

### E. Template: `.vscode/mcp.json`
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@microsoft/mcp-server-playwright"]
    }
  }
}
```

---

## 5. Templates de Agent Skills Universais (Inspirados no `obra/superpowers`)

As skills abaixo seguem a especificação aberta e adaptam-se a qualquer stack tecnológica:

### Skill 1: `.github/skills/brainstorming/SKILL.md`
```markdown
---
name: brainstorming
description: Ativa antes de iniciar qualquer desenvolvimento ou nova funcionalidade. Explora os requisitos, faz perguntas esclarecedoras e produz uma especificação clara.
---

# Brainstorming & Refinamento de Requisitos

## Diretrizes
1. NUNCA comece a escrever código imediatamente após receber uma ideia genérica.
2. Faça de 2 a 3 perguntas investigativas por vez para entender o objetivo, as regras de negócio e os impactos de arquitetura.
3. Apresente o entendimento consolidado em pequenos blocos para validação do usuário.
4. Ao final da discussão, crie ou atualize o arquivo `.project/IDEIA.md` e a documentação em `docs/` com as decisões aprovadas.
```

---

### Skill 2: `.github/skills/writing-plans/SKILL.md`
```markdown
---
name: writing-plans
description: Ativa após a aprovação do design/requisitos. Transforma a especificação em um plano de implementação com tarefas atômicas (2 a 5 minutos) ordenadas por TDD.
---

# Escrita de Planos de Implementação

## Diretrizes
1. Leia o arquivo `.project/IDEIA.md` e a arquitetura do projeto.
2. Quebre a implementação em tarefas pequenas, atômicas e incrementais.
3. Para cada tarefa, especifique:
   - Os caminhos exatos dos arquivos envolvidos (`src/...`, `tests/...`).
   - O teste que deve ser criado/executado primeiro.
   - O critério claro de aceite.
4. Escreva a saída estruturada diretamente no arquivo `.project/PLANO.md`.
```

---

### Skill 3: `.github/skills/test-driven-development/SKILL.md`
```markdown
---
name: test-driven-development
description: Executa o ciclo TDD (RED-GREEN-REFACTOR) usando o test runner nativo da stack para garantir a qualidade do software.
---

# Test-Driven Development (TDD) Universal

## Diretrizes e Ciclo Obrigatório
1. **Identificar o Test Runner:** Verifique o comando de teste configurado no projeto (ex: `pytest`, `npm test`, `dotnet test`, `go test`, `cargo test`, `flutter test`).
2. **Fase RED:** Escreva o teste automatizado para a funcionalidade antes de alterar o código de produção. Executar o comando de teste no terminal e confirmar a falha esperada.
3. **Fase GREEN:** Escreva o código mínimo necessário em `src/` para fazer o teste passar. Re-executar o comando no terminal.
4. **Fase REFACTOR:** Limpe o código, elimine duplicações e confirme que 100% da suíte de testes continua verde.
```

---

### Skill 4: `.github/skills/systematic-debugging/SKILL.md`
```markdown
---
name: systematic-debugging
description: Processo rigoroso de 4 fases para investigar e corrigir bugs no código sem fazer adivinhações.
---

# Depuração Sistemática de Código

## As 4 Fases de Diagnóstico
1. **Isolamento da Evidência:** Inspecione os logs do terminal, tracebacks de erro ou logs do servidor.
2. **Formulação de Hipótese:** Identifique a causa raiz exata antes de modificar qualquer arquivo.
3. **Teste de Regressão:** Escreva um teste que reproduza a falha detectada.
4. **Correção Mínima:** Aplique a correção, valide a suíte completa de testes no terminal e registre o aprendizado no `.project/STATUS.md`.
```

---

### Skill 5: `.github/skills/build-and-deploy/SKILL.md`
```markdown
---
name: build-and-deploy
description: Executa a compilação/build da aplicação e realiza o deploy automatizado no ambiente de destino.
---

# Build e Deploy Universal

## Workflow de Publicação
1. Garanta que todos os testes automatizados estejam verdes executando a suíte de testes.
2. Realize a etapa de compilação/build da aplicação (ex: `docker build`, `npm run build`, `dotnet publish`).
3. Execute os scripts de verificação de ambiente e o comando de deploy.
4. Atualize o arquivo `.project/STATUS.md` com os logs e o link/status da implantação.
```
