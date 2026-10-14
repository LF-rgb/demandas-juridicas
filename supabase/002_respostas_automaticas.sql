-- Respostas automaticas com modelos aprovados
-- Rode depois do schema.sql

create table if not exists respostas_modelo (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  area text,                              -- opcional: area juridica do modelo
  quando_usar text not null,              -- descricao que a IA usa para escolher o modelo
  corpo text not null,                    -- texto enviado; aceita {{nome}} e {{assunto}}
  auto_enviar boolean not null default false,   -- so envia sozinho se for true
  encerra_demanda boolean not null default false, -- true: marca a demanda como respondida
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table demandas
  add column if not exists remetente_email text,
  add column if not exists resposta_modelo_id uuid references respostas_modelo(id),
  add column if not exists resposta_automatica_enviada boolean not null default false,
  add column if not exists resposta_enviada_em timestamptz;

create index if not exists idx_demandas_remetente_email on demandas(remetente_email, recebido_em);

alter table respostas_modelo enable row level security;
create policy "auth le modelos" on respostas_modelo for select to authenticated using (true);
create policy "auth cria modelos" on respostas_modelo for insert to authenticated with check (true);
create policy "auth edita modelos" on respostas_modelo for update to authenticated using (true);

-- Exemplos. Ambos nascem com auto_enviar = false: revise o texto e ative manualmente.
insert into respostas_modelo (titulo, quando_usar, corpo, auto_enviar, encerra_demanda, ativo) values
(
  'Confirmação de recebimento',
  'Solicitação nova e rotineira, sem urgência aparente e sem prazo legal, em que basta confirmar o recebimento e informar que a equipe dará andamento.',
  'Olá, {{nome}}. Recebemos sua solicitação "{{assunto}}" e ela foi registrada pela equipe Jurídica e de Compliance do FRISA. Retornaremos assim que houver andamento. Caso exista prazo ou urgência envolvidos, responda a este e-mail informando a data limite.',
  false, false, true
),
(
  'Orientação para envio de contratos para análise',
  'A pessoa pergunta como ou o que enviar para solicitar análise de contrato.',
  'Olá, {{nome}}. Para análise de contratos, envie: (1) a minuta em formato editável; (2) identificação completa da contraparte; (3) valor e prazo de vigência; (4) a data limite desejada para retorno. [PREENCHER: prazo padrão de análise e canal oficial]',
  false, false, false  -- inativo ate o texto ser completado
);
