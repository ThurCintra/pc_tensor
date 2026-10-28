/**
 * Baixa o instalador oficial do PawnIO (driver que o LibreHardwareMonitor usa para ler temperatura, clock e
 * potência da CPU) para build/pawnio, de onde o instalador do PC Sentinel o copia e o executa quando o driver
 * ainda não está no PC. Sem ele, a CPU fica sem temperatura. Uso: npm run build:pawnio
 *
 * Versão e hash fixos: só um arquivo idêntico ao publicado em github.com/namazso/PawnIO.Setup entra no instalador.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = '2.2.0';
const URL = `https://github.com/namazso/PawnIO.Setup/releases/download/${VERSION}/PawnIO_setup.exe`;
const SHA256 = '1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032';

const output = path.join(__dirname, '..', 'build', 'pawnio', 'PawnIO_setup.exe');

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

async function main() {
  if (fs.existsSync(output) && sha256(fs.readFileSync(output)) === SHA256) {
    console.log(`[fetch-pawnio] PawnIO ${VERSION} já baixado.`);
    return;
  }

  const response = await fetch(URL);
  if (!response.ok) throw new Error(`download falhou (HTTP ${response.status})`);
  const data = Buffer.from(await response.arrayBuffer());

  const actual = sha256(data);
  if (actual !== SHA256) throw new Error(`hash diferente do esperado (${actual})`);

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, data);
  console.log(`[fetch-pawnio] PawnIO ${VERSION} salvo em ${path.relative(process.cwd(), output)}`);
}

main().catch((err) => {
  console.error('[fetch-pawnio] Erro:', err.message);
  process.exit(1);
});
