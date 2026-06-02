# 🚀 Guia Passo a Passo: n8n + API BHBAND + WhatsApp + Claude

## Objetivo
Criar um workflow automático que:
1. Recebe mensagem do cliente no WhatsApp
2. Claude extrai os dados (produto, quantidade, técnica)
3. API BHBAND calcula o orçamento
4. Envia resposta formatada no WhatsApp
5. Salva histórico

---

## 📋 Pré-requisitos

- ✅ API BHBAND deployada (https://seu-projeto.vercel.app)
- ✅ Conta no n8n.io (gratuita)
- ✅ Twilio ou outro provedor WhatsApp configurado
- ✅ Chave API do Claude (ou OpenAI)
- ✅ Google Sheets para armazenar histórico

---

## 🎯 Passo 1: Criar Workflow no n8n

### 1.1 Acessar n8n
1. Acesse https://n8n.io
2. Clique em "Create a free account"
3. Faça login

### 1.2 Criar novo workflow
1. Clique em "Create a new workflow"
2. Nomeie como "BHBAND - WhatsApp Automático"

---

## 🔔 Passo 2: Configurar Webhook (Receber WhatsApp)

### 2.1 Adicionar node Webhook
1. Clique no "+" para adicionar node
2. Busque por "Webhook"
3. Selecione "Webhook"

### 2.2 Configurar Webhook
```
- Authentication: None
- Method: POST
- Response mode: "When last node finishes"
```

Clique em **Listen** para ativar o webhook
Copie a URL gerada (vai parecer com: https://n8n.yourinstance.com/webhook/xxxxx)

### 2.3 Integrar no seu sistema de WhatsApp
Se usa Twilio:
```
- Webhook URL: https://sua-url-webhook-n8n
- Event: incoming message
```

Se usa Baileys/N8N WhatsApp Trigger:
Pule esta seção e use o node "WhatsApp Trigger" direto

---

## 🤖 Passo 3: Configurar Claude (Qualificação)

### 3.1 Adicionar node Claude
1. Clique "+" → Busque "Claude" ou "OpenAI"
2. Selecione "Claude" (ou "OpenAI" se usar OpenAI)

### 3.2 Configurar Claude
```
Model: Claude 3 Haiku
Max tokens: 1000
Temperature: 0.3 (mais determinístico)

System Prompt:
"Você é um assistente de atendimento da BHBAND.
Sua função é extrair informações de pedidos de clientes.
Responda SEMPRE em JSON puro, sem markdown.
Extraia: quantidade, produto, tecnica_personalização.
Se não souber algo, coloque null."

User Message (usar expressões):
"Mensagem do cliente: {{ $node['Webhook'].json.message }}"
```

### 3.3 Exemplo de resposta esperada
```json
{
  "quantidade": 500,
  "produto": "Caneta Plástica",
  "tecnica": "Tampografia"
}
```

---

## 💰 Passo 4: Buscar Custo do Catálogo

### 4.1 Adicionar node Google Sheets (VLOOKUP)
1. Clique "+" → Busque "Google Sheets"
2. Selecione "Lookup"

### 4.2 Configurar
```
Document ID: [ID da sua planilha com catálogo]
Sheet Name: "Catálogo"
Lookup Column: "Produto" (coluna A)
Return Column: "Custo" (coluna B)
Lookup Value: {{ $node['Claude'].json.produto }}
```

**Alternativa**: Se não tiver Google Sheets, deixe um custo padrão via "Set":
```json
{
  "custo_unitario": 2.50
}
```

---

## 📊 Passo 5: Chamar API BHBAND

### 5.1 Adicionar node HTTP Request
1. Clique "+" → Busque "HTTP Request"
2. Selecione "HTTP Request"

### 5.2 Configurar
```
Method: POST
URL: https://seu-projeto.vercel.app/api/calcular-orcamento

Headers:
{
  "Content-Type": "application/json"
}

Body (usar JSON):
{
  "quantidade": {{ $node['Claude'].json.quantidade }},
  "custoUnitario": {{ $node['Sheets'].json.custo }} or 2.50,
  "nomeProduto": "{{ $node['Claude'].json.produto }}",
  "personalizacao": "{{ $node['Claude'].json.tecnica }}",
  "estrategia": "PADRÃO"
}
```

### 5.3 Mapear resposta
A resposta fica disponível em:
```
{{ $node['HTTP Request'].json.calculo.totalPrice }}
{{ $node['HTTP Request'].json.orcamento_whatsapp }}
{{ $node['HTTP Request'].json.calculo.totalBudget }}
{{ $node['HTTP Request'].json.calculo.margin }}
```

---

## 📱 Passo 6: Enviar WhatsApp

### 6.1 Adicionar node Twilio (ou Baileys)

**Se usar Twilio:**
1. Clique "+" → Busque "Twilio"
2. Selecione "Twilio" → "Send Message"

**Configurar:**
```
To: {{ $node['Webhook'].json.from }}
(ou {{ $node['Webhook'].json.cliente_whatsapp }})

Message Body:
{{ $node['HTTP Request'].json.orcamento_whatsapp }}

Service: WhatsApp
```

**Se usar Baileys (melhor para Brasil):**
1. Clique "+" → Busque "WhatsApp"
2. Selecione "Send Message"

**Configurar:**
```
Phone Number: {{ $node['Webhook'].json.from }}
Message: {{ $node['HTTP Request'].json.orcamento_whatsapp }}
```

---

## 📝 Passo 7: Salvar no Histórico (Google Sheets)

### 7.1 Adicionar node Google Sheets (Append)
1. Clique "+" → Busque "Google Sheets"
2. Selecione "Append"

### 7.2 Configurar
```
Document ID: [ID da sua planilha]
Sheet Name: "Histórico"

Values:
Coluna 1 (Timestamp): {{ new Date().toISOString() }}
Coluna 2 (Cliente): {{ $node['Webhook'].json.from }}
Coluna 3 (Produto): {{ $node['Claude'].json.produto }}
Coluna 4 (Quantidade): {{ $node['Claude'].json.quantidade }}
Coluna 5 (Técnica): {{ $node['Claude'].json.tecnica }}
Coluna 6 (Preço Unit.): {{ $node['HTTP Request'].json.calculo.totalPrice }}
Coluna 7 (Total): {{ $node['HTTP Request'].json.calculo.totalBudget }}
Coluna 8 (Margem): {{ $node['HTTP Request'].json.calculo.margin }}
Coluna 9 (Status): "ENVIADO"
```

---

## ✅ Passo 8: Adicionar Tratamento de Erros

### 8.1 Adicionar node "Error Trigger"
1. Clique "+" → Busque "Error Trigger"
2. Configure para fazer retry em caso de erro

### 8.2 Configurar Notificação
Se HTTP Request falhar, envie mensagem de erro:
```
Olá! Houve um erro ao gerar o orçamento.
Favor tentar novamente em 1 minuto.
Código de erro: {{ $node['HTTP Request'].json.erro }}
```

---

## 🧪 Passo 9: Testar Workflow

### 9.1 Ativar Webhook
1. No n8n, clique em "Webhook" node
2. Clique "Listen"
3. Copie a URL

### 9.2 Testar com cURL
```bash
curl -X POST https://sua-url-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+5511999999999",
    "message": "Quero 500 canetas plásticas com tampografia"
  }'
```

### 9.3 Testar no WhatsApp Real
Envie uma mensagem para o número do seu bot no WhatsApp:
```
500 canetas plásticas tampografia
```

Resultado esperado: Orçamento formatado com preço, total e condições

---

## 🔄 Estrutura Visual do Workflow

```
    ┌─────────────┐
    │   Webhook   │ ← Mensagem do WhatsApp
    └──────┬──────┘
           │
    ┌──────▼──────────┐
    │     Claude      │ ← Extrai dados
    └──────┬──────────┘
           │
    ┌──────▼──────────────┐
    │  Google Sheets      │ ← Busca custo
    │  (Lookup)           │
    └──────┬──────────────┘
           │
    ┌──────▼──────────────┐
    │  HTTP Request API   │ ← Calcula preço
    │  BHBAND             │
    └──────┬──────────────┘
           │
    ┌──────▼──────────────┐
    │  Twilio/Baileys     │ ← Envia WhatsApp
    │  (Send Message)     │
    └──────┬──────────────┘
           │
    ┌──────▼──────────────┐
    │  Google Sheets      │ ← Salva histórico
    │  (Append)           │
    └─────────────────────┘
```

---

## 🛠 Troubleshooting

### "HTTP Request retorna erro 400"
- Verifique: `quantidade`, `custoUnitario`, `nomeProduto` estão sendo passados
- Verifique: custo total (`quantidade × custoUnitario`) é ≥ R$ 400
- Verifique: técnica existe na lista (chamar GET /api/tecnicas)

### "Claude não retorna JSON"
- Adicione no System Prompt: "Responda SEMPRE em JSON puro"
- Reduzir `temperature` para 0.1 (mais determinístico)
- Testar manualmente com a mesma mensagem

### "WhatsApp não recebe mensagem"
- Verifique: número está no formato correto (+55 11 99999-9999)
- Verifique: Twilio/Baileys está autenticado
- Testar sending de mensagem manual no Twilio/Baileys

### "Google Sheets não salva"
- Verifique: autenticação Google está conectada
- Verifique: Sheet name está correto
- Verifique: colunas existem na planilha

---

## 📊 Próximos Passos

### Automações avançadas:
1. **Multi-produto**: Cliente pede "2 tipos de caneta" → Claude divide em 2 linhas
2. **Desconto para volume**: Se quantidade > 5000, aplica PISO automaticamente
3. **Aprovação gerencial**: Se desconto > 5%, envia para gerente aprovar
4. **Integração CRM**: Salvar cliente no Pipedrive/RD Station
5. **Agendamento**: Enviar follow-up após 24h se cliente não respondeu

---

## 🎓 Referências

- [Documentação n8n](https://docs.n8n.io)
- [Documentação API BHBAND](./README.md)
- [Exemplos de Integração](./EXEMPLOS_INTEGRACAO.md)
- [Deploy Guide](./DEPLOY.md)

---

**Precisando de ajuda?** Entre em contato! 💬
