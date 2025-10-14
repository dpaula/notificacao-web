# 1. Visão Geral do Projeto

- **Nome:** `notificacao-web`  
- **Descrição:** Sistema de notificações web desenvolvido para envio e gerenciamento de alertas, baseado em push notifications.  
- **Hospedagem:** O projeto é implantado no **EasyPanel**, com deploy automático a cada commit realizado na branch principal (`main`).  
- **Repositório GitHub:** [github.com/dpaula/notificacao-web](https://github.com/dpaula/notificacao-web)  
- **Branch principal:** `main`  
- **Build Path:** `/`  
- **Build Tool:** **Nixpacks** (versão `1.34.1`)  
- **Instalação / Build / Execução:**  
  ```bash
  npm install
  npm run build
  npm run start
  ```
- **Stack esperada:** Node.js + Vite (ou outro bundler front-end) — atualmente implementado com React + TypeScript e bundler `esbuild` integrado via script `build.js`.  
- **Propósito principal:** Plataforma focada em habilitar, validar e operar envios de notificações push para navegadores. A aplicação facilita que usuários concedam permissão, assinem o serviço e testem notificações em tempo real, enquanto o backend expõe APIs autenticadas para disparo centralizado de alertas usando VAPID keys.  
- **Regras de negócio:**  
  - Obrigatoriedade das variáveis VAPID e `API_TOKEN` para inicialização do servidor; falta de qualquer chave encerra o processo (`server.js`).  
  - Registro automático da assinatura do usuário no endpoint `/api/push/register`, permitindo que o backend mantenha o último subscription em memória para disparos simples.  
  - Rotas de envio (`/api/push/simple` e `/api/push/send`) exigem token Bearer válido e payloads com título/corpo; requisições inválidas retornam erros 4xx e, em caso de subscription expirada, o backend limpa o registro.  
  - Verificação cruzada de VAPID key entre frontend e backend (`/api/vapid-key`) bloqueia ações quando há divergência e orienta o reset da aplicação.  
  - Configuração de CORS baseada em `ALLOWED_ORIGINS`, com fallback para `notify.autevia.com.br`, garantindo que apenas domínios aprovados acessem as APIs.  
- **Integrações externas:**  
  - Serviço Web Push dos navegadores via biblioteca `web-push`, utilizando VAPID para autenticação junto aos push services (ex.: FCM).  
  - Service Worker `sw.js` responsável por exibir notificações, responder a cliques e disparar testes locais por mensagem do cliente.  
  - Tailwind CSS via CDN para composição de UI sem build adicional.  
- **Arquitetura identificada:**  
  - *Frontend:* React + TypeScript (arquivos `App.tsx`, `index.tsx`, ícones em `components/`), compilado por `esbuild` para `/dist`.  
  - *Backend:* Express (`server.js`) que serve estáticos, valida variáveis de ambiente, gerencia CORS e oferece APIs de push autenticadas.  
  - *Service Worker:* `sw.js` tratador de push, clique e mensagens internas, habilitando testes offline e ações de foco da aba.

# 2. Variáveis de Ambiente (ENV) no EasyPanel

```
VITE_VAPID_PUBLIC_KEY=BHMWrBKqTN6Td2K_TB9jJfVTFLADKILqLxUQBy6m4aRIiC5WW09MiYbyjA7BAjM8EtD0ywqzrSmSAgGrfyy-DRE
VAPID_PRIVATE_KEY=T8c8opWZ-0x0UNJDfQhduXeIFEA0JFat7mDZPIonLv0
VAPID_SUBJECT=mailto:fernando.dpaula@gmail.com
API_TOKEN=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
ALLOWED_ORIGINS=https://notify.autevia.com.br/
```

**DNS e Domínio**
- https://notify.autevia.com.br/

# 3. Análise Automática Solicitada ao Agente

O Codex CLI deverá:
1. Analisar todo o código-fonte para identificar propósito, regras de negócio e componentes principais.
2. Mapear a arquitetura (front/back, serviços, libs).
3. Gerar um resumo técnico e funcional do sistema.
4. Atualizar automaticamente este arquivo `agents.md`, preenchendo as seções marcadas com ⟵ completar pelo agente.
5. Validar que o deploy no EasyPanel reflete a versão mais recente do código após cada commit.

# 4. Checklist de Execução do Agente

- Verificar se o repositório main está sincronizado.
- Confirmar que o build (`npm run build`) gera a pasta de distribuição correta.
- Validar a execução do comando `npm run start`.
- Conferir se as variáveis `.env` estão configuradas no EasyPanel.
- Atualizar a documentação das regras de negócio.
- Atualizar dependências e relatar vulnerabilidades se encontradas.

# 5. Recursos Adicionais

- Documentação do EasyPanel: https://docs.easypanel.io
- Documentação do Nixpacks: https://nixpacks.com/docs
- Repositório GitHub: https://github.com/dpaula/notificacao-web
