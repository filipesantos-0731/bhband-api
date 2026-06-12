/**
 * Lógica de cálculo de preços da BHBAND (mesma da calculadora do site).
 * Markup é aplicado SEPARADAMENTE ao custo do produto e ao da impressão,
 * cada um pela sua faixa de custo total. Reutilizável (frontend → backend → tool).
 */

// Faixas de markup por estratégia (custo total do componente → multiplicador)
export const MARKUP = [
  { nome: 'Mínimo',        min: 0,     max: 160,     teto: 2.50, padrao: 2.35, piso: 2.20 },
  { nome: 'Pequeno',       min: 160,   max: 320,     teto: 2.25, padrao: 2.20, piso: 2.15 },
  { nome: 'Muito Pequeno', min: 320,   max: 1400,    teto: 2.15, padrao: 2.10, piso: 2.05 },
  { nome: 'Médio',         min: 1400,  max: 3400,    teto: 2.05, padrao: 2.00, piso: 1.95 },
  { nome: 'Grande',        min: 3400,  max: 5000,    teto: 1.95, padrao: 1.90, piso: 1.85 },
  { nome: 'Muito Grande',  min: 5000,  max: 10000,   teto: 1.85, padrao: 1.80, piso: 1.75 },
  { nome: 'Corporativo',   min: 10000, max: 9999999, teto: 1.75, padrao: 1.70, piso: 1.65 }
];

// Técnicas genéricas (fallback quando o produto não está no impressao.json)
export const TECNICAS = {
  'Nenhuma (produto liso)': { custo: 0.00,  setup: 0.00 },
  'Bordado':                { custo: 60.45, setup: 139.50 },
  'Etiquetas brancas':      { custo: 8.10,  setup: 79.85 },
  'Hot stamping':           { custo: 22.04, setup: 226.91 },
  'Laser':                  { custo: 36.42, setup: 69.35 },
  'Laser circular':         { custo: 28.95, setup: 95.42 },
  'Silk Screen':            { custo: 24.71, setup: 135.16 },
  'Silk Screen Circular':   { custo: 3.37,  setup: 74.04 },
  'Silk screen têxtil':     { custo: 18.33, setup: 155.20 },
  'Tampografia':            { custo: 21.55, setup: 185.58 },
  'Transfer':               { custo: 31.07, setup: 133.01 },
  'UV Circular (360)':      { custo: 30.89, setup: 188.69 },
  'UV Digital':             { custo: 32.36, setup: 83.55 }
};

export const SIMPLES = 0.10;       // Simples Nacional
export const PEDIDO_MINIMO = 400;  // valor mínimo de pedido (R$)

export function getMarkup(custoTotal, estrategia = 'padrao') {
  const e = ['teto', 'padrao', 'piso'].includes(estrategia) ? estrategia : 'padrao';
  const tier = MARKUP.find((t) => custoTotal >= t.min && custoTotal < t.max) || MARKUP[MARKUP.length - 1];
  return { markup: tier[e], faixa: tier.nome };
}

/**
 * Preço aplicando markup ao produto e à impressão (separadamente).
 * custoUnit = custo do produto por peça; custoImprUnit = custo de impressão por peça.
 */
export function calcPrice(custoUnit, qtd, custoImprUnit = 0, estrategia = 'padrao') {
  const custoProd = custoUnit * qtd;
  const custoImpr = custoImprUnit * qtd;
  const { markup: mkProd, faixa: faixaProd } = getMarkup(custoProd, estrategia);
  const imprInfo = custoImpr > 0 ? getMarkup(custoImpr, estrategia) : { markup: 0, faixa: '—' };

  const total = custoProd * mkProd + (custoImpr > 0 ? custoImpr * imprInfo.markup : 0);
  const custoTotalReal = custoProd + custoImpr;
  const unit = qtd > 0 ? total / qtd : 0;
  const margem = total > 0 ? (total - custoTotalReal) / total : 0;
  const margemLiq = total > 0 ? (total - custoTotalReal - total * SIMPLES) / total : 0;

  return {
    estrategia, qtd, custoUnit, custoImprUnit,
    custoProd, custoImpr, custoTotalReal,
    mkProd, mkImpr: imprInfo.markup, faixaProd, faixaImpr: imprInfo.faixa,
    unit, total, margem, margemLiq
  };
}

