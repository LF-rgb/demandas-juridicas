-- Solicitacao automatica de documentos (rode depois do 002)

-- finalidade do modelo: resposta comum, pedido de documentos ou lembrete de documentos
alter table respostas_modelo
  add column if not exists finalidade text not null default 'resposta'
  check (finalidade in ('resposta','solicitacao_documentos','lembrete_documentos'));

-- checklist de documentos por area/tipo (voce define; a IA nao inventa exigencias)
create table if not exists checklist_documentos (
  id uuid primary key default gen_random_uuid(),
  area text not null,          -- mesma area usada na triagem (ex.: contratos, trabalhista)
  tipo text,                   -- opcional: tipo da demanda
  documento text not null,     -- texto exatamente como sera pedido ao solicitante
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table checklist_documentos enable row level security;
create policy "auth le checklist" on checklist_documentos for select to authenticated using (true);
create policy "auth cria checklist" on checklist_documentos for insert to authenticated with check (true);
create policy "auth edita checklist" on checklist_documentos for update to authenticated using (true);
create policy "auth apaga checklist" on checklist_documentos for delete to authenticated using (true);

alter table demandas
  add column if not exists docs_faltantes text[] not null default '{}',
  add column if not exists docs_status text not null default 'nenhum'
    check (docs_status in ('nenhum','pendente_envio','solicitado','recebido','sem_retorno')),
  add column if not exists docs_solicitados_em timestamptz,
  add column if not exists docs_ultimo_contato_em timestamptz,
  add column if not exists docs_lembretes int not null default 0,
  add column if not exists docs_solicitacao_message_id text;

create index if not exists idx_demandas_docs_status on demandas(docs_status);
create index if not exists idx_demandas_docs_msgid on demandas(docs_solicitacao_message_id);

-- Modelos de texto. Nascem com auto_enviar = false: revise e ative manualmente.
insert into respostas_modelo (titulo, finalidade, quando_usar, corpo, auto_enviar, encerra_demanda, ativo) values
(
  'Solicitação de documentação', 'solicitacao_documentos',
  'Usado pelo sistema quando a demanda depende de documentos que ainda não foram enviados.',
  E'Olá, {{nome}}. Para dar andamento à sua solicitação "{{assunto}}", precisamos que você nos envie, respondendo a este e-mail, os documentos abaixo:\n\n{{lista_documentos}}\n\nAssim que recebermos, a equipe Jurídica e de Compliance do FRISA retomará a análise.',
  false, false, true
),
(
  'Lembrete de documentação', 'lembrete_documentos',
  'Usado pelo sistema quando a documentação solicitada não foi enviada no prazo.',
  E'Olá, {{nome}}. Ainda não recebemos os documentos solicitados para a demanda "{{assunto}}":\n\n{{lista_documentos}}\n\nPoderia enviá-los respondendo a este e-mail? Sem eles não conseguimos dar andamento.',
  false, false, true
);

-- Exemplos de checklist (inativos): revise, ajuste e ative os que fizerem sentido.
insert into checklist_documentos (area, tipo, documento, ativo) values
  ('contratos', null, 'Minuta do contrato em formato editável (Word)', false),
  ('contratos', null, 'Contrato social e cartão CNPJ da contraparte', false),
  ('trabalhista', null, 'Cópia integral da notificação ou citação recebida', false);
