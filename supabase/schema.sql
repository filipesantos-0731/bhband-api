-- ============================================================
-- BHBAND - Schema do catálogo de produtos no Supabase
-- Rode este SQL no painel do Supabase: SQL Editor > New query
-- ============================================================

-- Tabela de produtos (espelha o catálogo da loja Shopify bhband.com.br)
create table if not exists public.produtos (
  id                bigint primary key,          -- id do produto no Shopify
  handle            text not null unique,        -- slug usado nas rotas /api/produtos/:handle
  titulo            text not null,
  tipo              text,
  fornecedor        text,
  status            text,                         -- active | draft | archived
  tags              text[] default '{}',
  descricao         text,
  imagem_principal  text,
  imagens           jsonb default '[]',           -- todas as imagens [{src, alt}]
  opcoes            jsonb default '[]',           -- [{nome:"Cor", valores:[...]}]
  cores             text[] default '{}',          -- atalho: valores da opção de cor
  variantes         jsonb default '[]',           -- [{id, titulo, sku, preco, ...}]
  preco_min         numeric(12,2) default 0,
  preco_max         numeric(12,2) default 0,
  url               text,
  atualizado_em     timestamptz default now(),
  criado_em         timestamptz default now()
);

-- Caso a tabela já exista de uma versão anterior, adiciona as colunas novas:
alter table public.produtos add column if not exists status     text;
alter table public.produtos add column if not exists imagens    jsonb default '[]';
alter table public.produtos add column if not exists opcoes      jsonb default '[]';
alter table public.produtos add column if not exists cores       text[] default '{}';
alter table public.produtos add column if not exists variantes   jsonb default '[]';
alter table public.produtos add column if not exists preco_max   numeric(12,2) default 0;

-- Índices para busca e filtros rápidos
create index if not exists produtos_tipo_idx        on public.produtos (tipo);
create index if not exists produtos_preco_idx       on public.produtos (preco_min);
create index if not exists produtos_tags_idx        on public.produtos using gin (tags);
create index if not exists produtos_cores_idx       on public.produtos using gin (cores);
create index if not exists produtos_status_idx      on public.produtos (status);
-- Busca textual por título (case-insensitive, com pg_trgm para ilike rápido)
create extension if not exists pg_trgm;
create index if not exists produtos_titulo_trgm_idx on public.produtos using gin (titulo gin_trgm_ops);

-- View com a contagem de produtos por tipo (usada em /api/tipos)
create or replace view public.tipos_count as
  select coalesce(nullif(tipo, ''), 'Sem categoria') as nome,
         count(*)::int as quantidade
  from public.produtos
  group by 1
  order by quantidade desc;

-- ============================================================
-- Row Level Security
-- Leitura pública (catálogo é público). Escrita só com service_role.
-- ============================================================
alter table public.produtos enable row level security;

drop policy if exists "leitura publica de produtos" on public.produtos;
create policy "leitura publica de produtos"
  on public.produtos
  for select
  using (true);

-- O service_role ignora RLS automaticamente, então o script de
-- sincronização (que usa a service key) consegue inserir/atualizar.
