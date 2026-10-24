/**
 * Compila a ponte de sensores (tools/LibreHardwareMonitor/pc-sensor-bridge.cs) com o
 * compilador C# que acompanha o .NET Framework 4 do Windows. Substitui o passo que ficava no
 * iniciar.bat. Uso: npm run build:bridge
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const toolsDir = path.join(__dirname, '..', 'tools', 'LibreHardwareMonitor');
const source = path.join(toolsDir, 'pc-sensor-bridge.cs');
const output = path.join(toolsDir, 'pc-sensor-bridge.exe');

if (process.platform !== 'win32') {
  console.log('[build-bridge] Ignorado: a ponte de sensores só compila no Windows.');
  process.exit(0);
}

const windir = process.env.WINDIR || 'C:\\Windows';
const csc = [
  path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
].find((p) => fs.existsSync(p));

if (!csc) {
  console.error('[build-bridge] csc.exe não encontrado. Instale o .NET Framework 4.x.');
  process.exit(1);
}

const references = ['LibreHardwareMonitorLib.dll', 'HidSharp.dll'].map((dll) => path.join(toolsDir, dll));

try {
  execFileSync(csc, [
    '/nologo',
    '/target:exe',
    `/out:${output}`,
    `/reference:${references.join(',')}`,
    source,
  ], { stdio: 'inherit' });
  console.log(`[build-bridge] Ponte compilada: ${path.relative(process.cwd(), output)}`);
} catch (err) {
  console.error('[build-bridge] Falha ao compilar a ponte de sensores.');
  process.exit(1);
}
