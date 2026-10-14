-- Gestao de Demandas Juridicas do FRISA
create extension if not exists "pgcrypto";

create table if not exists membros (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text unique not null,
  areas text[] not null default '{}',   -- ex: {'trabalhista','contratos','compliance'}
  ativo boolean not null default true
);

create table if not exists demandas (
  id uuid primary key default gen_random_uuid(),
  message_id text unique not null,       -- evita duplicidade na ingestao
  remetente text not null,
  assunto text not null,
  corpo text not null,
  recebido_em timestamptz not null,
  -- triagem por IA
  area text,
  tipo text,
  urgencia text check (urgencia in ('baixa','media','alta','critica')),
  resumo text,
  prazo_fatal date,
  prazo_origem text,                     -- trecho que justificou o prazo
  responsavel_id uuid references membros(id),
  justificativa_atribuicao text,
  rascunho_resposta text,
  confianca numeric,                     -- 0 a 1, para revisao humana
  alerta_injecao boolean not null default false,  -- e-mail com instrucoes dirigidas a IA
  alerta_detalhe text,
  -- fluxo
  status text not null default 'nova'
    check (status in ('nova','em_analise','aguardando_terceiro','respondida','arquivada')),
  triagem_revisada boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_demandas_status on demandas(status);
create index if not exists idx_demandas_prazo on demandas(prazo_fatal);

create table if not exists historico (
  id uuid primary key default gen_random_uuid(),
  demanda_id uuid references demandas(id) on delete cascade,
  evento text not null,
  detalhe text,
  criado_em timestamptz not null default now()
);

create or replace function set_atualizado_em() returns trigger as $$
begin new.atualizado_em = now(); return new; end; $$ language plpgsql set search_path = '';

drop trigger if exists trg_demandas_upd on demandas;
create trigger trg_demandas_upd before update on demandas
  for each row execute function set_atualizado_em();

-- RLS: apenas usuarios autenticados acessam
alter table membros enable row level security;
alter table demandas enable row level security;
alter table historico enable row level security;

create policy "auth le membros" on membros for select to authenticated using (true);
create policy "auth le demandas" on demandas for select to authenticated using (true);
create policy "auth edita demandas" on demandas for update to authenticated using (true);
create policy "auth le historico" on historico for select to authenticated using (true);
create policy "auth grava historico" on historico for insert to authenticated with check (true);
-- O worker usa a service_role key, que ignora RLS.
