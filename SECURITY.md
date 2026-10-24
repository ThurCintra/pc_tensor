# Política de segurança

## Versões com suporte

Só a versão mais recente publicada em [Releases](https://github.com/ThurCintra/pc_tensor/releases) recebe correções
de segurança.

## Como relatar uma vulnerabilidade

Não abra uma issue pública. Use o relato privado do GitHub:
**Security → Report a vulnerability** neste repositório.

Inclua o passo a passo para reproduzir, a versão afetada e o impacto esperado. A resposta inicial vem em até 7 dias.

## Escopo

O PC Sentinel roda como administrador e expõe um servidor na rede local para o celular. São especialmente
relevantes:

- acesso à API ou ao WebSocket sem o token de pareamento;
- execução de comandos ou encerramento de processos fora da lista permitida;
- exposição do token ou de dados da máquina para outras origens.
