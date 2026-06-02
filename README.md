# BHBAND Calculadora de Preços - API REST

API REST para cálculo de orçamentos BHBAND, integrada para uso com n8n, Claude e automações de atendimento.

## 🚀 Quick Start

### 1. Deploy na Vercel (1 minuto)

```bash
# Clone ou baixe este repositório
# Instale Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Após deploy, você terá uma URL como: `https://seu-projeto.vercel.app`

### 2. Testar a API

```bash
curl -X POST https://seu-projeto.vercel.app/api/calcular-orcamento \
  -H "Content-Type: application/json" \
  -d '{
    "quantidade": 500,
    "custoUnitario": 2.50,
    "nomeProduto": "Caneta Plástica",
    "personalizacao": "Tampografia",
    "estrategia": "PADRÃO"
  }'
```

---

## 📋 Endpoints Disponíveis

### 1. **POST `/api/calcular-orcamento`**
Calcula o preço final de um produto com personalização.

#### Request:
```json
{
  "quantidade": 500,
  "custoUnitario": 2.50,
  "nomeProduto": "Caneta Plástica",
  "personalizacao": "Tampografia",
  "estrategia": "PADRÃO"
}
```

#### Campos:
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `quantidade` | number | ✅ | Quantidade de unidades |
| `custoUnitario` | number | ✅ | Custo unitário em R$ |
| `nomeProduto` | string | ❌ | Nome do produto (padrão: "Produto") |
| `personalizacao` | string | ❌ | Técnica de personalização (padrão: "Nenhuma") |
| `estrategia` | string | ❌ | TETO / PADRÃO / PISO (padrão: PADRÃO) |

#### Response:
```json
{
  "sucesso": true,
  "dados_entrada": {
    "quantidade": 500,
    "custoUnitario": 2.50,
    "nomeProduto": "Caneta Plástica",
    "personalizacao": "Tampografia",
    "estrategia": "PADRÃO"
  },
  "calculo": {
    "strategy": "PADRÃO",
    "quantity": 500,
    "unitCost": 2.50,
    "totalProductCost": 1250,
    "markup": 2.1,
    "priceWithoutPersonalization": 5.25,
    "technique": "Tampografia",
    "personalizationCostUnit": 0.21,
    "setupFee": 1.40,
    "totalPrice": 6.86,
    "totalBudget": 3430.00,
    "margin": "38.50"
  },
  "orcamento_whatsapp": "Olá! Segue orçamento conforme solicitado 😊\n\n500x Caneta Plástica\nPersonalização: Tampografia\n\n💰 Valores: R$ 6.86/unidade\n🔥 Condição especial: R$ 6.28 cada\n📦 Total: R$ 3.430,00\n⏱ Produção: 5 a 12 dias úteis\n\nVamos seguir com o seu pedido?"
}
```

---

### 2. **GET `/api/sincronizar-shopify`**
Sincroniza o catálogo de produtos em tempo real do Shopify bhband.com.br

#### Response:
```json
{
  "sucesso": true,
  "produtos_sincronizados": 127,
  "timestamp": "2024-06-02T10:30:00.000Z",
  "catalogo": [
    {
      "id": 123456,
      "sku": "BHB-001-001",
      "nome": "Caneta Plástica",
      "preco_venda": 4.50,
      "custo_estimado": "2.25",
      "tecnica_sugerida": "Tampografia",
      "imagem": "https://..."
    }
  ],
  "nota": "Os custos são ESTIMADOS (preço ÷ 2.0). Ajuste manualmente conforme seus fornecedores reais."
}
```

**Uso**: Chamar este endpoint periodicamente (1× por dia) para sincronizar catálogo. Os custos são estimados automaticamente, mas devem ser ajustados manualmente.

---

### 3. **POST `/api/comparar-estrategias`**
Compara os 3 preços (TETO, PADRÃO, PISO) lado a lado.

#### Request:
```json
{
  "quantidade": 500,
  "custoUnitario": 2.50,
  "nomeProduto": "Caneta Plástica",
  "personalizacao": "Tampografia"
}
```

#### Response:
```json
{
  "sucesso": true,
  "produto": "Caneta Plástica",
  "comparacao": {
    "TETO": { "totalPrice": 7.15, "totalBudget": 3575 },
    "PADRÃO": { "totalPrice": 6.86, "totalBudget": 3430 },
    "PISO": { "totalPrice": 6.28, "totalBudget": 3140 }
  },
  "recomendacao": "PADRÃO"
}
```

---

### 4. **GET `/api/tecnicas`**
Lista todas as técnicas de personalização disponíveis.

#### Response:
```json
{
  "tecnicas": [
    "Serigrafia 1 cor",
    "Tampografia",
    "Sublimação",
    "DTF",
    "Nenhuma",
    ...
  ],
  "detalhes": {
    "Tampografia": {
      "costPerUnit": 0.10,
      "setupFee": 350
    }
  }
}
```

---

### 5. **GET `/api/estrategias`**
Lista as 3 estratégias de preço.

#### Response:
```json
{
  "estrategias": ["TETO", "PADRÃO", "PISO"],
  "descricao": {
    "TETO": "Preços mais altos (máxima margem)",
    "PADRÃO": "Recomendado para maioria dos casos",
    "PISO": "Preços competitivos para negociação"
  }
}
```

---

