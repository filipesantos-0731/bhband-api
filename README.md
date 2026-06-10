# BHBAND — Calculadora de Preços + Catálogo

API REST (Express, deploy na Vercel) para cálculo de orçamentos da BH Band, com
catálogo de produtos armazenado no **Supabase** e sincronizado da loja **Shopify**.

## Arquitetura

```
Shopify (ea7t0j-qw.myshopify.com)
   │  scripts/sync-shopify.js  (somente produtos ativos)
   ▼
Supabase  →  tabela `produtos`  (variantes, cores, preços, estoque, imagens)
   │
   ▼
API Express (api/index.js)  →  Frontend (public/index.html)
```

## Setup

1. Copie `.env.example` para `.env` e preencha as credenciais (Shopify + Supabase).
2. No Supabase, rode `supabase/schema.sql` no **SQL Editor** (cria só a tabela
   `produtos` + view `tipos_count`; não toca em outras tabelas).
3. Sincronize o catálogo:
   ```bash
   npm run sync
   ```
   O script gera o token do Shopify automaticamente (`client_credentials`),
   baixa os produtos **ativos** e faz upsert no Supabase.
4. Rode a API local:
   ```bash
   npm run dev    # http://localhost:3000
   ```

## Variáveis de ambiente

Veja `.env.example`. Na **Vercel**, configure apenas `SUPABASE_URL` e
`SUPABASE_ANON_KEY` (a `service_role` e as chaves do Shopify são usadas só
localmente pelo script de sync).

## Endpoints principais

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | Healthcheck |
| GET | `/api/produtos` | Lista com busca, filtros, paginação (`busca`, `tipo`, `tags`, `preco_min/max`, `ordenar`, `pagina`, `limite`) |
| GET | `/api/produtos/:handle` | Produto individual (com variantes/cores) |
| GET | `/api/tipos` | Contagem por tipo |
| GET | `/api/catalogo` | Total de produtos |
| POST | `/api/calcular-orcamento` | Cálculo por custo unitário |
| POST | `/api/calcular-produto` | Cálculo a partir de um produto do catálogo |
| POST | `/api/comparar-estrategias` | Compara TETO / PADRÃO / PISO |
| GET | `/api/tecnicas`, `/api/estrategias` | Tabelas de personalização e markup |

## Atualizar o catálogo

Rode `npm run sync` sempre que quiser refletir mudanças do Shopify no Supabase.
