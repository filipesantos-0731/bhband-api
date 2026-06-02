import express from 'express';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Middleware
app.use(express.json());
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
      calcular: 'POST /api/calcular-orcamento',
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
