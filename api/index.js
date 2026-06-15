import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { supabase, supabaseAdmin } from './supabase.js';
import { calcPrice, custoImpressao, extrairRef, PEDIDO_MINIMO } from './calc.js';

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
app.get('/api/produtos/buscar', async (req, res) => {
  try {
    const {
      q = '', cor = '', categoria = '',
      preco_min = '', preco_max = '',
      sku = '', id = '', limite = 5
    } = req.query;

    const lim = Math.min(Math.max(parseInt(limite) || 5, 1), 25);
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

    const idNum = String(id).trim() && /^\d+$/.test(String(id).trim()) ? Number(String(id).trim()) : null;
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
        .select('id,titulo,descricao,preco_min,imagem_principal,cores,tipo,status,url,variantes');
    }
    function filtrosComuns(qy) {
      if (sku) {
        const s = sanit(sku);
        qy = qy.or(`handle.ilike.%${s}%,titulo.ilike.%${s}%`);
      }
      if (!isNaN(pMin)) qy = qy.gte('preco_min', pMin);
      if (!isNaN(pMax)) qy = qy.lte('preco_min', pMax);
      return qy
        .not('imagem_principal', 'is', null)
        .order('preco_min', { ascending: true })
        .limit(lim);
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
      if (idNum !== null) qy = qy.eq('id', idNum);
      else if (lista.length) qy = qy.textSearch('busca_fts', lista.join(' '), { type: 'websearch', config: 'pt_unaccent' });
      return filtrosComuns(qy);
    }
    // Modo 2 (fallback, se busca_fts não existir): ilike (AND) em título/categoria.
    function montarTitulo(lista) {
      let qy = base();
      if (idNum !== null) qy = qy.eq('id', idNum);
      else for (const t of lista) qy = qy.or(`titulo.ilike.%${t}%,tipo.ilike.%${t}%`);
      return filtrosComuns(qy);
    }

    let data = null, error = null, ampliou = false, semFts = false;
    if (idNum !== null) {
      ({ data, error } = await montarFTS([])); // só eq('id') + filtros comuns
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

    const stripHtml = (h) => (h || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const produtos = (data || []).map((p) => ({
      id: p.id,
      nome: p.titulo,
      descricao: stripHtml(p.descricao).slice(0, 300),
      preco: p.preco_min,
      sku: Array.isArray(p.variantes) && p.variantes[0] ? (p.variantes[0].sku || null) : null,
      url_imagem: p.imagem_principal,
      cor: Array.isArray(p.cores) && p.cores.length ? p.cores.join(', ') : null,
      categoria: p.tipo || null,
      disponivel: p.status === 'active',
      url: p.url
    }));

    res.json({
      ok: true,
      total: produtos.length,
      busca_ampliada: ampliou, // true quando relaxamos a query para não voltar vazio
      filtros: { q, cor, categoria, preco_min, preco_max, sku, id, limite: lim },
      mensagem: produtos.length
        ? `${produtos.length} produto(s) encontrado(s).`
        : 'Nenhum produto encontrado para os filtros informados.',
      produtos
    });
  } catch (erro) {
    res.status(500).json({ ok: false, erro: erro.message, produtos: [] });
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
    const { lead_id, cores = 1, estrategia = 'padrao' } = req.query;
    if (!lead_id || !/^\d+$/.test(String(lead_id).trim())) {
      return res.status(400).json({ ok: false, erro: 'lead_id (numérico) é obrigatório', itens: [] });
    }
    const est = ['teto', 'padrao', 'piso'].includes(estrategia) ? estrategia : 'padrao';
    const nCores = Math.max(parseInt(cores) || 1, 1);

    // 1) Itens do orçamento do lead
    const { data: itensRaw, error } = await supabaseAdmin
      .from('info_orcamento')
      .select('product_name,product_price,product_quantity,design_info,product_sku,is_personalized')
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

      let impr = { custoImprUnit: 0, tecnica: null, area: null, colors: 0, fonte: null };
      if (personalizado) {
        const ref = extrairRef(it.product_sku);
        const imprObj = ref ? IMPRESSAO[ref] : null;
        impr = custoImpressao(imprObj, it.product_name || '', nCores, qtd);
      }

      const r = calcPrice(custoUnit, qtd, impr.custoImprUnit, est);
      totalGeral += r.total;
      custoGeral += r.custoTotalReal;

      return {
        produto: it.product_name,
        sku: it.product_sku,
        ref: extrairRef(it.product_sku) || null,
        quantidade: qtd,
        custo_unit: +custoUnit.toFixed(2),
        personalizado,
        design_info: it.design_info || null,
        tecnica: personalizado ? impr.tecnica : null,
        area_impressao: personalizado ? impr.area : null,
        cores: personalizado ? impr.colors : 0,
        custo_impressao_unit: +impr.custoImprUnit.toFixed(2),
        fonte_impressao: personalizado ? impr.fonte : null,
        markup_produto: r.mkProd,
        markup_impressao: r.mkImpr,
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
      `• ${i.quantidade}x ${i.produto}${i.personalizado ? ` (${i.tecnica}${i.cores ? `, ${i.cores} cor(es)` : ''})` : ''} — ${fmt(i.preco_unit)}/un = ${fmt(i.subtotal)}`
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
      cores_logo: nCores,
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
