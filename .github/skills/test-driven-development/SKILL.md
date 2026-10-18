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
