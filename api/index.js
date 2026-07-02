import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { supabase, supabaseAdmin } from './supabase.js';
import { calcPrice, PEDIDO_MINIMO } from './calc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ========== CATÁLOGO DE PRODUTOS ==========
// Os produtos agora ficam no Supabase (tabela `produtos`).
// Use `node scripts/sync-shopify.js` para popular/atualizar o catálogo.

// ========== DADOS DE IMPRESSÃO (impressao.json) ==========
// Preços reais de impressão por produto/quantidade, usados no cálculo do orçamento.
let IMPRESSAO = {};
try {
  const p = join(__dirname, '..', 'public', 'impressao.json');
  if (existsSync(p)) {
    IMPRESSAO = JSON.parse(readFileSync(p, 'utf-8'));
    console.log(`🖨️  impressao.json carregado: ${Object.keys(IMPRESSAO).length} refs`);
  } else {
    console.warn('⚠️  impressao.json não encontrado — orçamento usará técnicas genéricas.');
  }
} catch (e) {
  console.warn('⚠️  Falha ao ler impressao.json:', e.message);
}

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// ========== CONFIG DE MARKUPS ==========
const MARKUP_TABLES = {
  TETO: {
    Mínimo: { range: [0, 160], markup: 2.5 },
    Pequeno: { range: [160, 320], markup: 2.25 },
    'Muito pequeno': { range: [320, 1400], markup: 2.15 },
    Médio: { range: [1400, 3400], markup: 2.05 },
    Grande: { range: [3400, 5000], markup: 1.95 },
    'Muito grande': { range: [5000, 10000], markup: 1.85 },
    Corporativo: { range: [10000, Infinity], markup: 1.75 }
  },
  PADRÃO: {
    Mínimo: { range: [0, 160], markup: 2.35 },
    Pequeno: { range: [160, 320], markup: 2.2 },
    'Muito pequeno': { range: [320, 1400], markup: 2.1 },
    Médio: { range: [1400, 3400], markup: 2.0 },
    Grande: { range: [3400, 5000], markup: 1.9 },
    'Muito grande': { range: [5000, 10000], markup: 1.8 },
    Corporativo: { range: [10000, Infinity], markup: 1.7 }
  },
  PISO: {
    Mínimo: { range: [0, 160], markup: 2.2 },
    Pequeno: { range: [160, 320], markup: 2.15 },
    'Muito pequeno': { range: [320, 1400], markup: 2.05 },
    Médio: { range: [1400, 3400], markup: 1.95 },
    Grande: { range: [3400, 5000], markup: 1.85 },
    'Muito grande': { range: [5000, 10000], markup: 1.75 },
    Corporativo: { range: [10000, Infinity], markup: 1.65 }
  }
};

const TECHNIQUES = {
  'Serigrafia 1 cor': { costPerUnit: 0.15, setupFee: 450 },
  'Serigrafia 2 cores': { costPerUnit: 0.25, setupFee: 550 },
  'Serigrafia 3 cores': { costPerUnit: 0.35, setupFee: 650 },
  'Serigrafia 4 cores': { costPerUnit: 0.45, setupFee: 750 },
  Tampografia: { costPerUnit: 0.10, setupFee: 350 },
  'Gravação a laser': { costPerUnit: 0.25, setupFee: 300 },
  'Bordado pequeno': { costPerUnit: 0.80, setupFee: 400 },
  'Bordado médio': { costPerUnit: 1.20, setupFee: 500 },
  'Bordado grande': { costPerUnit: 1.80, setupFee: 600 },
  Sublimação: { costPerUnit: 0.35, setupFee: 250 },
  UV: { costPerUnit: 0.20, setupFee: 400 },
  DTF: { costPerUnit: 0.45, setupFee: 500 },
  Offset: { costPerUnit: 0.08, setupFee: 200 },
  Digital: { costPerUnit: 0.30, setupFee: 300 },
  'Impressão UV': { costPerUnit: 0.25, setupFee: 350 },
  'Hot stamping': { costPerUnit: 0.35, setupFee: 400 },
  Nenhuma: { costPerUnit: 0, setupFee: 0 }
};

// ========== FUNÇÕES AUXILIARES ==========
function getMarkupByTotal(totalCost, strategy = 'PADRÃO') {
  const table = MARKUP_TABLES[strategy];
  for (const [tier, config] of Object.entries(table)) {
    const [min, max] = config.range;
    if (totalCost >= min && totalCost < max) {
      return { tier, markup: config.markup };
    }
  }
  return { tier: 'Corporativo', markup: table.Corporativo.markup };
}

function calculatePrice(quantity, unitCost, technique = 'Nenhuma', strategy = 'PADRÃO') {
  const totalProductCost = quantity * unitCost;
  const { markup } = getMarkupByTotal(totalProductCost, strategy);

  let priceWithoutPersonalization = unitCost * markup;
  let personalizationCostUnit = 0;
  let setupFee = 0;

  if (technique && technique !== 'Nenhuma') {
    const tech = TECHNIQUES[technique];
    if (tech) {
      personalizationCostUnit = tech.costPerUnit * markup;
      setupFee = tech.setupFee / quantity;
    }
  }

  const totalPrice = priceWithoutPersonalization + personalizationCostUnit + setupFee;

  return {
    strategy,
    quantity,
    unitCost,
    totalProductCost,
    markup,
    priceWithoutPersonalization,
    technique,
    personalizationCostUnit,
    setupFee,
    totalPrice,
    totalBudget: totalPrice * quantity,
    margin: ((totalPrice - unitCost - (TECHNIQUES[technique]?.costPerUnit || 0)) / totalPrice * 100).toFixed(2)
  };
}

