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

// Timestamp único desta execução: marca as linhas gravadas agora, para
// depois apagar em lote as que sobraram de execuções anteriores (obsoletas).
const SYNC_TS = new Date().toISOString();

// Nomes de opção tratados como "cor"
const COLOR_OPTION_NAMES = ['cor', 'cores', 'color', 'colour'];

// slug p/ compor handles por variante (sem acento, minúsculo, hifenizado)
function slug(s) {
  return (s || '')
    .toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Controla unicidade global dos handles (a coluna handle tem UNIQUE)
const handlesUsados = new Set();
function handleUnico(base, varianteId) {
  let h = base || `produto-${varianteId}`;
  if (handlesUsados.has(h)) h = `${base}-${varianteId}`;
  handlesUsados.add(h);
  return h;
}

// ---- Mapeia um produto Admin em UMA LINHA POR VARIANTE ----
// Cada variante vira um "produto" próprio, com o nome da variante junto do
// nome original (ex.: "Caneca Térmica - Azul"). Produtos sem variação real
// (variante "Default Title") permanecem como 1 linha com o nome original.
function mapVariantes(p) {
  const imagemPorId = {};
  for (const img of p.images || []) imagemPorId[img.id] = img.src;

  const imagens = (p.images || []).map(img => ({ src: img.src, alt: img.alt || null }));
  const imagemProduto = p.image?.src || imagens[0]?.src || null;

  const opcoes = (p.options || []).map(o => ({ nome: o.name, valores: o.values || [] }));
  // posição (1-based) da opção de cor -> mapeia para v.option1/2/3
  const posCor = (p.options || []).findIndex(o => COLOR_OPTION_NAMES.includes((o.name || '').toLowerCase()));

  const tags = Array.isArray(p.tags)
    ? p.tags
    : (p.tags ? String(p.tags).split(',').map(t => t.trim()).filter(Boolean) : []);

  const base = {
    tipo: p.product_type || null,
    fornecedor: p.vendor || null,
    status: p.status || null,
    tags,
    descricao: p.body_html || null,
    imagens,
    opcoes,
    atualizado_em: SYNC_TS
  };

  const variantes = p.variants || [];
  const unica = variantes.length <= 1; // sem variação real → não anexa sufixo

  const linhas = [];
  for (const v of variantes) {
    const ehDefault = unica || v.title === 'Default Title';
    const imagemVariante = v.image_id ? (imagemPorId[v.image_id] || null) : null;
    const imagem = imagemVariante || imagemProduto;
    if (!imagem) continue; // regra: sem imagem não entra

    const preco = parseFloat(v.price) || 0;
    const cor = posCor >= 0 ? [v.option1, v.option2, v.option3][posCor] : null;

    const titulo = ehDefault ? p.title : `${p.title} - ${v.title}`;
    const handleBase = ehDefault ? p.handle : `${p.handle}-${slug(v.title)}`;

    linhas.push({
      id: v.id, // id da VARIANTE (PK)
      handle: handleUnico(handleBase, v.id),
      titulo,
      ...base,
      imagem_principal: imagem,
      cores: cor ? [cor] : [],
      variantes: [{
        id: v.id,
        titulo: v.title,
        sku: v.sku || null,
        preco,
        preco_comparacao: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
        opcao1: v.option1 || null,
        opcao2: v.option2 || null,
        opcao3: v.option3 || null,
        estoque: typeof v.inventory_quantity === 'number' ? v.inventory_quantity : null,
        imagem: imagemVariante
      }],
      preco_min: preco,
      preco_max: preco,
      url: `${STORE}/products/${p.handle}${ehDefault ? '' : `?variant=${v.id}`}`
    });
  }
  return linhas;
}

// ---- Baixa TODOS os produtos via API Admin (cursor pagination) ----
// (ativos, arquivados e rascunho — sem filtro de status)
async function baixarTodos() {
  const todos = [];
  const maxPaginas = parseInt(process.env.LIMIT_PAGES) || Infinity; // p/ dry-run
  let pagina = 0;
  let pageInfo = null;
  for (;;) {
    if (++pagina > maxPaginas) break;
    // page_info não pode coexistir com outros filtros além de limit
    const params = new URLSearchParams({ limit: '250' });
    if (pageInfo) params.set('page_info', pageInfo);

    const url = `https://${ADMIN_DOMAIN}/admin/api/${API_VERSION}/products.json?${params}`;

    let resp;
    for (let tentativa = 1; ; tentativa++) {
      try {
        resp = await axios.get(url, {
          headers: { 'X-Shopify-Access-Token': ADMIN_TOKEN },
          timeout: 60000
        });
        // Às vezes o Shopify devolve 200 com corpo truncado/sem products: trata como transitório
        if (!resp.data || !Array.isArray(resp.data.products)) {
          throw new Error('resposta sem array products');
        }
        break;
      } catch (e) {
        const status = e.response?.status;
        const transitorio = status === 429 || (status >= 500 && status < 600) || !status; // rede/parse
        if (transitorio && tentativa <= 6) {
          process.stdout.write(`\r⏳ Tentando de novo (${tentativa}) após erro transitório...`);
          await sleep(2000 * tentativa);
          continue;
        }
        throw e;
      }
    }

    const lote = resp.data.products || [];
    todos.push(...lote);
    process.stdout.write(`\r📥 Baixados ${todos.length} produtos...`);

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
  const LOTE = 100;
  async function upsert(linhas) {
    const { error } = await supabase.from('produtos').upsert(linhas, { onConflict: 'id' });
    if (error) throw error;
  }

  let enviados = 0;
  for (let i = 0; i < produtos.length; i += LOTE) {
    const lote = produtos.slice(i, i + LOTE);
    let ok = false;
    for (let tentativa = 1; tentativa <= 6 && !ok; tentativa++) {
      try {
        await upsert(lote);
        ok = true;
      } catch (e) {
        process.stdout.write(`\r⏳ Lote ${Math.floor(i / LOTE) + 1}: retry ${tentativa} (${e.message})...`);
        await sleep(1500 * tentativa);
      }
    }
    // Fallback: se o lote inteiro falhou, tenta linha-a-linha (isola payload problemático)
    if (!ok) {
      for (const linha of lote) {
        for (let t = 1; ; t++) {
          try { await upsert([linha]); break; }
          catch (e) {
            if (t <= 4) { await sleep(1500 * t); continue; }
            console.warn(`\n⚠️  Produto ${linha.id} (${linha.handle}) não inserido: ${e.message}`);
            break;
          }
        }
      }
    }
    enviados += lote.length;
    process.stdout.write(`\r⬆️  Enviados ${enviados}/${produtos.length} ao Supabase...`);
  }
  process.stdout.write('\n');

  // Remove linhas obsoletas (de execuções anteriores) em lotes pequenos,
  // evitando o "statement timeout" de um DELETE gigante.
  let removidos = 0;
  for (;;) {
    const { data: obsoletos, error: errSel } = await supabase
      .from('produtos').select('id').neq('atualizado_em', SYNC_TS).limit(1000);
    if (errSel) throw errSel;
    if (!obsoletos || obsoletos.length === 0) break;
    const ids = obsoletos.map(r => r.id);
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      for (let t = 1; ; t++) {
        const { error } = await supabase.from('produtos').delete().in('id', chunk);
        if (!error) break;
        if (t > 5) throw error;
        await sleep(1500 * t);
      }
    }
    removidos += ids.length;
    process.stdout.write(`\r🧹 Removidas ${removidos} linhas obsoletas...`);
  }
  if (removidos) process.stdout.write('\n');
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

// Remove linhas com título EXATAMENTE igual, mantendo a melhor:
// 1) prioriza status 'active'; 2) empate -> menor id (determinístico)
function dedupPorTitulo(linhas) {
  const melhorPorTitulo = new Map();
  for (const l of linhas) {
    const atual = melhorPorTitulo.get(l.titulo);
    if (!atual) { melhorPorTitulo.set(l.titulo, l); continue; }
    const lAtiva = l.status === 'active';
    const aAtiva = atual.status === 'active';
    let vencedor;
    if (lAtiva !== aAtiva) vencedor = lAtiva ? l : atual;
    else vencedor = l.id < atual.id ? l : atual;
    melhorPorTitulo.set(l.titulo, vencedor);
  }
  return [...melhorPorTitulo.values()];
}

async function main() {
  console.log(`🔐 API Admin: ${ADMIN_DOMAIN} (todos os produtos: ativos, arquivados e rascunho)`);
  ADMIN_TOKEN = await obterToken();

  const brutos = await baixarTodos();
  // Cada variante vira uma linha (com nome da variante no título); sem imagem é ignorado
  const todas = brutos.flatMap(mapVariantes);

  // Remove títulos exatamente iguais, mantendo o ativo (empate: menor id)
  const produtos = dedupPorTitulo(todas);
  const removidos = todas.length - produtos.length;

  const porStatus = produtos.reduce((acc, p) => { acc[p.status || 'sem_status'] = (acc[p.status || 'sem_status'] || 0) + 1; return acc; }, {});
  console.log(`✅ ${produtos.length} variantes-produto (${JSON.stringify(porStatus)}), de ${brutos.length} produtos do Shopify. Duplicados por título removidos: ${removidos}.`);

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
