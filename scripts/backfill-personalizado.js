/**
 * Backfill das colunas derivadas dos produtos JÁ existentes, sem precisar
 * re-sincronizar com o Shopify. Calcula tudo a partir do que já está no Supabase
 * e grava em lotes. É IDEMPOTENTE: rode quantas vezes quiser (e depois de cada
 * `npm run sync`, para popular produtos novos).
 *
 * Pré-requisito: rode antes o ALTER TABLE de supabase/schema.sql (cria as colunas).
 *
 * Uso:
 *   node scripts/backfill-personalizado.js          # aplica
 *   DRY_RUN=1 node scripts/backfill-personalizado.js # só mostra o que mudaria
 *
 * Variáveis (.env): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Campos gerados:
 *   personalizado = título traz "personalizad@" como adjetivo (não "Personalização").
 *   nome_base     = título sem o sufixo de cor e sem a palavra "personalizad@".
 *   produto_uid   = código de 7 dígitos, ÚNICO por produto (mesmas variantes = mesmo
 *                   produto_uid). Produtos = agrupados pelo handle base (/products/<handle>).
 *   uid           = 9 dígitos = produto_uid (7) + variante (2). "00" = sem variante;
 *                   "01".."NN" = cada variante (ordenadas pelo id da variante).
 *                   Só números, sem traço, sem colisão.
 *
 * Estabilidade: produto_uid já atribuído é PRESERVADO (não muda entre execuções);
 * produtos novos recebem o próximo código livre. As variantes são ordenadas pelo id
 * (ids do Shopify são crescentes, então variantes novas entram no fim sem mexer nas
 * anteriores).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = !!process.env.DRY_RUN;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const RE_PERSONALIZADO = /\bpersonalizad[oa]s?\b/i;
const ehPersonalizado = (titulo) => RE_PERSONALIZADO.test(titulo || '');

function nomeBase(titulo, cores) {
  let t = String(titulo || '').trim();
  const cor = Array.isArray(cores) && cores.length ? String(cores[0]).trim() : '';
  if (cor) {
    const esc = cor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp('\\s*[-–]\\s*' + esc + '\\s*$', 'i'), '').trim();
  } else {
    const idx = t.lastIndexOf(' - ');
    if (idx > 0) t = t.slice(0, idx).trim();
  }
  return t.replace(/\s*\bpersonalizad[oa]s?\b\s*/i, ' ').replace(/\s+/g, ' ').trim();
}

// handle base do produto = /products/<handle> (igual para todas as variantes do
// MESMO produto no Shopify). É a chave que agrupa as variantes num produto.
const baseHandle = (url, handle) => {
  const m = String(url || '').match(/\/products\/([^?#]+)/);
  return m ? m[1] : (handle || null);
};

const PRODUTO_DIGITS = 7;          // dígitos do código do produto
const VARIANTE_DIGITS = 2;         // dígitos da variante
const CODIGO_INICIAL = 10 ** (PRODUTO_DIGITS - 1); // 1000000

function pad(n, len) { return String(n).padStart(len, '0'); }

async function main() {
  // 1) lê todos os produtos (paginado)
  const linhas = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('produtos')
      .select('id,handle,titulo,url,cores,personalizado,nome_base,produto_uid,uid')
      .range(from, from + PAGE - 1);
    if (error) { console.error('Erro ao ler produtos:', error.message); process.exit(1); }
    linhas.push(...data);
    process.stdout.write(`\r📥 Lidos ${linhas.length} produtos...`);
    if (data.length < PAGE) break;
  }
  process.stdout.write('\n');

  // 2) agrupa as variantes por produto (handle base)
  const grupos = new Map(); // baseHandle -> linhas[]
  for (const p of linhas) {
    const bh = baseHandle(p.url, p.handle);
    if (!grupos.has(bh)) grupos.set(bh, []);
    grupos.get(bh).push(p);
  }

  // 3) atribui produto_uid ESTÁVEL: reaproveita o já existente; novos recebem o
  //    próximo código livre, em ordem determinística (handle ordenado).
  const usados = new Set();
  for (const p of linhas) if (p.produto_uid) usados.add(String(p.produto_uid));
  let proximo = CODIGO_INICIAL;
  const codigoDoProduto = new Map(); // baseHandle -> código (7 dígitos)
  const handlesOrdenados = [...grupos.keys()].sort((a, b) => String(a).localeCompare(String(b)));
  for (const bh of handlesOrdenados) {
    const existente = grupos.get(bh).map((p) => p.produto_uid).find(Boolean);
    if (existente) { codigoDoProduto.set(bh, String(existente)); continue; }
    while (usados.has(String(proximo))) proximo++;
    const codigo = String(proximo++);
    if (codigo.length !== PRODUTO_DIGITS) {
      console.error(`❌ Código de produto fora de ${PRODUTO_DIGITS} dígitos: ${codigo}. Aumente PRODUTO_DIGITS.`);
      process.exit(1);
    }
    usados.add(codigo);
    codigoDoProduto.set(bh, codigo);
  }

  // 4) calcula uid de cada variante e separa só o que mudou
  const updates = [];
  let maxVariantes = 0;
  for (const bh of handlesOrdenados) {
    const code = codigoDoProduto.get(bh);
    const rows = grupos.get(bh).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    maxVariantes = Math.max(maxVariantes, rows.length);
    rows.forEach((p, i) => {
      // sem variante (produto de variante única) => "00"; senão 01, 02, ...
      const varNum = rows.length <= 1 ? 0 : i + 1;
      if (varNum >= 10 ** VARIANTE_DIGITS) {
        console.error(`\n❌ Produto ${bh} tem mais de ${10 ** VARIANTE_DIGITS - 1} variantes. Aumente VARIANTE_DIGITS.`);
        process.exit(1);
      }
      const novoUid = code + pad(varNum, VARIANTE_DIGITS);
      const novoProd = code;
      const novoPers = ehPersonalizado(p.titulo);
      const novoBase = nomeBase(p.titulo, p.cores);
      if (p.uid !== novoUid || p.produto_uid !== novoProd ||
          p.personalizado !== novoPers || p.nome_base !== novoBase) {
        // handle/titulo entram no payload só para satisfazer o NOT NULL do upsert.
        updates.push({
          id: p.id, handle: p.handle, titulo: p.titulo,
          personalizado: novoPers, nome_base: novoBase,
          produto_uid: novoProd, uid: novoUid
        });
      }
    });
  }

  console.log(`✅ ${linhas.length} variantes | ${grupos.size} produtos | maior produto: ${maxVariantes} variantes | ${updates.length} precisam atualizar`);

  if (DRY_RUN) {
    console.log('🧪 DRY_RUN: nada gravado. Amostra:');
    updates.slice(0, 15).forEach((u) => console.log(`  - id=${u.id} uid=${u.uid} produto_uid=${u.produto_uid} | ${u.titulo}`));
    return;
  }

  // 5) grava em lotes (upsert por id; só as colunas do payload são alteradas)
  let ok = 0;
  const LOTE = 200;
  for (let i = 0; i < updates.length; i += LOTE) {
    const lote = updates.slice(i, i + LOTE);
    const { error } = await sb.from('produtos').upsert(lote, { onConflict: 'id' });
    if (error) { console.error(`\n❌ Falha no lote ${i / LOTE + 1}:`, error.message); process.exit(1); }
    ok += lote.length;
    process.stdout.write(`\r⬆️  Atualizados ${ok}/${updates.length}...`);
  }
  process.stdout.write('\n🎉 Backfill concluído.\n');
}

main().catch((e) => { console.error('\n❌ Erro:', e.message || e); process.exit(1); });
