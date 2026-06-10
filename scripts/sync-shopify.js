/**
 * Sincroniza o catálogo da loja Shopify para o Supabase (ou para um arquivo
 * JSON local, quando o Supabase ainda não está configurado).
 *
 * - Usa a API Admin do Shopify (traz todos os produtos, mas filtramos só os ATIVOS).
 * - Captura variantes, opções (cor/tamanho/etc), preços, estoque e imagens.
 *
 * Uso:
 *   node scripts/sync-shopify.js
 *
 * Variáveis de ambiente (.env):
 *   # Shopify (obrigatório)
 *   SHOPIFY_ADMIN_DOMAIN        = ea7t0j-qw.myshopify.com
 *   SHOPIFY_API_KEY             = client_id do app
 *   SHOPIFY_API_SECRET          = client_secret do app (shpss_...)
 *   SHOPIFY_API_VERSION         = 2024-10   (opcional)
 *   SHOPIFY_STORE               = https://www.bhband.com.br   (p/ montar URL pública)
 *   # Alternativa: SHOPIFY_ADMIN_TOKEN = shpat_... (token fixo; se ausente, é gerado via client_credentials)
 *
 *   # Supabase (opcional nesta fase — se ausente, salva em arquivo JSON)
 *   SUPABASE_URL                = https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   = chave service_role
 */
