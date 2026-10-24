# PC Sentinel

<p align="center">
  <img src="assets/icon.png" width="72" alt="" />
</p>

Monitor de hardware para Windows: temperaturas, uso de CPU, memória, discos e rede em tempo real, com
alertas quando o PC esquenta e acesso pelo celular na mesma rede Wi-Fi.

Feito com Electron + React. O visual segue o Windows 11 e acompanha o tema claro ou escuro do sistema.

## Funcionalidades

- **Visão geral:** temperatura e uso de CPU e GPU, memória, latência de rede, uso por núcleo, ocupação e
  velocidade dos discos, outros sensores (placa-mãe, SSD, ventoinha) e diagnóstico de gargalo.
- **Histórico:** gráficos de temperatura e uso dos últimos 2, 5 ou 15 minutos, com mínimo, média e máximo,
  e o resumo da última sessão de carga (jogo, renderização).
- **Processos:** os programas que mais consomem, com opção de encerrar (processos do Windows são protegidos).
- **Controles:** mídia (tocar/pausar, faixas, volume), plano de energia e Modo Boost, que fecha apps em
  segundo plano para liberar memória.
- **Hardware:** sistema, placa-mãe, processador, placa de vídeo, memória, discos e rede; copiar resumo ou
  exportar em JSON.
- **Alertas de temperatura:** notificação do Windows, aviso no app e vibração no celular quando CPU ou GPU
  passam do limite configurado.
- **Celular:** o mesmo app abre no navegador do celular pelo QR Code, sem instalar nada (pode ser adicionado
  à tela inicial).
- **Modo compacto:** barra pequena sempre visível com CPU, GPU e RAM.

Sem sensor disponível, o app mostra "Sem sensor" em vez de estimar valores.

## Instalação (uso normal)

1. Baixe o `PC-Sentinel-Setup.exe` da [última release](https://github.com/ThurCintra/pc_tensor/releases/latest)
   ou gere o instalador (veja abaixo).
2. Rode o instalador. Ele cria os atalhos e libera a porta do celular no firewall.
3. Abra o **PC Sentinel** pelo menu Iniciar. O Windows pede permissão de administrador ao abrir: ela é
   necessária para ler as temperaturas.

Fechar a janela mantém o app na bandeja do sistema; para sair, use **Sair** no ícone da bandeja.

## Desenvolvimento

Pré-requisitos: Windows 10/11 x64 e Node.js 18 ou superior.

```bash
npm install
```

```bash
npm run dev
```

Abre o app com recarga automática ao editar a interface. Para ler temperaturas durante o desenvolvimento,
rode o terminal como administrador.

| Comando | O que faz |
|---|---|
| `npm run dev` | App em modo de desenvolvimento (Vite + Electron) |
| `npm start` | Compila a interface e abre o app (no app, **Configurações → Reiniciar como administrador** libera os sensores) |
| `npm test` | Testes unitários (Vitest) |
| `npm run build` | Compila a interface em `dist/` |
| `npm run build:bridge` | Recompila a ponte de sensores C# (`tools/LibreHardwareMonitor/pc-sensor-bridge.exe`) |
| `npm run dist` | Gera o instalador em `release/PC-Sentinel-Setup.exe` |

### Publicar uma release

```bash
npm version patch
git push --follow-tags
```

`npm version` (ou `minor`/`major`) atualiza a versão e cria a tag `vX.Y.Z`. Ao receber a tag, o GitHub Actions
roda os testes, gera o instalador e publica a release com o `PC-Sentinel-Setup.exe` anexado.

## Celular

No PC, abra **Celular** e leia o QR Code com a câmera. O link leva um código de pareamento que permite ver a
telemetria e usar os controles, então compartilhe só com aparelhos seus. Para desconectar todos os
aparelhos, use **Desconectar todos os aparelhos** na mesma tela.

Se o celular não abrir a página, confira se os dois estão na mesma rede e se a porta (padrão 3890) está
liberada no firewall. O instalador e o app rodando como administrador criam a regra
`PC Sentinel LAN (3890)` sozinhos.

## Configurações

Ficam em `%APPDATA%\pc-sentinel\settings.json` e podem ser alteradas na tela **Configurações**:

- limites de temperatura de CPU e GPU (50 a 105 °C) e intervalo mínimo entre avisos;
- iniciar com o Windows (no app instalado);
- porta do servidor do celular;
- lista de apps fechados pelo Modo Boost.

O histórico térmico de longo prazo fica em `%APPDATA%\pc-sentinel\thermal_history.json`.

## Estrutura

```
src/
├── main/                  Processo principal do Electron
│   ├── main.js            Janela, bandeja, IPC, loop de métricas, reinício como admin
│   ├── collector.js       Coleta de sensores (ponte C#, systeminformation, APIs do Node)
│   ├── settings-store.js  Preferências e código de pareamento
│   ├── thermal-alerts.js  Alertas de temperatura
│   └── …                  Rede, processos, sessões de carga, histórico térmico
├── preload/preload.js     Ponte segura entre a interface e o processo principal
├── renderer/              Interface React (mesma para desktop e celular)
│   ├── App.jsx            Navegação e estrutura
│   ├── pages/             Visão geral, Histórico, Processos, Controles, Hardware, Celular, Configurações
│   ├── components/        Componentes visuais e gráfico
│   ├── lib/transport.js   IPC no desktop, WebSocket/REST no celular
│   └── styles.css         Tema Windows 11 claro/escuro
└── server/                Servidor do celular (API, WebSocket, ações remotas)
scripts/build-bridge.js    Compila a ponte de sensores C#
tools/LibreHardwareMonitor Biblioteca de sensores e a ponte compilada
```

Detalhes de arquitetura e do modelo de segurança em [docs/arquitetura.md](docs/arquitetura.md).