// ========== ENDPOINTS ==========

// Rota raiz - informações da API
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    api: 'BHBAND Calculadora de Preços',
    versao: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      catalogo: 'GET /api/catalogo',
      produtos: 'GET /api/produtos?busca=&tipo=&pagina=&limite=',
      produto: 'GET /api/produtos/:handle',
      produto_imagem: 'GET /api/produtos/imagem?sku=|id=|handle= (retorna a imagem em binário)',
      produto_ficha: 'GET /api/produtos/ficha?uid=|id=|handle= (ficha do produto em JSON plano)',
      tipos: 'GET /api/tipos',
      calcular: 'POST /api/calcular-orcamento',
      calcular_produto: 'POST /api/calcular-produto',
      comparar: 'POST /api/comparar-estrategias',
      tecnicas: 'GET /api/tecnicas',
      estrategias: 'GET /api/estrategias'
    },
    documentacao: 'Leia o README.md no repositório',
    repositorio: 'https://github.com/filipesantos-0731/bhband-api',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Endpoint para sincronizar catálogo do Shopify (DESATIVADO - você conectará depois)
// NOTA: Esta integração será implementada quando você tiver acesso ao Shopify
// app.get('/api/sincronizar-shopify', async (req, res) => { ... })
// Deixado comentado para futura implementação

// Endpoint principal de cálculo
app.post('/api/calcular-orcamento', (req, res) => {
  try {
    const { 
      quantidade, 
      custoUnitario, 
      nomeProduto, 
      personalizacao,
      estrategia = 'PADRÃO'
    } = req.body;

    // Validações
    if (!quantidade || !custoUnitario) {
      return res.status(400).json({
        erro: 'Quantidade e custoUnitario são obrigatórios',
        campos_esperados: {
          quantidade: 'number (mínimo 1)',
          custoUnitario: 'number',
          nomeProduto: 'string (opcional)',
          personalizacao: 'string (opcional)',
          estrategia: 'string (TETO, PADRÃO, PISO) - padrão: PADRÃO'
        }
      });
    }

    // Validar estratégia
    if (!MARKUP_TABLES[estrategia]) {
      return res.status(400).json({
        erro: 'Estratégia inválida',
        estrategias_validas: Object.keys(MARKUP_TABLES)
      });
    }

    // Pedido mínimo
    const totalProductCost = quantidade * custoUnitario;
    if (totalProductCost < 400) {
      return res.status(400).json({
        erro: 'Valor do pedido abaixo do mínimo',
        custo_total: totalProductCost,
        minimo_permitido: 400
      });
    }

    const resultado = calculatePrice(
      quantidade, 
      custoUnitario, 
      personalizacao || 'Nenhuma',
      estrategia
    );

    res.json({
      sucesso: true,
      dados_entrada: {
        quantidade,
        custoUnitario,
        nomeProduto: nomeProduto || 'Produto',
        personalizacao: personalizacao || 'Nenhuma',
        estrategia
      },
      calculo: resultado,
      orcamento_whatsapp: gerarMensagemWhatsApp(resultado, nomeProduto)
    });

  } catch (erro) {
    res.status(500).json({
      erro: erro.message,
      tipo: 'ERRO_INTERNO'
    });
  }
});

// Endpoint para listar técnicas
app.get('/api/tecnicas', (req, res) => {
  res.json({
    tecnicas: Object.keys(TECHNIQUES),
    detalhes: TECHNIQUES
  });
});

// Endpoint para listar estratégias
app.get('/api/estrategias', (req, res) => {
  res.json({
    estrategias: Object.keys(MARKUP_TABLES),
    descricao: {
      TETO: 'Preços mais altos (máxima margem)',
      PADRÃO: 'Recomendado para maioria dos casos',
      PISO: 'Preços competitivos para negociação'
    }
  });
});

