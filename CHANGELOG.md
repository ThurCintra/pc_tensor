# Changelog

Mudanças relevantes do PC Sentinel. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

## [1.4.0] - 2026-10-25

### Adicionado

- **Pit Wall como HUD de mesa:** *Tela sempre ativa* (Screen Wake Lock: o celular não apaga a tela enquanto o PC está
  ao vivo e volta a segurar quando a aba reaparece) e *Proteção OLED* (fundo preto absoluto e deslocamento de 1 px por
  minuto contra burn-in). As duas preferências ficam salvas em cada aparelho.
- **Regras de perfil do usuário:** comandos `SET_PROFILE_RULE`, `REMOVE_PROFILE_RULE` e `GET_PROFILE_RULES` no
  contrato v2 para classificar qualquer jogo ou programa (ex.: `meu_jogo.exe` como FPS competitivo). A regra vence as
  listas fixas e fica salva no SQLite do serviço.
- **Modo eco:** com a janela minimizada ou escondida, as métricas não são enviadas ao renderer; coleta, alertas,
  celular e serviço nativo seguem iguais, e a leitura mais recente aparece na hora ao restaurar.

### Corrigido

- Sensores sem disputa entre o serviço nativo e a ponte legada: com o serviço no ar, o app usa as leituras dele e a
  ponte roda só com os contadores de I/O de disco (`--no-hardware`), sem abrir o LibreHardwareMonitor; sem o
  serviço, a ponte volta sozinha ao modo completo.
- Juiz de Lag sem perda de pacote falsa: cada alvo de ping recebe no máximo um pacote por segundo (antes um gateway
  lento podia colar dois pings seguidos ao 1.1.1.1, que os descartava), e a latência do fallback TCP é medida com
  relógio de alta resolução.
- O servidor do celular nunca usa a porta 3891 (do serviço nativo) como alternativa quando a 3890 está ocupada.
- A publicação do serviço falha se alguma biblioteca nativa ficar fora do executável único, e a release não procura
  mais certificado de assinatura no runner.

## [1.3.1] - 2026-10-25

### Corrigido

- Os botões de mídia (*Controles*, no PC e no celular) não funcionavam: o app usava `SendKeys([char]179)`, que
  digita um caractere em vez de apertar a tecla de mídia, e abria um PowerShell novo a cada clique. Agora eles
  apertam as teclas de mídia e volume do Windows de verdade (como as do teclado), funcionando com Spotify, YouTube
  e o volume do sistema, e respondem na hora.

## [1.3.0] - 2026-10-24

### Adicionado

- **pc_tensor Cloud** (`cloud/`, Etapas 1 e 2): base do painel web multiusuário.
  - Banco PostgreSQL com Prisma 7 (usuários, contas OAuth, computadores, códigos de pareamento, histórico e
    alertas) e migração inicial.
  - Site Next.js 16 com Auth.js: cadastro e login por e-mail e senha (Argon2id), Google e GitHub com conferência
    de e-mail verificado, recuperação de senha por link de uso único e limite de tentativas.
  - API de computadores e pareamento por código de 6 dígitos (5 minutos, uso único, `DeviceToken` guardado só
    como hash).
  - Servidor de tempo real Socket.IO com autenticação separada para PCs e navegadores, salas por computador,
    presença (`HEARTBEAT` de 60 s sem espectadores, `LIVE` de 250 ms com o painel aberto), comandos só da lista
    permitida e detecção de travamento sob carga.
  - 30 testes com PostgreSQL em memória (PGlite) e job próprio no CI.
- **Agente da nuvem** (Etapa 3) no serviço nativo: pareamento pelo app (*Configurações → pc_tensor Cloud*) ou por
  `--pair`, token cifrado com DPAPI, conexão reversa com reconexão exponencial, modos HEARTBEAT/LIVE com fila
  offline, alertas de superaquecimento pelos limites do site e comandos só da lista permitida. Teste de ponta a
  ponta com o serviço real (`npm run e2e:agent` em `cloud/`).
- O servidor de tempo real derruba em até 1 minuto a conexão de um PC removido no site.
- **Site da nuvem** (Etapa 4): telas de entrar, cadastrar e recuperar senha; "Meus Computadores" com o status de
  cada PC ao vivo (online, em jogo, alerta térmico, offline) e as temperaturas; modal de pareamento com o código
  de 6 dígitos e confirmação automática; ajustes por PC (nome, limites de alerta, remoção) e página da conta com
  a tarifa de energia. Os limites alterados no site chegam ao PC em até 1 minuto.
- `npm run db:dev` em `cloud/`: PostgreSQL local para desenvolver sem criar banco na nuvem (dados em
  `~/.pc-tensor-cloud/pglite`, fora do projeto).
- **Painel ao vivo de cada PC no site** (Etapa 5): Bento Grid camaleão com os cards do Pit Wall, Raio-X térmico em
  SVG, taxímetro em reais com o mês somado na nuvem e projeção, caixa preta dos últimos 60 s com Post-Mortem
  automático quando o servidor confirma um travamento, vibração no celular e Stutter Buster remoto.
- **Atualizações nas Configurações**: seção no topo com a versão instalada, o estado da busca (com o progresso do
  download), quando foi a última verificação, os botões *Verificar agora* e *Reiniciar e atualizar*, o link para
  as novidades da versão no GitHub e a opção de procurar atualizações ao abrir o app.

## [1.2.1] - 2026-10-24

### Corrigido

