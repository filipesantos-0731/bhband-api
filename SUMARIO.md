# 📦 BHBAND API - Sumário Completo de Entrega

## ✅ O que foi entregue

### 1️⃣ **API REST Funcional** ✨

Uma aplicação Node.js com Express que oferece:

#### Endpoints:
- `POST /api/calcular-orcamento` — Calcula preço + gera mensagem WhatsApp
- `POST /api/comparar-estrategias` — Compara os 3 preços (TETO/PADRÃO/PISO)
- `GET /api/sincronizar-shopify` — Sincroniza catálogo em tempo real
- `GET /api/tecnicas` — Lista técnicas de personalização
- `GET /api/estrategias` — Lista estratégias de preço
- `GET /api/health` — Health check

#### Lógica integrada:
- ✅ 3 estratégias de markup (TETO, PADRÃO, PISO)
- ✅ Cálculo inteligente por faixa de custo total (não apenas quantidade)
- ✅ 17 técnicas de personalização com custos
- ✅ Validação de pedido mínimo (R$ 400)
- ✅ Geração automática de mensagem WhatsApp formatada
- ✅ Cálculo de margem bruta
- ✅ Suporte a Shopify (sincronização automática)

---

### 2️⃣ **Documentação Completa**

#### 📘 README.md
- Como testar a API
- Descrição de cada endpoint
- Exemplos de request/response
- Explicação das estratégias de markup
- Troubleshooting

#### 📘 DEPLOY.md
- 3 opções de deployment (GitHub + Vercel, Vercel CLI, Netlify)
- Passo a passo visual
- Como atualizar após deploy
- Monitoramento

#### 📘 EXEMPLOS_INTEGRACAO.md
- Integração n8n (com workflow completo)
- Integração Make (ex-Integromat)
- Integração Zapier
- Google Apps Script
- Python/Requests
- JavaScript/Fetch
- Exemplos de cURL para teste

#### 📘 GUIA_N8N_PASSO_A_PASSO.md
- 9 passos completos para integrar com n8n
- Como configurar Claude
- Como enviar WhatsApp
- Como salvar histórico em Google Sheets
- Tratamento de erros
- Troubleshooting

---

### 3️⃣ **Arquivos de Configuração**

#### 📄 package.json
- Dependências: Express, Axios, Dotenv
- Scripts: dev, start, build

#### 📄 vercel.json
- Configuração para deploy em Vercel
- Versão 2 da API (suporta serverless)

#### 📄 .gitignore
- Node modules, variáveis de ambiente, logs, etc

#### 📄 n8n-workflow-example.json
- Exemplo de workflow pronto para importar no n8n
- Com todos os nodes pré-configurados

---

### 4️⃣ **Funcionalidades Prontas**

✅ **Múltiplas Estratégias de Preço**
```
TETO:     Máxima margem (para negociações altas)
PADRÃO:   Recomendado para maioria dos casos
PISO:     Competitivo (para grandes volumes)
```

✅ **Cálculo Inteligente**
```
Produto: quantidade × custo × markup_por_faixa
Personalização: (técnica_custo × markup) + setup_diluído
Total: produto + personalização
```

✅ **Técnicas de Personalização** (17 opções)
```
Serigrafia (1-4 cores)
Tampografia
Sublimação
DTF / UV / Offset / Digital
Bordado (pequeno, médio, grande)
Gravação a laser
Hot stamping
E mais...
```

✅ **Validações**
```
- Quantidade mínima: 1
- Custo total mínimo: R$ 400
- Estima custos automaticamente do Shopify
- Sugere técnica baseada no nome do produto
```

✅ **Integração Shopify**
```
- Endpoint sincroniza produtos em tempo real
- Estima custos automaticamente (preço ÷ 2.0)
- Fallback para proxy (CORS)
- Suporta até 250 produtos
```

---

## 🚀 Como Começar

### Passo 1: Deploy (5 minutos)

**Opção A: GitHub + Vercel (Recomendado)**
```bash
git init && git add . && git commit -m "Initial"
git branch -M main
git remote add origin https://github.com/SEU-USERNAME/bhband-api
git push -u origin main

# Depois acesse https://vercel.com e importe seu repositório
```

**Opção B: Vercel CLI**
```bash
npm i -g vercel
vercel login
vercel
# Pronto! URL será gerada
```

**Opção C: Netlify (mais simples)**
```bash
npm install
vercel build  # ou netlify deploy
```

### Passo 2: Testar a API (2 minutos)

```bash
# Teste health
curl https://seu-url.vercel.app/api/health

# Teste cálculo
curl -X POST https://seu-url.vercel.app/api/calcular-orcamento \
  -H "Content-Type: application/json" \
  -d '{
    "quantidade": 500,
    "custoUnitario": 2.50,
    "nomeProduto": "Caneta Plástica",
    "personalizacao": "Tampografia"
  }'
```

### Passo 3: Integrar com n8n (30 minutos)

Siga o arquivo **GUIA_N8N_PASSO_A_PASSO.md** com 9 passos simples

---

## 📊 Estrutura de Arquivos

