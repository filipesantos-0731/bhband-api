# 🔗 Exemplos de Integração - BHBAND API

## 1️⃣ Integração n8n (WhatsApp + Claude)

### Fluxo Recomendado:

```
Cliente entra no WhatsApp
    ↓
n8n recebe mensagem (via Twilio/Webhook)
    ↓
Claude (IA) qualifica: extrai produto, quantidade, técnica
    ↓
HTTP Request → API BHBAND
    ↓
API retorna preço + mensagem formatada
    ↓
n8n envia orçamento via WhatsApp
    ↓
Histórico salvo no Sheets/DB
```

### Node 1: Webhook (recebe WhatsApp)
```
Trigger: "Webhook"
Method: POST
Body example:
{
  "message": "Quero 500 canetas plásticas com tampografia",
  "from": "+5511999999999",
  "timestamp": "2024-06-02T10:30:00Z"
}
```

### Node 2: Claude (extrai dados)
```javascript
// Usar node "OpenAI" ou "Anthropic" no n8n
prompt: `Extraia do texto a seguir: quantidade, produto, técnica de personalização.
Responda em JSON puro, sem markdown.
Texto: "${$node['Webhook'].json.message}"
Exemplo de resposta:
{"quantidade": 500, "produto": "Caneta Plástica", "tecnica": "Tampografia"}`
```

Resposta esperada:
```json
{
  "quantidade": 500,
  "produto": "Caneta Plástica",
  "tecnica": "Tampografia"
}
```

### Node 3: Buscar custo do catálogo
```javascript
// Se você integrou com Sheets com catálogo
// Buscar custo do produto
lookup(product_name) → return custo_unitario
```

### Node 4: HTTP Request → API BHBAND
```json
{
  "url": "https://seu-api.vercel.app/api/calcular-orcamento",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "quantidade": "{{ $node['Claude'].json.quantidade }}",
    "custoUnitario": "{{ $node['Sheets'].json.custo_unitario }}",
    "nomeProduto": "{{ $node['Claude'].json.produto }}",
    "personalizacao": "{{ $node['Claude'].json.tecnica }}",
    "estrategia": "PADRÃO"
  }
}
```

### Node 5: Enviar WhatsApp
```json
{
  "service": "twilio",
  "from": "+1234567890",
  "to": "{{ $node['Webhook'].json.from }}",
  "text": "{{ $node['HTTP Request'].json.orcamento_whatsapp }}"
}
```

### Node 6: Salvar no histórico (Google Sheets)
```json
{
  "document_id": "SEU_SHEET_ID",
  "append_mode": true,
  "values": [
    [
      "{{ $node['Webhook'].json.timestamp }}",
      "{{ $node['Webhook'].json.from }}",
      "{{ $node['Claude'].json.produto }}",
      "{{ $node['Claude'].json.quantidade }}",
      "{{ $node['Claude'].json.tecnica }}",
      "{{ $node['HTTP Request'].json.calculo.totalPrice }}",
      "{{ $node['HTTP Request'].json.calculo.totalBudget }}",
      "ENVIADO"
    ]
  ]
}
```

---

## 2️⃣ Integração Make (ex-Integromat)

```
Webhook → Parser (extrair JSON) → HTTP POST → Formatter (WhatsApp) → Twilio
```

### HTTP Module Settings:
```
URL: https://seu-api.vercel.app/api/calcular-orcamento
Method: POST
Content-type: application/json
Body:
{
  "quantidade": {{quantidade}},
  "custoUnitario": {{custo}},
  "nomeProduto": "{{produto}}",
  "personalizacao": "{{tecnica}}",
  "estrategia": "PADRÃO"
}
```

### Mapear resposta:
```
{{response.orcamento_whatsapp}} → enviar ao Twilio
{{response.calculo.totalPrice}} → salvar no banco
```

---

## 3️⃣ Integração Zapier

### Zap Structure:
```
Trigger: Webhook (recebe dados do seu form/WhatsApp)
    ↓
Action: Webhooks by Zapier (POST à API BHBAND)
    ↓
Action: Formatter (extrair dados da resposta)
    ↓
Action: Twilio (enviar WhatsApp)
    ↓
Action: Google Sheets (log)
```

### Setup:
1. **Trigger**: "Webhooks by Zapier" → "Catch Raw Hook"
   - Copie URL
   - Teste com curl abaixo

2. **Action 1**: "Webhooks by Zapier" → "POST"
   ```
   URL: https://seu-api.vercel.app/api/calcular-orcamento
   Data:
   {
     "quantidade": {{quantidade}},
     "custoUnitario": {{custo}},
     "nomeProduto": "{{produto}}",
     "personalizacao": "{{tecnica}}",
     "estrategia": "PADRÃO"
   }
   ```

3. **Action 2**: "Twilio" → "Send WhatsApp Message"
   ```
   To: {{from}}
   Message Body: {{response.orcamento_whatsapp}}
   ```

---

## 4️⃣ Integração Google Apps Script

