/**
 * Publica o serviço nativo (service/PcSentinel.Service) em build/service: um executável com o runtime .NET
 * embutido, copiado pelo instalador para resources/service. Uso: npm run build:service
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const project = path.join(root, 'service', 'PcSentinel.Service', 'PcSentinel.Service.csproj');
const output = path.join(root, 'build', 'service');

if (process.platform !== 'win32') {
  console.log('[build-service] Ignorado: o serviço nativo é só para Windows.');
  process.exit(0);
}

// dotnet no PATH, ou instalado só para o usuário (dotnet-install.ps1) ou para todos
const dotnet = [
  'dotnet',
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'dotnet', 'dotnet.exe'),
  path.join(process.env.ProgramFiles || 'C:/Program Files', 'dotnet', 'dotnet.exe'),
].find((candidate) => {
  try {
    execFileSync(candidate, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});

if (!dotnet) {
  console.error('[build-service] .NET 10 SDK não encontrado. Instale com: winget install Microsoft.DotNet.SDK.10');
  process.exit(1);
}

// Um único .exe com o runtime e as bibliotecas nativas (e_sqlite3.dll, drivers do LibreHardwareMonitor) dentro,
// extraídas na primeira execução. Repetido aqui de propósito: uma mudança no .csproj não pode gerar um serviço
// que só funciona em PC com .NET ou com as DLLs soltas ao lado.
const PUBLISH_PROPERTIES = [
  '-p:SelfContained=true',
  '-p:PublishSingleFile=true',
  '-p:IncludeNativeLibrariesForSelfExtract=true',
];

fs.rmSync(output, { recursive: true, force: true });
try {
  execFileSync(dotnet, ['publish', project, '-c', 'Release', '-o', output, '--nologo', ...PUBLISH_PROPERTIES], {
    stdio: 'inherit',
    env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' },
  });
} catch {
  console.error('[build-service] Falha ao publicar o serviço nativo.');
  process.exit(1);
}

// O instalador copia a pasta inteira, mas uma DLL nativa solta indica que ela ficou fora do .exe: em PC limpo,
// sem ela, o serviço não abre o SQLite. Melhor falhar aqui do que no PC do usuário.
const looseLibraries = fs.readdirSync(output).filter((file) => file.toLowerCase().endsWith('.dll'));
if (looseLibraries.length > 0) {
  console.error(`[build-service] Bibliotecas fora do executável: ${looseLibraries.join(', ')}.`);
  process.exit(1);
}
if (!fs.existsSync(path.join(output, 'pc-sentinel-service.exe'))) {
  console.error('[build-service] pc-sentinel-service.exe não foi gerado.');
  process.exit(1);
}
console.log(`[build-service] Serviço publicado em ${path.relative(root, output)} (executável único)`);