```
calculadora - BH band/
├── api/
│   └── index.js                    ← Código principal da API
├── package.json                    ← Dependências
├── vercel.json                     ← Config de deploy
├── .gitignore                      ← Git ignore
├── README.md                       ← Documentação principal
├── DEPLOY.md                       ← Guia de deployment
├── EXEMPLOS_INTEGRACAO.md          ← Exemplos de integração
├── GUIA_N8N_PASSO_A_PASSO.md      ← Guia n8n completo
├── n8n-workflow-example.json       ← Workflow pronto
└── SUMARIO.md                      ← Este arquivo
```

---

## 💡 Exemplo de Fluxo de Uso

### Cliente envia mensagem no WhatsApp:
```
"Quero 500 canetas plásticas com tampografia"
```

### n8n recebe + processa:
```
1. Claude extrai: quantidade=500, produto=Caneta, tecnica=Tampografia
2. Google Sheets busca: custo_unitario=2.50
3. API BHBAND calcula:
   - Custo total: 500 × 2.50 = R$ 1.250 (faixa "Muito Pequeno")
   - Markup: 2.10x
   - Preço unit: R$ 6.16
   - Total: R$ 3.080
4. WhatsApp recebe resposta formatada:
```

**Resposta enviada:**
```
Olá! Segue orçamento conforme solicitado 😊

500x Caneta Plástica
Personalização: Tampografia

💰 Valores: R$ 6.16/unidade
🔥 Condição especial para fechamento ainda hoje: R$ 6.03 cada
📦 Total: R$ 3.080,00
⏱ Produção: 5 a 12 dias úteis após aprovação da arte

Vamos seguir com o seu pedido?
```

---

## ⚙️ Personalizações Fáceis

### 1. Alterar markups
Edite `api/index.js`, linhas 20-48:
```javascript
const MARKUP_TABLES = {
  TETO: { /* tabela */ },
  PADRÃO: { /* tabela */ },
  PISO: { /* tabela */ }
}
```

### 2. Adicionar técnica
Adicione em `api/index.js`, linhas 50-62:
```javascript
'Sua técnica': { costPerUnit: 0.50, setupFee: 500 }
```

### 3. Alterar pedido mínimo
Procure por `if (totalProductCost < 400)` e altere o valor

### 4. Alterar taxa Simples Nacional
Edite o cálculo de margem (linha ~180)

---

## 🔐 Segurança

- ✅ Nenhuma credencial armazenada no código
- ✅ CORS aberto (permitir requisições de qualquer origem)
- ✅ Sem autenticação necessária (para simplicidade)
- ⚠️ Se adicionar autenticação depois: use Bearer tokens ou API keys

---

## 📈 Próximas Evoluções (Opcionais)

### Fase 2:
- [ ] Integração com Google Sheets para sincronização de custos
- [ ] Webhook de atualização de produtos do Shopify (automático)
- [ ] Dashboard com analytics (conversão, ticket médio, etc)

### Fase 3:
- [ ] Migrar para banco de dados (Firebase, Supabase, PostgreSQL)
- [ ] Autenticação de vendedores
- [ ] Histórico centralizado (todas as cotações)
- [ ] Relatórios avançados

### Fase 4:
- [ ] Chatbot IA direto no site (claudeai + webhooks)
- [ ] Integração com ERP (Bling, Tiny, Omie)
- [ ] Precificação dinâmica por concorrência
- [ ] App mobile nativo

---

## 🤝 Suporte

Dúvidas sobre:
- **API**: Leia [README.md](./README.md)
- **Deploy**: Leia [DEPLOY.md](./DEPLOY.md)
- **n8n**: Leia [GUIA_N8N_PASSO_A_PASSO.md](./GUIA_N8N_PASSO_A_PASSO.md)
- **Exemplos**: Leia [EXEMPLOS_INTEGRACAO.md](./EXEMPLOS_INTEGRACAO.md)

---

## 📝 Checklist Final

Antes de colocar em produção:

- [ ] API deployada em Vercel/Netlify/Railway
- [ ] URL testada com `/api/health`
- [ ] Endpoint `/api/calcular-orcamento` retorna preço correto
- [ ] Endpoint `/api/sincronizar-shopify` carrega produtos
- [ ] n8n conectado e testado com webhook real
- [ ] Google Sheets configurado para histórico
- [ ] WhatsApp enviando mensagens formatadas
- [ ] Claude extraindo dados corretamente
- [ ] Tratamento de erros configurado
- [ ] Documentação compartilhada com vendedores

---

## 🎉 Conclusão

Sua API BHBAND está **pronta para produção**!

**Stack utilizado:**
- Backend: Node.js + Express
- Deploy: Vercel (serverless)
- Integrações: n8n, Shopify, WhatsApp, Google Sheets, Claude
- Documentação: Markdown 100%

**Custo:**
- Vercel (gratuito até 100 GB/mês)
- n8n (gratuito até 30 execuções/mês)
- Shopify API (gratuito)
- Total: **R$ 0,00** para começar

---

**Versão**: 1.0.0
**Data**: Junho 2024
**Status**: ✅ Pronto para Produção
