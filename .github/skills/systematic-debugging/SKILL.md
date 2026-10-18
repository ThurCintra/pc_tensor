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
