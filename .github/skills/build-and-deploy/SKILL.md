---
name: build-and-deploy
description: Executa a compilação/build da aplicação e realiza o deploy automatizado no ambiente de destino.
---

# Build e Deploy Universal

## Workflow de Publicação
1. Garanta que todos os testes automatizados estejam verdes executando a suíte de testes.
2. Realize a etapa de compilação/build da aplicação (ex: `docker build`, `npm run build`, `dotnet publish`).
3. Execute os scripts de verificação de ambiente e o comando de deploy.
4. Atualize o arquivo `.project/STATUS.md` com os logs e o link/status da implantação.