- O Pit Wall trocava de layout várias vezes por segundo (o Raio-X mudava de tamanho sozinho). Um app fora da
  lista de jogos virava "jogo pesado" com a GPU acima de 70% e voltava logo abaixo disso, e o próprio PC Sentinel
  em foco entrava nessa regra. Agora o app em si nunca conta como jogo, a GPU tem folga (entra em 70%, sai abaixo
  de 40%) e o perfil só muda depois de 3 segundos seguidos.
- Em desenvolvimento, o app abria o serviço publicado em `build/service` mesmo quando o compilado depois era mais
  novo; agora usa sempre o mais recente.

## [1.2.0] - 2026-10-24

### Adicionado

- **Pit Wall**: nova página (no PC e no celular) que muda de layout conforme o que está aberto no PC — FPS
  competitivo, jogo gráfico pesado, trabalho ou uso leve.
  - Temperatura de CPU e GPU com tendência e contagem regressiva até o limite (throttling).
  - Juiz de Lag: diz se o travamento no jogo é culpa da rede, de um gargalo de CPU ou da memória de vídeo cheia.
  - Raio-X: o gabinete desenhado com cada peça colorida pela temperatura real e as ventoinhas na rotação lida.
  - Taxímetro de energia: quanto a sessão e o mês estão custando em reais, com a tarifa da sua conta.
  - Stutter Buster: um botão que libera o cache de memória do Windows e baixa a prioridade de navegadores e
    launchers por 5 minutos (exige o app aberto como administrador).
  - Saúde térmica: avisa quando o PC esquenta mais que há semanas com o mesmo consumo (poeira ou pasta térmica).
  - Eficiência do silício: MHz por watt e estabilidade da tensão sob carga.
- **Caixa preta**: o celular guarda os últimos 60 segundos de telemetria. Se o PC travar ou der tela azul, abre o
  **Post-Mortem** com a linha do tempo até o milissegundo da queda e os picos de temperatura, potência e VRAM.
- Vibração no celular durante jogos: 2 toques curtos para problema de rede, 3 médios para "vai esquentar" e longa
  para temperatura crítica.
- **Atualização automática**: o app procura versões novas sempre que abre, baixa em segundo plano e instala ao
  reiniciar (aviso "Reiniciar e atualizar" ou Configurações → Atualizações). Vale a partir desta versão.
- Serviço de telemetria nativo (.NET 10), iniciado junto com o app, com histórico em SQLite. O instalador libera
  a porta 3891 no firewall para o celular.

### Alterado

- Versões no padrão de projetos grandes (Versionamento Semântico) a partir da 1.0.0: as antigas 0.1.0 e 0.2.0 são
  a 1.0.0 e a 1.1.0.
- Electron, React 19 e demais dependências atualizados.

### Corrigido

- Com a porta 3890 ocupada por outro programa, o app mostrava "A JavaScript error occurred in the main process" e
  não abria; agora usa a porta seguinte.
- A página Hardware não faz mais uma renderização extra ao abrir.

### Para desenvolvedores

- TypeScript (`npm run typecheck`), Tailwind 4 nas telas novas e configurações do Vite em `.mjs`.
- Contrato do WebSocket v2 em `docs/contrato-websocket.md`; serviço em `service/` com 40 testes xUnit.
- `PC_SENTINEL_DATA_DIR` roda uma cópia de desenvolvimento ao lado do app instalado.

## [1.1.0] - 2026-10-24

### Alterado

- Estrutura do projeto reorganizada: `src/main` dividido em janelas, bandeja, IPC e sistema; telemetria em
  `src/main/telemetry` (ponte de sensores, LibreHardwareMonitor, métricas nativas e inventário de hardware).
- O snapshot simulado saiu do código do app; os testes usam fontes simuladas injetadas no coletor.
- Ponte de sensores: código C# em `native/sensor-bridge/` e executável com as DLLs em `resources/sensor-bridge/`,
  sem os arquivos da interface gráfica do LibreHardwareMonitor (~5 MB a menos no instalador).
- Electron 34 (sem suporte) atualizado para o 44, corrigindo as falhas de segurança conhecidas; Vitest 3 → 4.
  `npm audit` sem vulnerabilidades.
- React e React DOM passam a ser só dependências de build (já vão embutidos na interface compilada).
- A versão exibida na página Hardware vem do `package.json`.

### Adicionado

- ESLint, Prettier e EditorConfig, com `npm run lint`, `npm run format` e `npm run check`.
- Licença MIT, avisos de licença de terceiros, guia de contribuição, política de segurança e modelos de
  issue e pull request.
- Dependabot para dependências npm e GitHub Actions.

### Corrigido

- A página Hardware dizia que havia temperatura de GPU mesmo sem nenhum sensor.
- Os testes gravavam `thermal_history.json` na raiz do projeto.

## [1.0.0] - 2026-10-23

Primeira versão publicada.

- Telemetria em tempo real de CPU, GPU, memória, discos, rede e processos, com temperaturas reais pela ponte
  de sensores (LibreHardwareMonitorLib).
- Histórico térmico, relatório de sessões de carga e alertas de temperatura com notificação do Windows.
- Acesso pelo celular na rede local (PWA) com pareamento por QR Code e token revogável.
- Controles remotos: encerrar processo, plano de energia, Modo Boost e mídia.
- Instalador para Windows com início automático e liberação da porta no firewall.

[Não lançado]: https://github.com/ThurCintra/pc_tensor/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/ThurCintra/pc_tensor/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/ThurCintra/pc_tensor/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/ThurCintra/pc_tensor/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/ThurCintra/pc_tensor/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/ThurCintra/pc_tensor/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ThurCintra/pc_tensor/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ThurCintra/pc_tensor/releases/tag/v1.0.0
