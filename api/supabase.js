import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
// A API só faz leitura do catálogo (público), então usa a chave anon.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let client = null;

function getClient() {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase não configurado: defina SUPABASE_URL e SUPABASE_ANON_KEY nas variáveis de ambiente.'
    );
  }
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });
  return client;
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️  SUPABASE_URL/SUPABASE_ANON_KEY não definidos. As rotas de produtos vão falhar até configurar as variáveis de ambiente.');
}

// Proxy: cria o cliente sob demanda (no primeiro uso), evitando derrubar
// a API inteira quando as variáveis ainda não estão configuradas.
export const supabase = new Proxy({}, {
  get(_target, prop) {
    const c = getClient();
    const value = c[prop];
    return typeof value === 'function' ? value.bind(c) : value;
  }
});

// ===== Cliente ADMIN (service_role) — SOMENTE servidor =====
// Usado para ler tabelas privadas (ex.: info_orcamento, lead_info) ignorando RLS.
// NUNCA exponha esta chave no frontend.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let adminClient = null;
function getAdmin() {
  if (adminClient) return adminClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase admin não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  }
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
  return adminClient;
}

export const supabaseAdmin = new Proxy({}, {
  get(_target, prop) {
    const c = getAdmin();
    const value = c[prop];
    return typeof value === 'function' ? value.bind(c) : value;
  }
});
