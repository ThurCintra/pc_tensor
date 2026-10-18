# Diretrizes Gerais de Desenvolvimento - PC Sentinel

## 1. Adaptação de Stack e Idiomatismo
- **Stack:** JavaScript / Node.js, Electron (Desktop), React para a interface.
- **Banco de Dados:** MongoDB / NoSQL (para telemetria histórica e logs).
- **Testes:** Vitest / Jest para testes de unidade e integração.
- **Arquitetura Electron:**
  - Separação estrita entre **Main Process** (coleta de métricas do SO, I/O, MongoDB, janelas) e **Renderer Process** (React UI).
  - Comunicação segura obrigatoriamente via `preload.js` com `contextBridge` e `ipcRenderer/ipcMain` (sem `nodeIntegration: true` no Renderer).
  - Isolamento de contexto ativo (`contextIsolation: true`).
- **Tratamento de Erros:** Não silenciar falhas de leitura de hardware ou conexão com MongoDB; logar com clareza e expor estados de fallback/degradação suave na UI.

## 2. Banco de Dados e Serviços
- **Isolamento de Dados:** Encapsule chamadas ao MongoDB em serviços ou repositórios dedicados dentro do Main Process. O Renderer nunca acessa o banco de dados diretamente.
- **Resiliência:** Se o MongoDB local ou remoto estiver offline, a aplicação deve continuar exibindo métricas em tempo real sem travar.

## 3. Regras de Desenvolvimento Agêntico
- **Plan First:** Atualize sempre o `.project/PLANO.md` antes de implementar novas etapas.
- **TDD Obrigatório:** Escreva testes unitários para os coletores, conversores de unidades e regras de negócio antes de integrá-los à UI.
- **Terminal e Verificação:** Executar testes e verificar compilação/execução no terminal Windows (Powershell).
