# Prompt de preparação do projeto para rodar no EasyPanel (Nixpacks / Node)

Use este texto como checklist em qualquer projeto web similar para que o deploy via EasyPanel (Nixpacks) funcione sem ajustes manuais no painel.

```
Objetivo: preparar o repositório para ser implantado no EasyPanel com Nixpacks.

1) Scripts obrigatórios no package.json
   - "build": comando que gera saída estática em ./dist (ex.: "node build.js" ou "vite build")
   - "start": servidor HTTP que:
       * lê a porta de process.env.PORT (fallback 8080)
       * serve arquivos estáticos de ./dist
       * faz fallback de rota para dist/index.html em apps SPA
     Exemplo minimalista:
       const express = require('express');
       const path = require('path');
       const app = express();
       const port = process.env.PORT || 8080;
       app.use(express.static(path.join(__dirname, 'dist')));
       app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
       app.listen(port, () => console.log(`listening on ${port}`));

2) Build reproducível
   - O build deve funcionar com `npm install && npm run build`.
   - Gere tudo dentro de ./dist (HTML/JS/CSS/manifest/sw, etc.).
   - Evite dependências de binários do sistema; mantenha somente npm deps.

3) Compatibilidade Nixpacks
   - Não dependa de apt-get/pacotes SO; se precisar, adicione script de fallback.
   - Commitar package-lock.json ou pnpm-lock.yaml para pins determinísticos.
   - Opcional: defina "type": "commonjs" ou "module" conforme seu server.js.

4) Estrutura esperada
   - Raiz do repo contém package.json e scripts acima.
   - Caminho de build usado pelo painel: "/" (não usar monorepo sem ajustar).
   - Saída do build: ./dist.

5) Teste local antes de subir
   - npm install
   - npm run build
   - PORT=8080 npm run start
   - Acessar http://localhost:8080 e verificar se assets são servidos de dist.

Resultado: com essa estrutura, basta apontar o EasyPanel para o repo (branch main, build path "/") e usar os comandos npm install / npm run build / npm run start no Nixpacks. Deploys em novos commits funcionarão sem steps extras.
```