import 'dotenv/config';
import axios from 'axios';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ADMIN_DOMAIN = (process.env.SHOPIFY_ADMIN_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
const API_KEY = process.env.SHOPIFY_API_KEY;
const API_SECRET = process.env.SHOPIFY_API_SECRET;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';
const STORE = (process.env.SHOPIFY_STORE || 'https://www.bhband.com.br').replace(/\/$/, '');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!ADMIN_DOMAIN || (!process.env.SHOPIFY_ADMIN_TOKEN && (!API_KEY || !API_SECRET))) {
  console.error('❌ Defina SHOPIFY_ADMIN_DOMAIN e (SHOPIFY_API_KEY + SHOPIFY_API_SECRET) ou SHOPIFY_ADMIN_TOKEN no .env');
  process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Gera um Admin API token via client_credentials (válido ~24h).
// Se SHOPIFY_ADMIN_TOKEN estiver definido no .env, usa esse direto.
async function obterToken() {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN;
  const { data } = await axios.post(
    `https://${ADMIN_DOMAIN}/admin/oauth/access_token`,
    { client_id: API_KEY, client_secret: API_SECRET, grant_type: 'client_credentials' },
    { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
  );
  console.log(`🔑 Token gerado via client_credentials (escopo: ${data.scope}, expira em ${data.expires_in}s)`);
  return data.access_token;
}

let ADMIN_TOKEN = null; // preenchido em main()

// Nomes de opção tratados como "cor"
const COLOR_OPTION_NAMES = ['cor', 'cores', 'color', 'colour'];

// ---- Mapeia um produto Admin para o formato da tabela `produtos` ----
function mapProduto(p) {
  // Índice imagem por id -> src (para associar à variante)
  const imagemPorId = {};
  for (const img of p.images || []) imagemPorId[img.id] = img.src;

  const variantes = (p.variants || []).map(v => ({
    id: v.id,
    titulo: v.title,
    sku: v.sku || null,
    preco: parseFloat(v.price) || 0,
    preco_comparacao: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
    opcao1: v.option1 || null,
    opcao2: v.option2 || null,
    opcao3: v.option3 || null,
    estoque: typeof v.inventory_quantity === 'number' ? v.inventory_quantity : null,
    imagem: v.image_id ? (imagemPorId[v.image_id] || null) : null
  }));

  const precos = variantes.map(v => v.preco).filter(n => n > 0);
  const preco_min = precos.length ? Math.min(...precos) : 0;
  const preco_max = precos.length ? Math.max(...precos) : 0;

  const opcoes = (p.options || []).map(o => ({
    nome: o.name,
    valores: o.values || []
  }));

  // Extrai as cores da opção cujo nome bate com COLOR_OPTION_NAMES
  const opcaoCor = opcoes.find(o => COLOR_OPTION_NAMES.includes((o.nome || '').toLowerCase()));
  const cores = opcaoCor ? opcaoCor.valores : [];

  const imagens = (p.images || []).map(img => ({ src: img.src, alt: img.alt || null }));

  const tags = Array.isArray(p.tags)
    ? p.tags
    : (p.tags ? String(p.tags).split(',').map(t => t.trim()).filter(Boolean) : []);

  return {
    id: p.id,
    handle: p.handle,
    titulo: p.title,
    tipo: p.product_type || null,
    fornecedor: p.vendor || null,
    status: p.status || null,
    tags,
    descricao: p.body_html || null,
    imagem_principal: p.image?.src || imagens[0]?.src || null,
    imagens,
    opcoes,
    cores,
    variantes,
    preco_min,
    preco_max,
    url: `${STORE}/products/${p.handle}`,
    atualizado_em: new Date().toISOString()
  };
}

// ---- Baixa produtos ATIVOS via API Admin (cursor pagination) ----
async function baixarAtivos() {
  const todos = [];
  let pageInfo = null;
  for (;;) {
    // page_info não pode coexistir com outros filtros além de limit
    const params = new URLSearchParams({ limit: '250' });
    if (pageInfo) params.set('page_info', pageInfo);
    else params.set('status', 'active');

    const url = `https://${ADMIN_DOMAIN}/admin/api/${API_VERSION}/products.json?${params}`;

    let resp;
    for (let tentativa = 1; ; tentativa++) {
      try {
        resp = await axios.get(url, {
          headers: { 'X-Shopify-Access-Token': ADMIN_TOKEN },
          timeout: 30000
        });
        break;
      } catch (e) {
        if (e.response?.status === 429 && tentativa <= 5) {
          await sleep(2000 * tentativa);
          continue;
        }
        throw e;
      }
    }

    const lote = resp.data.products || [];
    todos.push(...lote);
    process.stdout.write(`\r📥 Baixados ${todos.length} produtos ativos...`);

    pageInfo = parseNextPageInfo(resp.headers['link']);
    if (!pageInfo || lote.length === 0) break;
    await sleep(300); // respeita rate limit (2 req/s)
  }
  process.stdout.write('\n');
  return todos;
}

function parseNextPageInfo(linkHeader) {
  if (!linkHeader) return null;
  const next = linkHeader.split(',').find(s => s.includes('rel="next"'));
  const url = next?.match(/<([^>]+)>/)?.[1];
  return url ? new URL(url).searchParams.get('page_info') : null;
}

// ---- Destino: Supabase ou arquivo JSON local ----
async function gravarNoSupabase(produtos) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  let enviados = 0;
  for (let i = 0; i < produtos.length; i += 500) {
    const lote = produtos.slice(i, i + 500);
    const { error } = await supabase.from('produtos').upsert(lote, { onConflict: 'id' });
    if (error) throw error;
    enviados += lote.length;
    process.stdout.write(`\r⬆️  Enviados ${enviados}/${produtos.length} ao Supabase...`);
  }
  process.stdout.write('\n');
}

function gravarEmArquivo(produtos) {
  const out = join(__dirname, '..', 'produtos.json');
  writeFileSync(out, JSON.stringify({
    total: produtos.length,
    atualizado_em: new Date().toISOString(),
    fonte: ADMIN_DOMAIN,
    produtos
  }, null, 2));
  console.log(`💾 Salvo em produtos.json (${produtos.length} produtos) — Supabase não configurado.`);
}

async function main() {
  console.log(`🔐 API Admin: ${ADMIN_DOMAIN} (somente produtos ativos)`);
  ADMIN_TOKEN = await obterToken();

  const brutos = await baixarAtivos();
  // Garantia extra: filtra status active mesmo que a API devolva outros
  const ativos = brutos.filter(p => (p.status || 'active') === 'active');
  const produtos = ativos.map(mapProduto);

  const totalVariantes = produtos.reduce((s, p) => s + p.variantes.length, 0);
  console.log(`✅ ${produtos.length} produtos ativos, ${totalVariantes} variantes mapeadas.`);

  if (SUPABASE_URL && SERVICE_KEY) {
    await gravarNoSupabase(produtos);
    console.log(`🎉 Sincronização concluída no Supabase.`);
  } else {
    gravarEmArquivo(produtos);
  }
}

main().catch(err => {
  const detalhe = err.response?.status
    ? `HTTP ${err.response.status} — ${JSON.stringify(err.response.data)}`
    : (err.message || err);
  console.error('\n❌ Erro na sincronização:', detalhe);
  process.exit(1);
});
