# ⚡ Quick Reference - BHBAND API

## 🎯 URLs da API

```
Production: https://seu-projeto.vercel.app/api/

Health:    GET  /api/health
Calcular:  POST /api/calcular-orcamento
Comparar:  POST /api/comparar-estrategias
Shopify:   GET  /api/sincronizar-shopify
Técnicas:  GET  /api/tecnicas
Estrat.:   GET  /api/estrategias
```

---

## 📋 Request Principal

```json
{
  "quantidade": 500,
  "custoUnitario": 2.50,
  "nomeProduto": "Caneta Plástica",
  "personalizacao": "Tampografia",
  "estrategia": "PADRÃO"
}
```

| Campo | Tipo | Obr | Exemplo | Min | Max |
|-------|------|-----|---------|-----|-----|
| quantidade | number | ✅ | 500 | 1 | - |
| custoUnitario | number | ✅ | 2.50 | 0 | - |
| nomeProduto | string | ❌ | Caneta | - | - |
| personalizacao | string | ❌ | Tampografia | - | - |
| estrategia | string | ❌ | PADRÃO | - | - |

**Obs:** `quantidade × custoUnitario` deve ser ≥ R$ 400

---

## 📊 Estratégias

| Estratégia | Uso | Markup (Exemplo) |
|-----------|-----|-----------------|
| **TETO** | Máxima margem | 2.25x |
| **PADRÃO** | 90% dos casos | 2.10x |
| **PISO** | Negociações grandes | 1.95x |

---

## 🎨 Técnicas (17 opções)

```
Serigrafia 1 cor      Tampografia          DTF
Serigrafia 2 cores    Gravação a laser     UV
Serigrafia 3 cores    Bordado pequeno      Offset
Serigrafia 4 cores    Bordado médio        Digital
                      Bordado grande       Impressão UV
                      Sublimação           Hot stamping
                                           Nenhuma (sem pers.)
```

---

## 💰 Exemplo de Resposta

```json
{
  "calculo": {
    "quantity": 500,
    "totalPrice": 6.16,           ← Preço por unidade
    "totalBudget": 3080.00,       ← Total do pedido
    "margin": "57.79"             ← Margem bruta
  },
  "orcamento_whatsapp": "Olá! Segue orçamento..."
}
```

---

## 🚨 Erros Comuns

| Erro | Causa | Solução |
|------|-------|---------|
| `400 - Valor abaixo do mínimo` | Total < R$ 400 | Aumentar quantidade |
| `400 - Campo obrigatório` | Faltou `quantidade` ou `custo` | Verificar payload |
| `404 - Endpoint não encontrado` | URL errada | Usar `/api/` (com barra) |
| `500 - Internal Server Error` | Erro na API | Chamar `/api/health` e aguardar |

---

## 📱 Integração n8n

### Dados do Claude → HTTP Request:
```
quantidade = Claude.json.quantidade
custoUnitario = Sheets.json.custo
nomeProduto = Claude.json.produto
personalizacao = Claude.json.tecnica
estrategia = "PADRÃO" (fixo)
```

### HTTP Request → WhatsApp:
```
$node['HTTP Request'].json.orcamento_whatsapp
```

### Salvar no Sheets:
```
Timestamp: new Date().toISOString()
Cliente: $node['Webhook'].json.from
Produto: $node['Claude'].json.produto
Preço: $node['HTTP Request'].json.calculo.totalPrice
Total: $node['HTTP Request'].json.calculo.totalBudget
```

---

## 🧪 Teste Rápido (cURL)

```bash
# PADRÃO
curl -X POST https://seu-url.vercel.app/api/calcular-orcamento \
  -H "Content-Type: application/json" \
  -d '{"quantidade":500,"custoUnitario":2.5,"estrategia":"PADRÃO"}'

# TETO (máxima margem)
curl -X POST https://seu-url.vercel.app/api/calcular-orcamento \
  -H "Content-Type: application/json" \
  -d '{"quantidade":50,"custoUnitario":1,"estrategia":"TETO"}'

# PISO (competitivo)
curl -X POST https://seu-url.vercel.app/api/calcular-orcamento \
  -H "Content-Type: application/json" \
  -d '{"quantidade":10000,"custoUnitario":0.5,"estrategia":"PISO"}'

# Comparar 3 estratégias
curl -X POST https://seu-url.vercel.app/api/comparar-estrategias \
  -H "Content-Type: application/json" \
  -d '{"quantidade":500,"custoUnitario":2.5}'
```

---

## 📈 Markup por Faixa (PADRÃO)

| Custo Total | Markup |
|-------------|--------|
| R$ 0 — 160 | 2.35x |
| R$ 160 — 320 | 2.20x |
| R$ 320 — 1.400 | 2.10x |
| R$ 1.400 — 3.400 | 2.00x |
| R$ 3.400 — 5.000 | 1.90x |
| R$ 5.000 — 10.000 | 1.80x |
| R$ 10.000+ | 1.70x |

---

## ⏱️ Latência Esperada

- Chamada HTTP: **50-200ms**
- Cálculo: **<1ms**
- Total: **~100-250ms** (imperceptível)

---

## 🔄 Sincronizar Shopify

```bash
curl -X GET https://seu-url.vercel.app/api/sincronizar-shopify
```

Retorna:
- 127 produtos (ou quantos tiver no site)
- SKU formatado (BHB-XXX-NNN)
- Custo estimado (preço ÷ 2.0)
- Técnica sugerida automaticamente

---

## 💾 Atualizar após Deploy

```bash
# Editar arquivo
nano api/index.js

# Commit + Push (GitHub)
git add .
git commit -m "Atualizar markups"
git push

# Vercel faz deploy automaticamente (~1-2 min)
```

---

## 🆘 Troubleshooting Rápido

1. **API não responde**
   → Chamar `/api/health` para verificar status

2. **n8n falha no HTTP Request**
   → Validar JSON do body (sem aspas não-escapadas)

3. **Claude não extrai dados corretamente**
   → Incluir no system prompt: "SEMPRE responda em JSON puro"

4. **WhatsApp não envia**
   → Verificar número está em formato +55 (código país)

5. **Shopify retorna 503**
   → Aguardar 5 min e tentar novamente

---

## 📚 Arquivos de Referência

- **[README.md](./README.md)** — Documentação completa da API
- **[GUIA_N8N_PASSO_A_PASSO.md](./GUIA_N8N_PASSO_A_PASSO.md)** — Setup de workflow
- **[EXEMPLOS_INTEGRACAO.md](./EXEMPLOS_INTEGRACAO.md)** — Exemplos de código
- **[DEPLOY.md](./DEPLOY.md)** — Como fazer deploy

---

**Última atualização**: Junho 2024 | **Versão**: 1.0.0
