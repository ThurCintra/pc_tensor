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

/** Substituto do MediaKeySender: registra as teclas sem apertar nada de verdade no PC. */
function createFakeMediaKeys({ fail = null } = {}) {
  const presses = [];
  return {
    presses,
    press: async (command) => {
      if (fail) throw new Error(fail);
      presses.push(command);
    },
    stop: () => {},
  };
}

module.exports = { createFakeExec, createFakeMediaKeys, tasklistOutput };
