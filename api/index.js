import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { supabase } from './supabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ========== CATÁLOGO DE PRODUTOS ==========
// Os produtos agora ficam no Supabase (tabela `produtos`).
// Use `node scripts/sync-shopify.js` para popular/atualizar o catálogo.

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

    // Monta a query. `modoBusca='busca'` usa a coluna gerada acento-insensível
    // (minúscula/sem acento); `modoBusca='titulo'` é o fallback se a coluna
    // `busca` ainda não existir no banco (antes de rodar supabase/busca-acento.sql).
    function montar(modoBusca) {
      const acentoOk = modoBusca === 'busca';
      const campo = acentoOk ? 'busca' : 'titulo';
      const norm = (s) => acentoOk ? deburr(sanit(s).toLowerCase()) : sanit(s);

      let qy = supabase
        .from('produtos')
        .select('id,titulo,descricao,preco_min,imagem_principal,cores,tipo,status,url');

      if (idNum !== null) {
        qy = qy.eq('id', idNum);
      } else {
        for (const t of termos) {
          // cada palavra precisa casar (AND entre palavras)
          qy = acentoOk
            ? qy.ilike('busca', `%${deburr(t.toLowerCase())}%`)
            : qy.or(`titulo.ilike.%${t}%,tipo.ilike.%${t}%`);
        }
        if (cor) qy = qy.ilike(campo, `%${norm(cor)}%`);
        if (categoria) qy = acentoOk ? qy.ilike('busca', `%${norm(categoria)}%`) : qy.ilike('tipo', `%${norm(categoria)}%`);
        if (sku) {
          const s = sanit(sku);
          qy = qy.or(`handle.ilike.%${s}%,titulo.ilike.%${s}%`);
        }
        if (!isNaN(pMin)) qy = qy.gte('preco_min', pMin);
        if (!isNaN(pMax)) qy = qy.lte('preco_min', pMax);
      }
      return qy
        .not('imagem_principal', 'is', null)
        .order('preco_min', { ascending: true })
        .limit(lim);
    }

    let { data, error } = await montar('busca');
    // Coluna `busca` ainda não criada → cai no modo título (sensível a acento)
    if (error && /busca/.test(error.message || '')) {
      ({ data, error } = await montar('titulo'));
    }
    if (error) throw error;

    const stripHtml = (h) => (h || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const produtos = (data || []).map((p) => ({
      id: p.id,
      nome: p.titulo,
      descricao: stripHtml(p.descricao).slice(0, 300),
      preco: p.preco_min,
      url_imagem: p.imagem_principal,
      cor: Array.isArray(p.cores) && p.cores.length ? p.cores.join(', ') : null,
      categoria: p.tipo || null,
      disponivel: p.status === 'active',
      url: p.url
    }));

    res.json({
      ok: true,
      total: produtos.length,
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