// ===== Impressão (dados reais do impressao.json) =====

// Custo de impressão por peça de uma área, na faixa de quantidade (maior tier ≤ qtd) + handling
export function imprUnitCost(area, qtd) {
  if (!area || !area.prices) return 0;
  const tiers = Object.keys(area.prices).map(Number).sort((a, b) => a - b);
  let chosen = tiers[0];
  for (const t of tiers) if (qtd >= t) chosen = t;
  const price = area.prices[String(chosen)] || 0;
  return price + (area.handling || 0);
}

// Técnica preferida deduzida do nome do produto (a API decide a técnica)
export function tecnicaPreferida(nome = '') {
  const b = nome.toLowerCase();
  if (/camiseta|camisa|polo|têxtil|textil/.test(b)) return 'Silk screen têxtil';
  if (/boné|bone|bordad/.test(b)) return 'Bordado';
  if (/caneca|sublima|mouse pad|mousepad/.test(b)) return 'Transfer';
  if (/inox|metal|garrafa térmica|squeeze inox|alumín|laser/.test(b)) return 'Laser';
  if (/sacola|saco|tnt|algodão|ecobag|mochila/.test(b)) return 'Silk Screen';
  if (/chaveiro|crachá|adesivo|cordão|lanyard| uv/.test(b)) return 'UV Digital';
  if (/redondo|circular/.test(b)) return 'Laser circular';
  return 'Tampografia';
}

// Extrai o ref numérico de um SKU/identificador (ex.: "P11103" -> "11103")
export function extrairRef(sku) {
  if (sku === null || sku === undefined) return '';
  const m = String(sku).match(/(\d{3,})/);
  return m ? m[1] : '';
}

/**
 * Calcula o custo de impressão por peça para um produto, dado:
 *  - imprObj: entrada do impressao.json (ou null se não houver dados)
 *  - nome: nome do produto (para escolher a técnica)
 *  - cores: nº de cores da logo (vindo do agente / design_info)
 *  - qtd: quantidade
 * Retorna { custoImprUnit, tecnica, area, colors, fonte }.
 */
export function custoImpressao(imprObj, nome, cores, qtd) {
  const nCores = Math.max(parseInt(cores) || 1, 1);

  if (imprObj && imprObj.techs && Object.keys(imprObj.techs).length) {
    const techs = imprObj.techs;
    const pref = tecnicaPreferida(nome);
    const tecnica = techs[pref] ? pref : Object.keys(techs)[0];
    const areas = techs[tecnica] || [];

    // escolhe a faixa de cor: menor 'colors' que cubra o nº de cores pedido
    let candidatas = areas.filter((a) => (a.colors || 1) >= nCores);
    if (!candidatas.length) candidatas = areas;
    const tierCor = Math.min(...candidatas.map((a) => a.colors || 1));
    const areasTier = candidatas.filter((a) => (a.colors || 1) === tierCor);

    const custoImprUnit = areasTier.length
      ? areasTier.reduce((s, a) => s + imprUnitCost(a, qtd), 0) / areasTier.length
      : 0;
    const area = areasTier[0]
      ? `${areasTier[0].comp || ''} · ${areasTier[0].loc || ''} · ${areasTier[0].area || ''} mm`.trim()
      : null;

    return { custoImprUnit, tecnica, area, colors: tierCor, fonte: 'impressao.json' };
  }

  // Fallback: técnica genérica (custo/peça + setup rateado)
  const pref = tecnicaPreferida(nome);
  const tec = TECNICAS[pref] || TECNICAS['Tampografia'];
  const custoImprUnit = tec.custo + (qtd > 0 ? tec.setup / qtd : 0);
  return { custoImprUnit, tecnica: pref, area: null, colors: nCores, fonte: 'tecnica_generica' };
}