```javascript
function calcularOrcamento(quantidade, custoUnitario, produto, tecnica) {
  const apiUrl = "https://seu-api.vercel.app/api/calcular-orcamento";
  
  const payload = {
    "quantidade": quantidade,
    "custoUnitario": custoUnitario,
    "nomeProduto": produto,
    "personalizacao": tecnica,
    "estrategia": "PADRÃO"
  };
  
  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  const response = UrlFetchApp.fetch(apiUrl, options);
  const result = JSON.parse(response.getContentText());
  
  return {
    precoUnitario: result.calculo.totalPrice,
    orcamentoTotal: result.calculo.totalBudget,
    mensagemWhatsApp: result.orcamento_whatsapp,
    margem: result.calculo.margin
  };
}

// Usar em fórmula do Google Sheets:
// =calcularOrcamento(A1, B1, C1, D1)
```

---

## 5️⃣ Integração Python/Requests

```python
import requests
import json

api_url = "https://seu-api.vercel.app/api/calcular-orcamento"

def gerar_orcamento(quantidade, custo_unitario, produto, tecnica):
    payload = {
        "quantidade": quantidade,
        "custoUnitario": custo_unitario,
        "nomeProduto": produto,
        "personalizacao": tecnica,
        "estrategia": "PADRÃO"
    }
    
    response = requests.post(api_url, json=payload)
    data = response.json()
    
    if response.status_code == 200:
        return {
            "preco_unitario": data["calculo"]["totalPrice"],
            "orcamento_total": data["calculo"]["totalBudget"],
            "mensagem_whatsapp": data["orcamento_whatsapp"],
            "margem": data["calculo"]["margin"]
        }
    else:
        return {"erro": data["erro"]}

# Exemplo de uso:
resultado = gerar_orcamento(500, 2.50, "Caneta Plástica", "Tampografia")
print(resultado)
```

---

## 6️⃣ Integração JavaScript/Frontend

```javascript
async function calcularOrcamento(quantidade, custoUnitario, produto, tecnica) {
  const apiUrl = "https://seu-api.vercel.app/api/calcular-orcamento";
  
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        quantidade: quantidade,
        custoUnitario: custoUnitario,
        nomeProduto: produto,
        personalizacao: tecnica,
        estrategia: "PADRÃO"
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      return {
        precoUnitario: data.calculo.totalPrice,
        orcamentoTotal: data.calculo.totalBudget,
        mensagemWhatsApp: data.orcamento_whatsapp,
        margem: data.calculo.margin
      };
    } else {
      throw new Error(data.erro);
    }
  } catch (error) {
    console.error("Erro:", error);
    return null;
  }
}

// Uso em um formulário:
document.getElementById("calcularBtn").addEventListener("click", async () => {
  const qtd = document.getElementById("quantidade").value;
  const custo = document.getElementById("custo").value;
  const produto = document.getElementById("produto").value;
  const tecnica = document.getElementById("tecnica").value;
  
  const resultado = await calcularOrcamento(qtd, custo, produto, tecnica);
  
  if (resultado) {
    document.getElementById("resultado").innerHTML = `
      <p>Preço unitário: R$ ${resultado.precoUnitario.toFixed(2)}</p>
      <p>Total: R$ ${resultado.orcamentoTotal.toFixed(2)}</p>
      <p>Margem: ${resultado.margem}%</p>
    `;
  }
});
```

---

## 7️⃣ Teste com cURL (para debug)

```bash
# Teste básico
curl -X POST https://seu-api.vercel.app/api/calcular-orcamento \
  -H "Content-Type: application/json" \
  -d '{
    "quantidade": 100,
    "custoUnitario": 5.00,
    "nomeProduto": "Caneca Cerâmica",
    "personalizacao": "Sublimação",
    "estrategia": "PADRÃO"
  }'

# Testar TETO (máxima margem)
curl -X POST https://seu-api.vercel.app/api/calcular-orcamento \
  -H "Content-Type: application/json" \
  -d '{
    "quantidade": 50,
    "custoUnitario": 1.00,
    "nomeProduto": "Boné",
    "personalizacao": "Bordado pequeno",
    "estrategia": "TETO"
  }'

# Testar PISO (preço competitivo)
curl -X POST https://seu-api.vercel.app/api/calcular-orcamento \
  -H "Content-Type: application/json" \
  -d '{
    "quantidade": 10000,
    "custoUnitario": 0.50,
    "nomeProduto": "Adesivo",
    "personalizacao": "Impressão UV",
    "estrategia": "PISO"
  }'

# Comparar as 3 estratégias
curl -X POST https://seu-api.vercel.app/api/comparar-estrategias \
  -H "Content-Type: application/json" \
  -d '{
    "quantidade": 1000,
    "custoUnitario": 3.00,
    "nomeProduto": "Camiseta"
  }'

# Listar técnicas disponíveis
curl -X GET https://seu-api.vercel.app/api/tecnicas

# Listar estratégias
curl -X GET https://seu-api.vercel.app/api/estrategias

# Health check
curl -X GET https://seu-api.vercel.app/api/health
```

---

## 📝 Dicas de Integração

1. **Cache local**: Se a API tiver downtime, cache a resposta no localStorage
2. **Retry logic**: Faça 2-3 tentativas antes de mostrar erro ao usuário
3. **Validação**: Valide quantidade ≥ 1 e custo total ≥ R$ 400 antes de chamar API
4. **Timeout**: Coloque timeout de 10 segundos em chamadas HTTP
5. **Log**: Registre todas as chamadas para auditoria e troubleshooting

---

**Precisa de help?** Entre em contato com o time BHBAND 💬