### 6. **GET `/api/health`**
Health check da API.

#### Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

---

## 🔗 Integração com n8n

### Passo 1: Adicionar node HTTP Request

1. No n8n, crie um novo workflow
2. Adicione um node **HTTP Request**
3. Configure:
   - **Method**: POST
   - **URL**: `https://seu-projeto.vercel.app/api/calcular-orcamento`
   - **Content-Type**: Application/JSON

### Passo 2: Mapear dados do seu workflow

No campo **Body**, adicione a expressão JSON:

```json
{
  "quantidade": "{{ $node['seu-node-anterior'].json.quantidade }}",
  "custoUnitario": "{{ $node['seu-node-anterior'].json.custo }}",
  "nomeProduto": "{{ $node['seu-node-anterior'].json.produto }}",
  "personalizacao": "{{ $node['seu-node-anterior'].json.tecnica }}",
  "estrategia": "PADRÃO"
}
```

### Passo 3: Usar resposta da API

A resposta ficará disponível como:
```
{{ $node['HTTP Request'].json.calculo.totalPrice }}
{{ $node['HTTP Request'].json.orcamento_whatsapp }}
```

---

## 📱 Exemplo de Integração com WhatsApp

### Fluxo recomendado no n8n:

```
Cliente → Qualificação (IA) 
  ↓
n8n recebe: quantidade, produto, técnica
  ↓
HTTP Request → API BHBAND
  ↓
API retorna: preço + mensagem WhatsApp
  ↓
n8n envia mensagem via WhatsApp (Twilio/N8N WhatsApp node)
```

### Node de WhatsApp (após HTTP Request):

```json
{
  "to": "{{ $node['seu-node'].json.cliente_whatsapp }}",
  "text": "{{ $node['HTTP Request'].json.orcamento_whatsapp }}"
}
```

---

## 🛠 Tecnicas Disponíveis

```
- Serigrafia 1 cor
- Serigrafia 2 cores
- Serigrafia 3 cores
- Serigrafia 4 cores
- Tampografia
- Gravação a laser
- Bordado pequeno
- Bordado médio
- Bordado grande
- Sublimação
- UV
- DTF
- Offset
- Digital
- Impressão UV
- Hot stamping
- Nenhuma (sem personalização)
```

---

## 📊 Estratégias de Markup

### TETO (Máxima Margem)
```
Até R$ 160: 2.50x
R$ 160 — 320: 2.25x
R$ 320 — 1.400: 2.15x
R$ 1.400 — 3.400: 2.05x
R$ 3.400 — 5.000: 1.95x
R$ 5.000 — 10.000: 1.85x
Acima de R$ 10.000: 1.75x
```

### PADRÃO (Recomendado)
```
Até R$ 160: 2.35x
R$ 160 — 320: 2.2x
R$ 320 — 1.400: 2.1x
R$ 1.400 — 3.400: 2.0x
R$ 3.400 — 5.000: 1.9x
R$ 5.000 — 10.000: 1.8x
Acima de R$ 10.000: 1.7x
```

### PISO (Competitivo)
```
Até R$ 160: 2.2x
R$ 160 — 320: 2.15x
R$ 320 — 1.400: 2.05x
R$ 1.400 — 3.400: 1.95x
R$ 3.400 — 5.000: 1.85x
R$ 5.000 — 10.000: 1.75x
Acima de R$ 10.000: 1.65x
```

---

## ⚠️ Validações

- **Quantidade**: Mínimo 1
- **Custo unitário**: Qualquer valor positivo
- **Custo total do pedido**: Mínimo R$ 400
- **Estratégia**: Apenas TETO, PADRÃO ou PISO
- **Técnica**: Deve existir na lista de técnicas

### Exemplos de erro:

```json
{
  "erro": "Valor do pedido abaixo do mínimo",
  "custo_total": 250,
  "minimo_permitido": 400
}
```

---

## 🔐 Rate Limiting

Nenhum rate limiting na versão gratuita, mas:
- Plano grátis Vercel: 100 requisições/segundo
- Recomendado: máximo 10 requisições/segundo no seu workflow n8n

---

## 📦 Deploy & Manutenção

### Deploy automático com GitHub

1. Faça push do código para GitHub
2. Conecte seu repositório na Vercel
3. Cada push gera novo deploy automaticamente

### Atualizar custos/técnicas

Edite o arquivo `api/index.js`:
- Linha 20-48: Tabelas de markup
- Linha 50-62: Técnicas de personalização

Salve → Push → Deploy automático ✅

---

## 💡 Troubleshooting

### "CORS error"
A API aceita requisições de qualquer origem. Se o erro persistir:
- Verifique se a URL está correta
- Teste com `curl` primeiro
- Verifique logs da Vercel

### "400 - Valor abaixo do mínimo"
Multiplique `quantidade × custoUnitario` deve ser ≥ R$ 400

### "404 - Endpoint não encontrado"
Verifique se a URL está exata: `/api/calcular-orcamento` (não `/calcular-orcamento`)

---

## 📞 Suporte

Para dúvidas ou integrações customizadas, entre em contato com o time BHBAND.

---

## 📄 Licença

Propriedade BHBAND - Uso interno autorizado para integrações n8n, Claude e automações de atendimento.

---

**Última atualização**: Junho 2024
**Versão da API**: 1.0.0
