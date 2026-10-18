# Briefing da Solução Beta: PC Sentinel

## 1. Visão Geral do Produto
- **Objetivo:** O **PC Sentinel** é uma aplicação desktop nativa (Windows) focada no monitoramento em tempo real de hardware e recursos do sistema operacional (CPU, memória RAM, discos/armazenamento, GPU, temperaturas e processos). Ele provê uma interface moderna e intuitiva para visualização de métricas de saúde da máquina, histórico, alertas e **transmissão ao vivo de temperaturas e status de hardware para dispositivos móveis via WebSockets e interface web responsiva (Mobile Live Dashboard)**.
- **Público-alvo:** Usuários avançados de PC, entusiastas, gamers, profissionais de TI e desenvolvedores que buscam um painel centralizado no PC e no celular para acompanhar a telemetria do sistema em tempo real sem precisar alternar janelas enquanto jogam ou realizam tarefas pesadas.

## 2. Stack Tecnológica Selecionada
- **Linguagem / Runtime:** JavaScript / Node.js (Ambiente Desktop nativo)
- **Framework Desktop:** Electron
- **Frontend / UI:** React (com TailwindCSS / CSS moderno e componentes responsivos de alta fidelidade)
- **Transmissão Móvel em Tempo Real (Mobile Live Stream):** Servidor HTTP / WebSocket local integrado no Main Process (`ws` / `socket.io` / `express` ou `fastify`) com geração de QR Code na tela do Electron para conexão instantânea a partir do smartphone via rede Wi-Fi local.
- **Banco de Dados / Armazenamento:** MongoDB / NoSQL (para logs, histórico de telemetria e configurações)
- **Framework de Testes:** Vitest / Jest (com suporte a testes de unidade do core e testes de componentes)
- **Hospedagem / Empacotamento:** Aplicação Desktop nativa para Windows (instalador/executável via Electron-Builder / Electron-Forge)

## 3. Escopo Mínimo Viável (MVP / Versão Beta)
- [ ] **Configuração do Ambiente:** Setup inicial do Electron com React, suporte a IPC seguro (contextIsolation/preload) e pipeline de testes com Vitest.
- [ ] **Coletor de Hardware:** Módulo de telemetria de hardware (CPU, RAM, Discos, GPU e status térmico/temperaturas via bibliotecas de sistema como `systeminformation`).
- [ ] **Servidor Mobile Live (WebSocket / HTTP local):** Servidor local integrado que expõe um endpoint e WebSocket para o celular, exibindo QR Code no app para conectar o smartphone na mesma rede local e acompanhar as temperaturas em tempo real.
- [ ] **Interface / Dashboard Desktop:** Telas e widgets com gráficos em tempo real e visual ultra-moderno/cyberpunk/dark mode.
- [ ] **Interface Web Mobile:** Interface web leve, responsiva e otimizada para navegadores móveis (iOS e Android), recebendo telemetria ao vivo via WebSocket.
- [ ] **Persistência & Histórico:** Integração com MongoDB/NoSQL para registro de picos de uso, histórico de telemetria e preferências do usuário.
- [ ] **Sistema de Alertas:** Notificações desktop e alertas visuais no celular quando limiares críticos forem atingidos (ex.: CPU > 90%, temperatura > 80°C).
- [ ] **Testes Automatizados:** Testes unitários para coletores de telemetria, servidor mobile e regras de cálculo de métricas.
