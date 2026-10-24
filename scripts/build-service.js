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

fs.rmSync(output, { recursive: true, force: true });
try {
  execFileSync(dotnet, ['publish', project, '-c', 'Release', '-o', output, '--nologo'], {
    stdio: 'inherit',
    env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' },
  });
  console.log(`[build-service] Serviço publicado em ${path.relative(root, output)}`);
} catch {
  console.error('[build-service] Falha ao publicar o serviço nativo.');
  process.exit(1);
}
