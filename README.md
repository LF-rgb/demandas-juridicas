# Gestão de Demandas Jurídicas (FRISA)

Lê e-mails de uma caixa Zimbra (IMAP), faz triagem com IA (área, urgência, prazo, responsável, rascunho de resposta) e exibe tudo em um painel web para a equipe revisar.

```
Zimbra (IMAP) -> worker (Node) -> Claude (triagem) -> Supabase <- painel web (Vercel)
```

## Estrutura
- `supabase/schema.sql`: tabelas `membros`, `demandas`, `historico` e políticas RLS.
- `worker/`: serviço que consulta a caixa a cada N segundos e grava as demandas.
- `web/`: painel (HTML estático com supabase-js).

## Passo a passo
1. **Supabase**: crie o projeto, rode `supabase/schema.sql` no SQL Editor, cadastre os usuários da equipe em Authentication e insira os registros em `membros` (nome, e-mail, áreas).
2. **Zimbra**: crie (ou escolha) uma caixa dedicada, por exemplo `juridico@...`, ative IMAP e crie a pasta `Processados`. Use senha de aplicativo se houver 2FA.
3. **Worker**:
   ```
   cd worker && cp .env.example .env   # preencha as variáveis
   npm install
   npm run once    # teste de um ciclo
   npm start       # execução contínua
   ```
   Hospede em um servidor que fique ligado (VPS, Railway, Fly.io, Render). O worker não roda em Vercel por ser um processo contínuo.
4. **Painel**: edite `web/config.js` com a URL e a chave publishable do Supabase e publique a pasta `web/` na Vercel.

## Segurança
- A `service_role key` fica apenas no worker. O painel usa somente a chave publishable, protegida por RLS.
- O conteúdo dos e-mails é tratado como dado, nunca como instrução. Se o e-mail trouxer comandos dirigidos à IA, a triagem os ignora e marca a demanda com alerta (`alerta_injecao`), exibido em destaque no painel.
- Toda triagem nasce como "não revisada": a IA sugere, o empregado(a) confirma.
- A IA analisa **somente o texto do e-mail (assunto e corpo) e os nomes dos anexos**. O conteúdo dos anexos não é lido. Por isso, anexo com nome genérico (ex.: `scan001.pdf`) nunca é tratado como documento faltante, e quando uma pessoa responde com documentos, a demanda volta para revisão humana, que confere o conteúdo.
- Envios automáticos começam **desligados** (`AUTO_REPLY_ENABLED=false`, `DOCS_REQUEST_ENABLED=false`) e cada modelo tem sua própria chave `auto_enviar`.
- Dados de processos e clientes: confirme a base legal e o contrato de tratamento de dados com o provedor de IA antes de uso em produção (LGPD).

## Respostas automáticas e pedido de documentos

Rode `supabase/002_respostas_automaticas.sql` e `supabase/003_solicitacao_documentos.sql` (nessa ordem) depois do `schema.sql`.

**Resposta automática com modelo aprovado**
- Cadastre modelos na tabela `respostas_modelo` (título, "quando usar", texto). A IA apenas **escolhe** o modelo; o texto enviado é sempre o do modelo, com `{{nome}}` e `{{assunto}}`.
- Só envia se: `AUTO_REPLY_ENABLED=true`, o modelo tem `auto_enviar=true`, a IA marcou o pedido como rotineiro e seguro, a confiança é maior ou igual ao mínimo (padrão 0,85), a urgência não é crítica, não há alerta de injeção, o remetente não é robô/lista/noreply e não passou do limite diário (padrão 2 por remetente).
- Cada bloqueio fica registrado no histórico da demanda.

**Pedido de documentos "na hora certa"**
- Cadastre em `checklist_documentos` os documentos exigidos por área/tipo. A IA só aponta itens desse checklist que não aparecem no texto nem nos nomes dos anexos; ela não inventa exigências.
- O pedido só é enviado em dia útil, dentro do horário comercial (`BUSINESS_HOUR_START/END`, fuso `TIMEZONE`). Se o e-mail chega fora do horário, fica `pendente_envio` e sai no próximo ciclo dentro do horário.
- Sem resposta em `DOCS_REMINDER_DAYS` dias, envia lembrete (até `DOCS_MAX_REMINDERS`). Depois disso a demanda vira `sem_retorno` e volta para a revisão humana.
- Quando a pessoa responde ao e-mail, a resposta é ligada à demanda original (sem nova triagem), a demanda volta para "em análise" e aparece como pendente de revisão.
- Os textos ficam em `respostas_modelo` com finalidade `solicitacao_documentos` e `lembrete_documentos` (`{{lista_documentos}}` recebe a lista).

**Como ligar com segurança:** deixe as chaves em `false`, observe a triagem por alguns dias, revise os modelos e o checklist, ative um modelo por vez e só então mude a chave geral para `true`.

## Próximos passos possíveis
- Envio do rascunho aprovado via SMTP do Zimbra.
- Alertas diários de prazos por e-mail ou Teams.
- Leitura de anexos (PDF) na triagem.

---

## Versão integrada ao ComplyFlow (atual)

O painel agora vive no ComplyFlow (`/demandas`, área "Demandas Jurídicas", mesmo login e permissões). Este repositório mantém **apenas o worker**, que grava nas tabelas `dj_*` do Supabase do ComplyFlow.

- `worker/.env`: use `SUPABASE_URL` e a **service_role** do projeto do ComplyFlow e defina `EMPRESA_CLIENTE_ID`.
- Responsáveis = usuários do ComplyFlow (administrador, ou analista com a área "Demandas Jurídicas"); especialidades em `/demandas/configuracao > Equipe`.
- `web/` e `supabase/*.sql` desta pasta pertencem à versão standalone e não são mais necessários.
