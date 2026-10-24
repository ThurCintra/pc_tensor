/**
 * Substituto de child_process.execFile para os testes: registra as chamadas e
 * responde com o resultado configurado por comando, sem executar nada no sistema.
 */
function createFakeExec(handlers = {}) {
  const calls = [];
  const fakeExec = (cmd, args = [], opts, cb) => {
    const callback = typeof opts === 'function' ? opts : cb;
    calls.push({ cmd, args });
    const handler = handlers[cmd];
    const result = handler ? handler(args) || {} : {};
    setImmediate(() => callback && callback(result.error || null, result.stdout || '', result.stderr || ''));
  };
  fakeExec.calls = calls;
  return fakeExec;
}

function tasklistOutput(name, pid) {
  return `"${name}","${pid}","Console","1","12.345 K"\r\n`;
}

module.exports = { createFakeExec, tasklistOutput };
