-- ============================================================
-- Busca acento-insensível para /api/produtos/buscar
-- Rode no Supabase: SQL Editor > New query > Run
-- Não altera dados dos produtos — só adiciona uma coluna derivada (gerada)
-- que o Postgres preenche e mantém sozinho.
-- ============================================================

-- 1) Extensões
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- 2) Wrapper IMMUTABLE do unaccent (necessário p/ usar em coluna gerada/índice)
create or replace function public.f_unaccent(txt text)
  returns text
  language sql
  immutable
  parallel safe
  strict
as $$ select public.unaccent('public.unaccent', txt) $$;

-- 3) Coluna gerada: título + categoria, minúsculo e SEM acento.
--    É preenchida automaticamente para todas as linhas (atuais e futuras).
alter table public.produtos
  add column if not exists busca text
  generated always as (
    public.f_unaccent(lower(coalesce(titulo, '') || ' ' || coalesce(tipo, '')))
  ) stored;

-- 4) Índice trigram para ilike rápido na coluna de busca
create index if not exists produtos_busca_trgm on public.produtos using gin (busca gin_trgm_ops);
