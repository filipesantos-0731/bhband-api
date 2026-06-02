# 📑 Índice de Arquivos - BHBAND API

## Estrutura do Projeto

```
calculadora - BH band/
├── 📂 api/
│   └── index.js                      (250 linhas) ⭐ CÓDIGO PRINCIPAL
├── package.json                      (14 linhas) - Dependências
├── vercel.json                       (17 linhas) - Config Vercel
├── .gitignore                        (11 linhas) - Git ignore
├── 📄 README.md                      ⭐ LEIA PRIMEIRO
├── 📄 SUMARIO.md                     ⭐ O QUE FOI ENTREGUE
├── 📄 DEPLOY.md                      ⭐ COMO FAZER DEPLOY
├── 📄 GUIA_N8N_PASSO_A_PASSO.md     ⭐ INTEGRAÇÃO n8n
├── 📄 EXEMPLOS_INTEGRACAO.md         - Exemplos de código
├── 📄 QUICK_REFERENCE.md             - Cheat sheet rápido
├── n8n-workflow-example.json         - Workflow pronto para importar
└── 📄 INDEX.md                       ← Este arquivo
```

---

## 📖 Guia de Leitura

### 🔴 COMECE AQUI (Ordem recomendada)

1. **[SUMARIO.md](./SUMARIO.md)** ← Leia em 5 minutos
   - O que foi entregue
   - Como começar em 3 passos
   - Exemplos de uso

2. **[DEPLOY.md](./DEPLOY.md)** ← Escolha uma opção
   - GitHub + Vercel (recomendado)
   - Vercel CLI
   - Netlify
   - Testando após deployment

3. **[GUIA_N8N_PASSO_A_PASSO.md](./GUIA_N8N_PASSO_A_PASSO.md)** ← 30 minutos
   - 9 passos para integrar com n8n
   - Configurar Claude, HTTP Request, WhatsApp
   - Salvar histórico em Google Sheets

### 🟡 REFERÊNCIA TÉCNICA

4. **[README.md](./README.md)** ← Documentação completa
   - Todos os endpoints
   - Descrição de campos
   - Markups, técnicas, estratégias
   - Troubleshooting

5. **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** ← Cheat sheet
   - Resumo de URLs
   - Tabelas rápidas
   - Exemplo de resposta
   - cURL commands

6. **[EXEMPLOS_INTEGRACAO.md](./EXEMPLOS_INTEGRACAO.md)** ← Código pronto
   - n8n
   - Make
   - Zapier
   - Python, JavaScript, Google Apps Script

### 🟢 OPERACIONAL

7. **[n8n-workflow-example.json](./n8n-workflow-example.json)**
   - Importar diretamente no n8n
   - Nodes pré-configurados (parcialmente)

---

## 📂 Arquivos de Código

### `api/index.js` (250 linhas)
**O coração da API**

```javascript
// Estrutura:
1. Imports (express, axios)
2. Middleware (CORS, JSON)
3. CONFIG: MARKUP_TABLES (3 estratégias)
4. CONFIG: TECHNIQUES (17 técnicas)
5. FUNÇÕES: getMarkupByTotal(), calculatePrice()
6. ENDPOINTS:
   - GET /api/health
   - GET /api/sincronizar-shopify
   - POST /api/calcular-orcamento
   - POST /api/comparar-estrategias
   - GET /api/tecnicas
   - GET /api/estrategias
7. HELPER: gerarMensagemWhatsApp()
8. FUNCTION: inferirTecnicaSugerida()
9. FALLBACK: 404
10. SERVIDOR: listen()
```

**Personalizações fáceis:**
- Linha 20-48: Alterar markups (TETO/PADRÃO/PISO)
- Linha 50-62: Adicionar/remover técnicas
- Linha 137-139: Alterar pedido mínimo (R$ 400)
- Linha ~400: Alterar porta (PORT)

---

### `package.json`
**Dependências do projeto**

```json
{
  "dependencies": {
    "express": "^4.18.2",     ← Framework web
    "axios": "^1.6.0",        ← HTTP client (para Shopify)
    "dotenv": "^16.3.1"       ← Variáveis de ambiente
  }
}
```

**Scripts:**
- `npm run dev` → Rodar localmente
- `npm start` → Rodar em produção
- `npm run build` → Build (não necessário para serverless)

---

### `vercel.json`
**Configuração para Vercel**

```json
{
  "version": 2,
  "builds": [{ "src": "api/index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/api/(.*)", "dest": "/api/index.js" }]
}
```

**O que faz:**
- Instrui Vercel a usar Node.js 18.x
- Aponta o entry point como `api/index.js`
- Roteia todas as requisições `/api/*` para a API

---

### `n8n-workflow-example.json`
**Workflow pronto para n8n**

**Como usar:**
1. Abra n8n.io
2. Clique "Import" no dashboard
3. Copie/cole o conteúdo de `n8n-workflow-example.json`
4. Clique "Import"
5. Configure cada node (substituir URLs, chaves de API)

**Nodes inclusos:**
- HTTP Request (chamar API BHBAND)
- Webhook (receber dados)
- Formatador
- Nota: Você precisa adicionar Claude, Sheets, WhatsApp

---

## 📄 Arquivos de Documentação

### `README.md` (500+ linhas)
**Documentação oficial completa**