// Endpoint para comparar 3 estratégias
app.post('/api/comparar-estrategias', (req, res) => {
  try {
    const { quantidade, custoUnitario, nomeProduto, personalizacao } = req.body;

    if (!quantidade || !custoUnitario) {
      return res.status(400).json({ erro: 'Quantidade e custoUnitario são obrigatórios' });
    }

    const comparacao = {
      TETO: calculatePrice(quantidade, custoUnitario, personalizacao || 'Nenhuma', 'TETO'),
      PADRÃO: calculatePrice(quantidade, custoUnitario, personalizacao || 'Nenhuma', 'PADRÃO'),
      PISO: calculatePrice(quantidade, custoUnitario, personalizacao || 'Nenhuma', 'PISO')
    };

    res.json({
      sucesso: true,
      produto: nomeProduto || 'Produto',
      comparacao,
      recomendacao: 'PADRÃO'
    });

  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ========== FUNÇÕES DE FORMATAÇÃO ==========
function gerarMensagemWhatsApp(resultado, nomeProduto = 'Produto') {
  const { 
    quantity, 
    totalPrice, 
    totalBudget, 
    technique, 
    strategy 
  } = resultado;

  const piso = calculatePrice(quantity, resultado.unitCost, technique, 'PISO');
  
  return `Olá! Segue orçamento conforme solicitado 😊

${quantity}x ${nomeProduto}
Personalização: ${technique}

💰 Valores: R$ ${totalPrice.toFixed(2)}/unidade
🔥 Condição especial para fechamento ainda hoje: R$ ${piso.totalPrice.toFixed(2)} cada
📦 Total: R$ ${totalBudget.toFixed(2)}
⏱ Produção: 5 a 12 dias úteis após aprovação da arte

Vamos seguir com o seu pedido e garantir essa condição especial?`;
}

// ========== ENDPOINTS DE PRODUTOS (Supabase) ==========

// Listar produtos com paginação e filtros (consulta direto no Supabase)
app.get('/api/produtos', async (req, res) => {
  try {
    const {
      pagina = 1,
      limite = 50,
      busca = '',
      tipo = '',
      tags = '',
      preco_min = '',
      preco_max = '',
      ordenar = 'titulo',
      com_imagem = 'true'
    } = req.query;

    const pg = Math.max(parseInt(pagina) || 1, 1);
    const lim = Math.min(parseInt(limite) || 50, 250);
    const inicio = (pg - 1) * lim;

    let query = supabase.from('produtos').select('*', { count: 'exact' });

    if (com_imagem !== 'false') {
      query = query.not('imagem_principal', 'is', null);
    }

    if (busca) {
      // Busca case-insensitive por título, tipo ou fornecedor
      const q = busca.replace(/[%,]/g, ' ').trim();
      query = query.or(`titulo.ilike.%${q}%,tipo.ilike.%${q}%,fornecedor.ilike.%${q}%`);
    }

    if (tipo) {
      query = query.ilike('tipo', tipo);
    }

    if (tags) {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      if (tagList.length) query = query.overlaps('tags', tagList);
    }

    const pMin = parseFloat(preco_min);
    const pMax = parseFloat(preco_max);
    if (!isNaN(pMin)) query = query.gte('preco_min', pMin);
    if (!isNaN(pMax)) query = query.lte('preco_min', pMax);

    if (ordenar === 'preco_asc') query = query.order('preco_min', { ascending: true });
    else if (ordenar === 'preco_desc') query = query.order('preco_min', { ascending: false });
    else query = query.order('titulo', { ascending: true });

    query = query.range(inicio, inicio + lim - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({
      total: count || 0,
      pagina: pg,
      limite: lim,
      total_paginas: Math.ceil((count || 0) / lim),
      produtos: data || []
    });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ========== BUSCA DE PRODUTOS (ferramenta para o AI Agent / n8n) ==========
// GET /api/produtos/buscar
// Endpoint de RECUPERAÇÃO puro: recebe texto/filtros e devolve produtos.
// Não interpreta imagem/intenção — isso é responsabilidade do agente.
// Todos os parâmetros são opcionais e combináveis:
//   q          termo textual (busca parcial por palavra: "caneca azul")
//   cor        filtra por cor (presente no título da variante)
//   categoria  filtra por tipo/categoria
//   preco_min, preco_max  faixa de preço
//   sku        código/handle do produto (busca parcial)
//   id         id exato do produto (tem prioridade sobre os demais)
//   limite     máx. de resultados (padrão 5, teto 25)
// Nome "base" do produto: remove o sufixo de cor do título ("Pulseira ... - Azul"
// -> "Pulseira ..."). Cada cor é uma linha/produto separado no catálogo, mas o
// produto base é o mesmo (descrição idêntica). Usado para agrupar as cores.
function nomeBaseProduto(titulo, cores) {
  let t = String(titulo || '').trim();
  const cor = Array.isArray(cores) && cores.length ? String(cores[0]).trim() : '';
  if (cor) {
    const esc = cor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const t2 = t.replace(new RegExp('\\s*[-–]\\s*' + esc + '\\s*$', 'i'), '').trim();
    if (t2 && t2 !== t) return t2;
  }
  const idx = t.lastIndexOf(' - ');
  return idx > 0 ? t.slice(0, idx).trim() : t;
}

// Remove tags HTML e normaliza espaços (descrição vem como body_html do Shopify).
function stripHtml(h) {
  return (h || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Representante de uma versão (conjunto de linhas-cor): ativo mais barato,
// já com TODAS as cores daquela versão e o mapa cor -> uid/preço/imagem.
// IMPORTANTE: a descrição/categoria/imagem saem da PRÓPRIA versão (a linha
// representante), nunca de outra versão — normal e personalizada têm descrições
// diferentes no Shopify, então não podem ser misturadas.
function representanteVersao(linhas, baseUrl) {
  if (!linhas || !linhas.length) return null;
  const ord = [...linhas].sort((a, b) => {
    const aA = a.status === 'active', bA = b.status === 'active';
    if (aA !== bA) return aA ? -1 : 1;
    return (a.preco_min || 0) - (b.preco_min || 0);
  });
  const r = ord[0];
  const precos = linhas.map((x) => x.preco_min || 0);
  const cores = [...new Set(ord.flatMap((x) => (Array.isArray(x.cores) ? x.cores : [])).filter(Boolean))];
  // uid novo (produto_uid + variante); cai para o id da variante se ainda não tiver backfill
  const refUid = (x) => x.uid || String(x.id);
  const cores_uids = ord.map((x) => ({
    cor: Array.isArray(x.cores) && x.cores.length ? x.cores.join(', ') : null,
    uid: refUid(x),
    preco: x.preco_min,
    disponivel: x.status === 'active',
    url: x.url,
    url_imagem: `${baseUrl}/api/produtos/imagem?uid=${refUid(x)}`
  }));
  return {
    uid: refUid(r),
    produto_uid: r.produto_uid || null,
    preco: r.preco_min,
    preco_min: Math.min(...precos),
    preco_max: Math.max(...precos),
    total_cores: cores.length,
    cores,
    cores_uids,
    descricao: stripHtml(r.descricao) || null, // descrição COMPLETA desta versão
    categoria: r.tipo || null,
    disponivel: linhas.some((x) => x.status === 'active'),
    url: r.url,
    url_imagem: `${baseUrl}/api/produtos/imagem?uid=${refUid(r)}`,
    url_imagem_cdn: r.imagem_principal || null
  };
}

// Dado um conjunto de nome_base, devolve um mapa nome_base -> { normal, personalizada }
// com o representante de cada versão. É assim que a IA "acha o par": normal e
// personalizada compartilham o mesmo nome_base. Quando uma das versões não existe,
// ela vem como null. Uma única query para todos os bases.
async function resolverVersoes(nomeBases, baseUrl) {
  const bases = [...new Set((nomeBases || []).filter(Boolean))];
  const mapa = new Map();
  if (!bases.length) return mapa;

  const { data, error } = await supabase
    .from('produtos')
    .select('id,uid,produto_uid,titulo,nome_base,personalizado,preco_min,cores,status,url,imagem_principal,descricao,tipo')
    .in('nome_base', bases)
    .not('imagem_principal', 'is', null);
  if (error || !data) return mapa;

  // agrupa por nome_base -> linhas de cada versão
  const grupos = new Map();
  for (const p of data) {
    if (!grupos.has(p.nome_base)) grupos.set(p.nome_base, { normal: [], personalizada: [] });
    (p.personalizado ? grupos.get(p.nome_base).personalizada : grupos.get(p.nome_base).normal).push(p);
  }
  for (const [nb, g] of grupos) {
    mapa.set(nb, {
      normal: representanteVersao(g.normal, baseUrl),
      personalizada: representanteVersao(g.personalizada, baseUrl)
    });
  }
  return mapa;
}

// Resolve uma referência (uid da variante / produto_uid / id antigo) para a linha
// do produto. Ordem: 1) uid exato da variante; 2) produto_uid -> variante
// representativa (ativa mais barata); 3) id antigo da variante (numérico).
// Retorna a linha completa (*) ou null.
async function acharLinhaPorRef(ref) {
  const r = String(ref || '').trim();
  if (!r) return null;
  // 1) uid da variante (9 díg)
  let { data } = await supabase.from('produtos').select('*').eq('uid', r).limit(1);
  if (data && data.length) return data[0];
  // 2) produto_uid (7 díg) -> escolhe a variante ativa mais barata
  ({ data } = await supabase.from('produtos').select('*').eq('produto_uid', r));
  if (data && data.length) {
    data.sort((a, b) => {
      const aA = a.status === 'active', bA = b.status === 'active';
      if (aA !== bA) return aA ? -1 : 1;
      return (a.preco_min || 0) - (b.preco_min || 0);
    });
    return data[0];
  }
  // 3) id antigo da variante (compatibilidade)
  if (/^\d+$/.test(r)) {
    ({ data } = await supabase.from('produtos').select('*').eq('id', Number(r)).limit(1));
    if (data && data.length) return data[0];
  }
  return null;
}

app.get('/api/produtos/buscar', async (req, res) => {
  try {
    const {
      q = '', cor = '', categoria = '',
      preco_min = '', preco_max = '',
      sku = '', id = '', uid = '', limite = 5, agrupar = '',
      personalizado = ''
    } = req.query;
    // filtro opcional: true => só personalizados; false => só normais; '' => ambos
    const filtroPers = /^(1|true|sim)$/i.test(String(personalizado).trim()) ? true
      : /^(0|false|nao|não)$/i.test(String(personalizado).trim()) ? false
      : null;

    const lim = Math.min(Math.max(parseInt(limite) || 5, 1), 25);
    // modo agrupado: junta as cores do mesmo produto base numa única entrada
    const agrup = /^(1|true|sim)$/i.test(String(agrupar).trim());
    // no modo agrupado buscamos MAIS linhas (para capturar as várias cores) e
    // depois agrupamos e cortamos para 'lim' produtos base.
    const limDb = agrup ? Math.min(Math.max(lim * 15, 60), 300) : lim;
    // remove caracteres que quebram a sintaxe do filtro .or() do PostgREST
    const sanit = (s) => String(s).replace(/[%,()*]/g, ' ').trim();
    // remove acentos para comparar com a lista de palavras ignoradas
    const deburr = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    // Palavras de intenção/preço e stopwords PT que NÃO aparecem no nome do
    // produto (se entrarem no termo, zerariam a busca por exigir todas).
    const STOPWORDS = new Set([
      // preço / intenção
      'barato','barata','baratos','baratas','caro','cara','caros','caras','economico','economica',
      'preco','precos','valor','valores','custo','custos','conta','promocao','promocoes','promocional',
      'desconto','descontos','oferta','ofertas','barganha','acessivel','acessivel',
      // genéricos / fillers
      'mais','menos','bem','bom','boa','bons','boas','melhor','melhores','otimo','otima','qualidade',
      'produto','produtos','item','itens','coisa','coisas','algo','algum','alguma','alguns','algumas',
      'opcao','opcoes','tipo','tipos','modelo','modelos','ideia','ideias','sugestao','sugestoes',
      // verbos/pedido
      'quero','queria','gostaria','preciso','quer','ver','mostra','mostrar','mostre','busca','buscar',
      'procuro','procurar','tem','ter','me','pra','para','por','com','sem','de','da','do','das','dos',
      'em','no','na','nos','nas','ao','aos','um','uma','uns','umas','os','as','que','ou','uns'
    ]);

    // uid/id: aceita o uid novo da variante (9 díg), o produto_uid (7 díg, traz todas
    // as variantes) ou o id antigo da variante. Tudo só números.
    const idLike = String(uid).trim() || String(id).trim();
    const idFiltro = idLike && /^\d+$/.test(idLike) ? idLike : null;
    const termos = sanit(q)
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(deburr(t.toLowerCase())));
    const pMin = parseFloat(preco_min);
    const pMax = parseFloat(preco_max);

    // Termos textuais combinados (q + cor + categoria) sem stopwords.
    // No modo FTS, o stemmer português + unaccent cuidam de plural/gênero/acento.
    const termosTexto = [...termos];
    if (cor) termosTexto.push(...sanit(cor).split(/\s+/).filter(Boolean));
    if (categoria) termosTexto.push(...sanit(categoria).split(/\s+/).filter(Boolean));

    function base() {
      return supabase
        .from('produtos')
        .select('id,uid,produto_uid,titulo,descricao,preco_min,imagem_principal,cores,tipo,status,url,variantes,personalizado,nome_base');
    }
    // filtro exato por uid (variante, 9 díg), produto_uid (7 díg) ou id antigo
    const aplicarIdFiltro = (qy) => qy.or(`uid.eq.${idFiltro},produto_uid.eq.${idFiltro},id.eq.${idFiltro}`);
    function filtrosComuns(qy) {
      if (sku) {
        const s = sanit(sku);
        qy = qy.or(`handle.ilike.%${s}%,titulo.ilike.%${s}%`);
      }
      if (filtroPers !== null) qy = qy.eq('personalizado', filtroPers);
      if (!isNaN(pMin)) qy = qy.gte('preco_min', pMin);
      if (!isNaN(pMax)) qy = qy.lte('preco_min', pMax);
      return qy
        .not('imagem_principal', 'is', null)
        .order('preco_min', { ascending: true })
        .limit(limDb);
    }

    // Listas de termos a tentar, da mais específica à mais ampla: começamos com
    // TODAS as palavras e, se não achar nada, vamos descartando a última (as
    // menos importantes costumam vir no fim: "caneca térmica verde fosca inox
    // 350ml" → cai para "caneca térmica verde"). Para na primeira que retornar
    // algo, ou quando sobra 1 termo. Mantém relevância (preserva as 1ªs palavras).
    const tentativas = [];
    for (let n = termosTexto.length; n >= 1; n--) tentativas.push(termosTexto.slice(0, n));
    if (tentativas.length === 0) tentativas.push([]); // sem termo textual: só filtros

    // Modo 1 (preferido): full-text português + unaccent (coluna busca_fts).
    function montarFTS(lista) {
      let qy = base();
      if (idFiltro !== null) qy = aplicarIdFiltro(qy);
      else if (lista.length) qy = qy.textSearch('busca_fts', lista.join(' '), { type: 'websearch', config: 'pt_unaccent' });
      return filtrosComuns(qy);
    }
    // Modo 2 (fallback, se busca_fts não existir): ilike (AND) em título/categoria.
    function montarTitulo(lista) {
      let qy = base();
      if (idFiltro !== null) qy = aplicarIdFiltro(qy);
      else for (const t of lista) qy = qy.or(`titulo.ilike.%${t}%,tipo.ilike.%${t}%`);
      return filtrosComuns(qy);
    }

    let data = null, error = null, ampliou = false, semFts = false;
    if (idFiltro !== null) {
      ({ data, error } = await montarFTS([])); // só filtro de id/uid + filtros comuns
    } else {
      for (let i = 0; i < tentativas.length; i++) {
        const lista = tentativas[i];
        if (!semFts) {
          ({ data, error } = await montarFTS(lista));
          // coluna busca_fts ainda não criada → daqui pra frente usa só ilike
          if (error && /busca_fts|pt_unaccent|text search/i.test(error.message || '')) semFts = true;
        }
        if (semFts) ({ data, error } = await montarTitulo(lista));
        if (error) break;
        if (data && data.length) { ampliou = i > 0; break; } // achou: para
      }
    }
    if (error) throw error;

    // base pública desta API (funciona em prod e local): usamos para montar
    // a url_imagem apontando para o endpoint de imagem por id ÚNICO.
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    const baseUrl = `${proto}://${req.get('host')}`;

    // ===== Modo AGRUPADO: 1 entrada por produto, com as cores juntas =====
    // Agrupa pelo nome_base CANÔNICO (sem cor E sem "personalizada"): assim a
    // versão normal e a personalizada do MESMO produto colapsam numa entrada só
    // (e cópias idênticas somem). Representamos pela versão NORMAL quando ela
    // existe; a personalizada equivalente fica em `versoes.personalizada`/`tem_par`
    // para a IA buscar caso o cliente peça a personalizada.
    if (agrup) {
      const canonicalBase = (p) => p.nome_base
        || nomeBaseProduto(p.titulo, p.cores).replace(/\s*\bpersonalizad[oa]s?\b\s*/i, ' ').replace(/\s+/g, ' ').trim();
      const grupos = new Map(); // chave canônica -> { nome, nbExact, itens }
      for (const p of (data || [])) {
        const nb = canonicalBase(p);
        const key = deburr(nb.toLowerCase());
        if (!grupos.has(key)) grupos.set(key, { nome: nb, nbExact: p.nome_base || nb, itens: [] });
        grupos.get(key).itens.push(p);
      }
      // versões completas (todas as cores/preços) de cada base, para achar a personalizada
      const versoesMap = await resolverVersoes([...grupos.values()].map((g) => g.nbExact), baseUrl);

      let grupados = [...grupos.values()].map((g) => {
        const par = versoesMap.get(g.nbExact) || { normal: null, personalizada: null };
        // fallback (pré-backfill, sem nome_base/versoes): usa as linhas da própria busca
        const repNormal = par.normal || representanteVersao(g.itens.filter((x) => !x.personalizado), baseUrl);
        const repPers = par.personalizada || representanteVersao(g.itens.filter((x) => x.personalizado), baseUrl);
        const rep = repNormal || repPers;       // prioriza a versão NORMAL
        const ehPers = !repNormal;               // só personalizado quando não há normal
        return {
          uid: rep.uid,                // uid da variante representativa (identificador único)
          nome: g.nome,                // nome canônico, sem a cor e sem "personalizada"
          descricao: rep.descricao,    // descrição COMPLETA da versão representada (nunca da outra)
          preco: rep.preco,
          categoria: rep.categoria,
          disponivel: rep.disponivel,
          cores: rep.cores,            // todas as cores da versão mostrada
          url_imagem: rep.url_imagem,
          url: rep.url,
          personalizado: ehPers,
          // tem_par = existe também a outra versão (normal/personalizada). Se true,
          // busque com personalizado=true/false para pegar a versão desejada.
          tem_par: !!(repNormal && repPers)
        };
      });
      grupados.sort((a, b) => a.preco_min - b.preco_min);
      grupados = grupados.slice(0, lim);
      return res.json({
        ok: true,
        agrupado: true,
        total: grupados.length,
        busca_ampliada: ampliou,
        filtros: { q, cor, categoria, preco_min, preco_max, sku, id, limite: lim, agrupar: true, personalizado },
        mensagem: grupados.length
          ? `${grupados.length} produto(s) encontrado(s) (cores agrupadas).`
          : 'Nenhum produto encontrado para os filtros informados.',
        produtos: grupados
      });
    }

    // resolve as versões (normal/personalizada) de todos os nome_base do resultado
    const versoesMap = await resolverVersoes((data || []).map((p) => p.nome_base), baseUrl);

    const produtos = (data || []).map((p) => {
      const par = versoesMap.get(p.nome_base) || { normal: null, personalizada: null };
      // versão deste produto (normal/personalizada) já traz todas as cores do
      // mesmo produto base — é o que a IA usa para saber as opções disponíveis.
      const estaVersao = (p.personalizado ? par.personalizada : par.normal) || null;
      return {
        uid: p.uid || String(p.id), // identificador único da variante
        nome: p.titulo,
        descricao: stripHtml(p.descricao) || null, // descrição completa (sem HTML)
        preco: p.preco_min,
        categoria: p.tipo || null,
        disponivel: p.status === 'active',
        cor: Array.isArray(p.cores) && p.cores.length ? p.cores.join(', ') : null,
        // todas as cores do MESMO produto:
        cores_disponiveis: estaVersao ? estaVersao.cores : (Array.isArray(p.cores) ? p.cores.filter(Boolean) : []),
        personalizado: !!p.personalizado,           // true = versão personalizada
        // tem_par = existe também a outra versão (normal/personalizada). Se true,
        // busque com personalizado=true/false para pegar a versão desejada.
        tem_par: !!(par.normal && par.personalizada),
        // url_imagem resolve a imagem pelo uid (server-side, pega a variante exata):
        url_imagem: `${baseUrl}/api/produtos/imagem?uid=${p.uid || p.id}`,
        url: p.url
      };
    });

    res.json({
      ok: true,
      total: produtos.length,
      busca_ampliada: ampliou, // true quando relaxamos a query para não voltar vazio
      filtros: { q, cor, categoria, preco_min, preco_max, sku, id, limite: lim, personalizado },
      mensagem: produtos.length
        ? `${produtos.length} produto(s) encontrado(s).`
        : 'Nenhum produto encontrado para os filtros informados.',
      produtos
    });
  } catch (erro) {
    res.status(500).json({ ok: false, erro: erro.message, produtos: [] });
  }
});

// GET /api/produtos/imagem?id=...  (ou ?uid= / ?handle= / ?sku=)
// Busca o produto e devolve a IMAGEM em BINÁRIO, para baixar direto no n8n
// (HTTP Request com Response Format = File).
// Preferir id/uid: são ÚNICOS por produto. O sku pode repetir entre produtos
// (vem das variantes); por isso, no modo sku pegamos o 1º match de forma
// determinística — use id/uid quando precisar garantir o produto exato.
// Precisa vir ANTES de /api/produtos/:handle, senão "imagem" vira handle.
app.get('/api/produtos/imagem', async (req, res) => {
  try {
    const { sku = '', id = '', uid = '', handle = '' } = req.query;
    // ref aceita o uid novo da variante (9 díg), o produto_uid (7 díg) ou o id antigo
    const ref = String(uid || id).trim();

    let data = null;
    if (ref) {
      data = await acharLinhaPorRef(ref); // resolve uid/produto_uid/id
    } else if (handle) {
      const { data: rows, error } = await supabase
        .from('produtos').select('titulo,handle,imagem_principal,variantes')
        .eq('handle', String(handle).trim()).limit(1);
      if (error) throw error;
      data = rows?.[0] || null;
    } else if (sku) {
      // match do SKU dentro do array JSONB de variantes.
      // .contains() do supabase-js serializa errado p/ jsonb; usamos o
      // operador "cs" (@>) com a JSON string montada na mão.
      const { data: rows, error } = await supabase
        .from('produtos').select('titulo,handle,imagem_principal,variantes')
        .filter('variantes', 'cs', JSON.stringify([{ sku: String(sku).trim() }]))
        .order('id', { ascending: true }).limit(1);
      if (error) throw error;
      data = rows?.[0] || null;
    } else {
      return res.status(400).json({ ok: false, erro: 'Informe uid, id, handle ou sku.' });
    }

    if (!data || !data.imagem_principal) {
      return res.status(404).json({ ok: false, erro: 'Produto ou imagem não encontrada.', uid: ref, sku, handle });
    }

    // baixa a imagem da CDN e repassa os bytes com o content-type correto
    const imgResp = await fetch(data.imagem_principal);
    if (!imgResp.ok) {
      return res.status(502).json({ ok: false, erro: `Falha ao baixar a imagem (HTTP ${imgResp.status}).` });
    }
    const contentType = (imgResp.headers.get('content-type') || 'image/jpeg').split(';')[0];
    const ext = (contentType.split('/')[1] || 'jpg');
    const buffer = Buffer.from(await imgResp.arrayBuffer());

    const nomeArquivo = String(data.handle || data.titulo || 'produto')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
      .toLowerCase() || 'produto';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${nomeArquivo}.${ext}"`);
    return res.end(buffer);
  } catch (erro) {
    res.status(500).json({ ok: false, erro: erro.message });
  }
});

// GET /api/produtos/ficha?uid=...  (ou ?id= / ?handle=)
// Retorna a FICHA do produto em JSON PLANO (1 objeto), pronta para montar a
// legenda e enviar no n8n. url_imagem = link DIRETO da CDN da Shopify.
// Precisa vir ANTES de /api/produtos/:handle, senão "ficha" vira handle.
app.get('/api/produtos/ficha', async (req, res) => {
  try {
    const { uid = '', id = '', handle = '' } = req.query;
    const ref = String(uid || id).trim();

    let data = null;
    if (ref) {
      data = await acharLinhaPorRef(ref); // resolve uid/produto_uid/id
    } else if (handle) {
      const { data: rows, error } = await supabase.from('produtos').select('*')
        .eq('handle', String(handle).trim()).limit(1);
      if (error) throw error;
      data = rows?.[0] || null;
    } else {
      return res.status(400).json({ ok: false, erro: 'Informe uid, id ou handle.' });
    }
    if (!data) return res.status(404).json({ ok: false, erro: 'Produto não encontrado.', uid: ref });

    // versões equivalentes (normal/personalizada) via nome_base canônico; a versão
    // deste produto já traz todas as cores (com os uids novos) — usamos isso.
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    const baseUrl = `${proto}://${req.get('host')}`;
    const nbCanonico = data.nome_base || nomeBaseProduto(data.titulo, data.cores);
    const par = (await resolverVersoes([nbCanonico], baseUrl)).get(nbCanonico) || { normal: null, personalizada: null };
    const estaVersao = (data.personalizado ? par.personalizada : par.normal) || null;

    const coresProprias = Array.isArray(data.cores) ? data.cores.filter(Boolean) : [];
    const cores_disponiveis = estaVersao ? estaVersao.cores : coresProprias;
    const cores_uids = estaVersao ? estaVersao.cores_uids
      : [{ cor: coresProprias.join(', ') || null, uid: data.uid || String(data.id) }];

    res.json({
      ok: true,
      uid: data.uid || String(data.id),         // uid da VARIANTE (9 díg)
      produto_uid: data.produto_uid || null,    // uid do PRODUTO (7 díg)
      nome: data.titulo,
      nome_base: nbCanonico,                    // nome canônico (sem cor e sem "personalizada"): liga o par
      personalizado: !!data.personalizado,      // true = versão personalizada
      versao: data.personalizado ? 'personalizada' : 'normal',
      versoes: par,                             // { normal, personalizada } — para trocar de versão
      tem_par: !!(par.normal && par.personalizada),
      preco: data.preco_min,
      sku: Array.isArray(data.variantes) && data.variantes[0] ? (data.variantes[0].sku || null) : null,
      cor: Array.isArray(data.cores) && data.cores.length ? data.cores.join(', ') : null,
      cores_disponiveis,                        // todas as cores do produto (versão)
      total_cores: cores_disponiveis.length,
      cores_uids,                               // mapa cor -> uid (9 díg) de cada cor
      categoria: data.tipo || null,
      disponivel: data.status === 'active',
      descricao: stripHtml(data.descricao) || null, // descrição completa (sem HTML)
      url: data.url || null,                  // link do produto no site
      url_imagem: data.imagem_principal || null // link DIRETO da imagem na CDN da Shopify
    });
  } catch (erro) {
    res.status(500).json({ ok: false, erro: erro.message });
  }
});

// Buscar produto por handle
app.get('/api/produtos/:handle', async (req, res) => {
  try {
    const { data: produto, error } = await supabase
      .from('produtos')
      .select('*')
      .eq('handle', req.params.handle)
      .maybeSingle();
    if (error) throw error;
    if (!produto) {
      return res.status(404).json({ erro: 'Produto não encontrado', handle: req.params.handle });
    }
    res.json(produto);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// Listar tipos de produto (usa a view tipos_count)
app.get('/api/tipos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tipos_count')
      .select('*')
      .order('quantidade', { ascending: false });
    if (error) throw error;
    res.json({ tipos: data || [] });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// Calcular orçamento para um produto do catálogo
app.post('/api/calcular-produto', async (req, res) => {
  try {
    const { handle, quantidade, personalizacao, estrategia = 'PADRÃO' } = req.body;

    if (!handle || !quantidade) {
      return res.status(400).json({ erro: 'handle e quantidade são obrigatórios' });
    }

    const { data: produto, error } = await supabase
      .from('produtos')
      .select('*')
      .eq('handle', handle)
      .maybeSingle();
    if (error) throw error;
    if (!produto) {
      return res.status(404).json({ erro: 'Produto não encontrado' });
    }

    const custoUnitario = produto.preco_min;
    const totalProductCost = quantidade * custoUnitario;

    if (totalProductCost < 400) {
      return res.status(400).json({
        erro: 'Valor do pedido abaixo do mínimo',
        custo_total: totalProductCost,
        minimo_permitido: 400,
        quantidade_minima: custoUnitario > 0 ? Math.ceil(400 / custoUnitario) : null
      });
    }

    const resultado = calculatePrice(quantidade, custoUnitario, personalizacao || 'Nenhuma', estrategia);

    res.json({
      sucesso: true,
      produto: {
        titulo: produto.titulo,
        handle: produto.handle,
        imagem: produto.imagem_principal,
        url: produto.url,
        preco_custo: custoUnitario
      },
      calculo: resultado,
      orcamento_whatsapp: gerarMensagemWhatsApp(resultado, produto.titulo)
    });

  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// Info do catálogo
app.get('/api/catalogo', async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('produtos')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    res.json({
      total_produtos: count || 0,
      fonte: process.env.SHOPIFY_STORE || 'https://www.bhband.com.br'
    });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ========== CÁLCULO DO ORÇAMENTO (ferramenta para o AI Agent / n8n) ==========
// GET /api/orcamento/calcular?lead_id=...&cores=...&estrategia=padrao
// Lê os itens do orçamento do lead (tabela info_orcamento) e calcula o
// orçamento completo: para cada item aplica markup ao produto e à impressão
// (preços reais do impressao.json por ref + quantidade + nº de cores da logo).
// Acionar quando for ENVIAR o orçamento ao lead.
app.get('/api/orcamento/calcular', async (req, res) => {
  try {
    const { lead_id, estrategia = 'padrao' } = req.query;
    if (!lead_id || !/^\d+$/.test(String(lead_id).trim())) {
      return res.status(400).json({ ok: false, erro: 'lead_id (numérico) é obrigatório', itens: [] });
    }
    const est = ['teto', 'padrao', 'piso'].includes(estrategia) ? estrategia : 'padrao';

    // 1) Itens do orçamento do lead
    const { data: itensRaw, error } = await supabaseAdmin
      .from('info_orcamento')
      .select('product_name,product_price,product_quantity,design_info,product_uid,is_personalized')
      .eq('lead_id', Number(lead_id));
    if (error) throw error;

    if (!itensRaw || itensRaw.length === 0) {
      return res.json({
        ok: true, lead_id: Number(lead_id), total: 0, itens: [],
        mensagem: 'Nenhum item de orçamento encontrado para este lead.'
      });
    }

    // 2) Nome do cliente (melhor esforço)
    let cliente = null;
    try {
      const { data: li } = await supabaseAdmin
        .from('lead_info').select('lead_name').eq('lead_id', Number(lead_id)).maybeSingle();
      cliente = li?.lead_name || null;
    } catch (_) { /* opcional */ }

    // 3) Calcula cada item
    let totalGeral = 0;
    let custoGeral = 0;
    const itens = itensRaw.map((it) => {
      const qtd = Math.max(parseInt(it.product_quantity) || 1, 1);
      const custoUnit = parseFloat(it.product_price) || 0;
      const personalizado = !!it.is_personalized;

      // O preço do produto (inclusive das versões "Personalizada") JÁ inclui a
      // impressão/personalização. Portanto NÃO somamos custo de impressão aqui:
      // a calculadora apenas aplica o markup sobre o custo do produto.
      const r = calcPrice(custoUnit, qtd, 0, est);
      totalGeral += r.total;
      custoGeral += r.custoTotalReal;

      return {
        produto: it.product_name,
        product_uid: it.product_uid || null,
        quantidade: qtd,
        custo_unit: +custoUnit.toFixed(2),
        personalizado,
        design_info: it.design_info || null,
        markup_produto: r.mkProd,
        preco_unit: +r.unit.toFixed(2),
        subtotal: +r.total.toFixed(2),
        margem: +(r.margem * 100).toFixed(1)
      };
    });

    const margemTotal = totalGeral > 0 ? ((totalGeral - custoGeral) / totalGeral) * 100 : 0;
    const atingiuMinimo = totalGeral >= PEDIDO_MINIMO;

    // 4) Texto pronto para enviar ao lead
    const fmt = (v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const linhas = itens.map((i) =>
      `• ${i.quantidade}x ${i.produto} — ${fmt(i.preco_unit)}/un = ${fmt(i.subtotal)}`
    );
    const orcamento_texto =
      `Orçamento${cliente ? ' — ' + cliente : ''}:\n` +
      linhas.join('\n') +
      `\n\nTotal: ${fmt(totalGeral)}` +
      (atingiuMinimo ? '' : `\n⚠️ Abaixo do pedido mínimo de ${fmt(PEDIDO_MINIMO)}.`);

    res.json({
      ok: true,
      lead_id: Number(lead_id),
      cliente,
      estrategia: est,
      itens,
      totais: {
        qtd_itens: itens.length,
        custo_total: +custoGeral.toFixed(2),
        total: +totalGeral.toFixed(2),
        margem: +margemTotal.toFixed(1),
        pedido_minimo: PEDIDO_MINIMO,
        atingiu_minimo: atingiuMinimo
      },
      orcamento_texto
    });
  } catch (erro) {
    res.status(500).json({ ok: false, erro: erro.message, itens: [] });
  }
});

// ========== FALLBACK 404 ==========
app.all('*', (req, res) => {
  res.status(404).json({
    erro: 'Endpoint não encontrado',
    metodo: req.method,
    caminho: req.path,
    endpoints_disponveis: [
      'GET /api/health',
      'POST /api/calcular-orcamento',
      'POST /api/comparar-estrategias',
      'GET /api/tecnicas',
      'GET /api/estrategias'
    ]
  });
});

// ========== SERVIDOR ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ API BHBAND rodando em http://localhost:${PORT}`);
  console.log(`📖 Documentação: http://localhost:${PORT}/api/health`);
});

export default app;
