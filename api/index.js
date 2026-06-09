import express from 'express';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ========== CATÁLOGO DE PRODUTOS ==========
let CATALOG = { total: 0, atualizado_em: '', produtos: [] };
const catalogPath = join(__dirname, '..', 'products.json');
if (existsSync(catalogPath)) {
  CATALOG = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  console.log(`📦 Catálogo carregado: ${CATALOG.total} produtos`);
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

// ========== ENDPOINTS DE PRODUTOS ==========

// Listar produtos com paginação e filtros
app.get('/api/produtos', (req, res) => {
  const {
    pagina = 1,
    limite = 50,
    busca = '',
    tipo = '',
    tags = '',
    preco_min = 0,
    preco_max = Infinity,
    ordenar = 'titulo',
    com_imagem = 'true'
  } = req.query;

  let produtos = CATALOG.produtos;

  if (com_imagem !== 'false') {
    produtos = produtos.filter(p => p.imagem_principal);
  }

  if (busca) {
    const q = busca.toLowerCase();
    produtos = produtos.filter(p =>
      p.titulo.toLowerCase().includes(q) ||
      p.tipo.toLowerCase().includes(q) ||
      (p.tags && p.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  if (tipo) {
    produtos = produtos.filter(p => p.tipo.toLowerCase() === tipo.toLowerCase());
  }

  if (tags) {
    const tagList = tags.split(',').map(t => t.trim().toLowerCase());
    produtos = produtos.filter(p =>
      p.tags && tagList.some(tag => p.tags.some(t => t.toLowerCase().includes(tag)))
    );
  }

  const pMin = parseFloat(preco_min) || 0;
  const pMax = parseFloat(preco_max) || Infinity;
  if (pMin > 0 || pMax < Infinity) {
    produtos = produtos.filter(p => p.preco_min >= pMin && p.preco_min <= pMax);
  }

  if (ordenar === 'preco_asc') produtos.sort((a, b) => a.preco_min - b.preco_min);
  else if (ordenar === 'preco_desc') produtos.sort((a, b) => b.preco_min - a.preco_min);
  else produtos.sort((a, b) => a.titulo.localeCompare(b.titulo));

  const total = produtos.length;
  const pg = parseInt(pagina);
  const lim = Math.min(parseInt(limite), 250);
  const inicio = (pg - 1) * lim;
  const pagina_produtos = produtos.slice(inicio, inicio + lim);

  res.json({
    total,
    pagina: pg,
    limite: lim,
    total_paginas: Math.ceil(total / lim),
    atualizado_em: CATALOG.atualizado_em,
    produtos: pagina_produtos
  });
});

// Buscar produto por handle
app.get('/api/produtos/:handle', (req, res) => {
  const produto = CATALOG.produtos.find(p => p.handle === req.params.handle);
  if (!produto) {
    return res.status(404).json({ erro: 'Produto não encontrado', handle: req.params.handle });
  }
  res.json(produto);
});

// Listar tipos de produto
app.get('/api/tipos', (req, res) => {
  const tipos = {};
  CATALOG.produtos.forEach(p => {
    const tipo = p.tipo || 'Sem categoria';
    tipos[tipo] = (tipos[tipo] || 0) + 1;
  });
  res.json({
    tipos: Object.entries(tipos)
      .sort((a, b) => b[1] - a[1])
      .map(([nome, quantidade]) => ({ nome, quantidade }))
  });
});

// Calcular orçamento para um produto do catálogo
app.post('/api/calcular-produto', (req, res) => {
  try {
    const { handle, quantidade, personalizacao, estrategia = 'PADRÃO' } = req.body;

    if (!handle || !quantidade) {
      return res.status(400).json({ erro: 'handle e quantidade são obrigatórios' });
    }

    const produto = CATALOG.produtos.find(p => p.handle === handle);
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
        quantidade_minima: Math.ceil(400 / custoUnitario)
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
app.get('/api/catalogo', (req, res) => {
  res.json({
    total_produtos: CATALOG.total,
    atualizado_em: CATALOG.atualizado_em,
    fonte: CATALOG.fonte
  });
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