Seções:
1. Quick Start (1 min)
2. Como testar (cURL)
3. Endpoints (6 endpoints descritos)
4. Campos de request/response
5. Integração n8n (resumida)
6. Técnicas disponíveis
7. Estratégias de markup
8. Validações
9. Rate limiting
10. Troubleshooting
11. Deploy & manutenção

**Quando usar:**
- Referência técnica oficial
- Entender lógica de negócio
- Troubleshooting de erros

---

### `SUMARIO.md` (300+ linhas)
**O que foi entregue, high-level**

Seções:
1. ✅ O que foi entregue (4 itens principais)
2. 🚀 Como começar (3 passos)
3. 📊 Estrutura de arquivos
4. 💡 Exemplo de fluxo de uso
5. ⚙️ Personalizações fáceis
6. 🔐 Segurança
7. 📈 Próximas evoluções
8. 📝 Checklist pré-produção

**Quando ler:**
- Visão geral do projeto
- Decidir por onde começar
- Entender o escopo

---

### `DEPLOY.md` (150+ linhas)
**3 opções de deployment**

Opção A: GitHub + Vercel (Recomendado)
- Criar repositório
- Conectar Vercel
- Deploy automático

Opção B: Vercel CLI
- `vercel login`
- `vercel`
- Pronto

Opção C: Netlify
- Drag & drop
- Mais simples

**Quando usar:**
- Primeira vez fazendo deploy
- Precisar de atualizações automáticas

---

### `GUIA_N8N_PASSO_A_PASSO.md` (350+ linhas)
**Integração completa com n8n**

9 passos:
1. Criar workflow
2. Configurar Webhook
3. Configurar Claude
4. Buscar custo em Google Sheets
5. Chamar API BHBAND
6. Enviar WhatsApp
7. Salvar histórico
8. Tratar erros
9. Testar

**Quando usar:**
- Integrando com n8n pela primeira vez
- Entender cada node

---

### `EXEMPLOS_INTEGRACAO.md` (500+ linhas)
**Código pronto para 7 plataformas**

Plataformas:
1. n8n (workflow visual)
2. Make (ex-Integromat)
3. Zapier
4. Google Apps Script
5. Python
6. JavaScript
7. cURL (teste)

**Quando usar:**
- Copiar/colar código
- Integrar com outra plataforma

---

### `QUICK_REFERENCE.md` (200+ linhas)
**Cheat sheet rápido**

Inclui:
- URLs da API
- Request/response de exemplo
- Tabelas de markups
- Lista de técnicas
- n8n mappings
- cURL commands rápidos
- Erros comuns

**Quando usar:**
- Durante desenvolvimento
- Debugar integração
- Referência rápida

---

## 🔄 Fluxo Recomendado de Uso

### Dia 1: Setup
```
1. Ler SUMARIO.md (5 min)
2. Fazer deploy via DEPLOY.md (15 min)
3. Testar /api/health via cURL (2 min)
```

### Dia 2-3: Integração n8n
```
1. Ler GUIA_N8N_PASSO_A_PASSO.md (30 min)
2. Configurar cada node do n8n (1-2 horas)
3. Testar com mensagem real no WhatsApp (30 min)
```

### Dia 4+: Referência
```
- README.md para dúvidas técnicas
- QUICK_REFERENCE.md para lembrar URLs/campos
- EXEMPLOS_INTEGRACAO.md para adicionar integrações
```

---

## 💻 Comandos Essenciais

### Desenvolvimento Local
```bash
npm install           # Instalar dependências
npm run dev          # Rodar na porta 3000
npm start            # Rodar em produção
```

### Git
```bash
git init
git add .
git commit -m "Initial"
git branch -M main
git remote add origin https://github.com/USUARIO/repo
git push -u origin main
```

### cURL (Teste)
```bash
# Health
curl https://seu-url.vercel.app/api/health

# Calcular
curl -X POST https://seu-url.vercel.app/api/calcular-orcamento \
  -H "Content-Type: application/json" \
  -d '{"quantidade":500,"custoUnitario":2.5}'

# Veja mais em QUICK_REFERENCE.md
```

### Atualizar após Deploy
```bash
# Editar arquivo
nano api/index.js

# Commit + push (Vercel faz deploy automaticamente)
git add .
git commit -m "Atualizar X"
git push
```

---

## ✅ Checklist de Arquivos

```
✅ api/index.js                  — Código principal
✅ package.json                  — Dependências
✅ vercel.json                   — Config Vercel
✅ .gitignore                    — Git ignore
✅ README.md                     — Documentação oficial
✅ SUMARIO.md                    — O que foi entregue
✅ DEPLOY.md                     — 3 opções de deployment
✅ GUIA_N8N_PASSO_A_PASSO.md    — Integração n8n
✅ EXEMPLOS_INTEGRACAO.md        — Código pronto
✅ QUICK_REFERENCE.md            — Cheat sheet
✅ n8n-workflow-example.json     — Workflow pronto
✅ INDEX.md                      — Este arquivo
```

---

## 🎯 Próximos Passos

1. **Leia [SUMARIO.md](./SUMARIO.md)** em 5 minutos
2. **Escolha uma opção em [DEPLOY.md](./DEPLOY.md)** e faça o deployment
3. **Siga [GUIA_N8N_PASSO_A_PASSO.md](./GUIA_N8N_PASSO_A_PASSO.md)** para n8n
4. **Teste com [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)**
5. **Consulte [README.md](./README.md)** para dúvidas técnicas

---

**Versão**: 1.0.0 | **Data**: Junho 2024 | **Status**: ✅ Pronto para Produção
