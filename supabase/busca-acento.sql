-- ============================================================
-- Busca inteligente para /api/produtos/buscar
-- Full-text search em português + unaccent: entende plural/gênero
-- (canecas≈caneca, roxas≈roxo) e ignora acento (ceramica≈cerâmica).
-- Rode no Supabase: SQL Editor > New query > Run
-- Não altera dados dos produtos — só adiciona uma coluna derivada (gerada)
-- que o Postgres preenche e mantém sozinho.
-- ============================================================

-- 1) Extensão para remover acentos
create extension if not exists unaccent;

-- 2) Configuração de busca: português + unaccent
--    (aplica unaccent antes do stemmer português)
do $$
begin
  if not exists (select 1 from pg_ts_config where cfgname = 'pt_unaccent') then
    create text search configuration public.pt_unaccent ( copy = pg_catalog.portuguese );
    alter text search configuration public.pt_unaccent
      alter mapping for hword, hword_part, word
      with unaccent, portuguese_stem;
  end if;
end$$;

-- 3) Coluna tsvector gerada (título + categoria). Preenchida automaticamente
--    para todas as linhas, atuais e futuras.
alter table public.produtos
  add column if not exists busca_fts tsvector
  generated always as (
    to_tsvector('public.pt_unaccent', coalesce(titulo, '') || ' ' || coalesce(tipo, ''))
  ) stored;

-- 4) Índice GIN para busca rápida
create index if not exists produtos_busca_fts_idx on public.produtos using gin (busca_fts);
