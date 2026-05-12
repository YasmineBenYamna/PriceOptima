// src/api/api.js
// Aligned with Data Pricer API v3.0.0

const BASE_URL      = '/api/v1';
const BASE_URL_AUTH = '/api/v1/auth';  // ← sera redirigé vers /auth/ par nginx
const USE_MOCK = false; // ← false quand le vrai backend est prêt

// ─── Helpers ────────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('access_token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_USERS = [
  { id: 'user_001', full_name: 'Yasmine Ben Yamna', company_name: 'RetailLab', workmail: 'yasmine@example.com', password: 'StrongPassword123!' },
];

const MOCK_RULES = [
  { id: 'rule_001', name: 'Floor Price Rule',     active: true,  params: { floor_pct: 0.85 }, description: 'Ensures price never goes below cost x floor %', is_system: true, aggregation_function: 'min' },
  { id: 'rule_002', name: 'Competitor Beat Rule', active: true,  params: { beat_pct: 0.02  }, description: 'Undercuts the lowest competitor by a given %',  is_system: true, aggregation_function: 'lowest' },
  { id: 'rule_003', name: 'Market Average Rule',  active: true,  params: {},                  description: 'Aligns price to the market average',            is_system: true, aggregation_function: 'avg' },
  { id: 'rule_004', name: 'Aggregation Rule',     active: true,  params: { agg: 'avg' },      description: 'Aggregates multiple price signals into one',    is_system: true, aggregation_function: 'avg' },
  { id: 'rule_005', name: 'Price Stability Rule', active: false, params: { max_delta: 0.05 }, description: 'Limits price change to 5% per day',            is_system: true, aggregation_function: 'none' },
];

const MOCK_STRATEGIES = [
  { id: 'strat_001', name: 'AGGRESSIVE',  description: 'Prioritize market share by undercutting top competitors rapidly.', rules_count: 3, rules: [
    { id: 'rule_001', rule_id: 'rule_001', name: 'Floor Price Rule',     coefficient: 0.3, aggregation_function: 'min',    description: 'Ensures price never goes below cost x floor %', active: true },
    { id: 'rule_002', rule_id: 'rule_002', name: 'Competitor Beat Rule', coefficient: 0.5, aggregation_function: 'lowest', description: 'Undercuts the lowest competitor by a given %',  active: true },
    { id: 'rule_003', rule_id: 'rule_003', name: 'Market Average Rule',  coefficient: 0.2, aggregation_function: 'avg',    description: 'Aligns price to the market average',            active: true },
  ]},
  { id: 'strat_002', name: 'COMPETITIVE', description: 'Stay within a tight range of market leaders to maintain parity.',  rules_count: 2, rules: [
    { id: 'rule_001', rule_id: 'rule_001', name: 'Floor Price Rule',    coefficient: 0.4, aggregation_function: 'min', description: 'Ensures price never goes below cost x floor %', active: true },
    { id: 'rule_003', rule_id: 'rule_003', name: 'Market Average Rule', coefficient: 0.6, aggregation_function: 'avg', description: 'Aligns price to the market average',            active: true },
  ]},
  { id: 'strat_003', name: 'ALIGNED',     description: 'Maintain price leadership with focus on margin preservation.',     rules_count: 2, rules: [
    { id: 'rule_001', rule_id: 'rule_001', name: 'Floor Price Rule',  coefficient: 0.5, aggregation_function: 'min', description: 'Ensures price never goes below cost x floor %', active: true },
    { id: 'rule_004', rule_id: 'rule_004', name: 'Aggregation Rule',  coefficient: 0.5, aggregation_function: 'avg', description: 'Aggregates multiple price signals into one',    active: true },
  ]},
  { id: 'strat_004', name: 'CUSTOM', description: 'Build your own pricing logic from individual modular rules.', rules_count: 0, rules: [] },
];

// ─── Mock Products ────────────────────────────────────────────────────────────

const MOCK_PRODUCTS_SEARCH = [
  { ean: '3017620422003', name: 'Nutella 400g',            brand: 'Ferrero',  category: 'Épicerie sucrée' },
  { ean: '7613034945532', name: 'Nescafé Classic 200g',    brand: 'Nestlé',   category: 'Boissons chaudes' },
  { ean: '8000500135314', name: 'Kinder Bueno barres x30', brand: 'Ferrero',  category: 'Épicerie sucrée' },
  { ean: '3068320055390', name: 'Evian 1.5L x6',           brand: 'Evian',    category: 'Boissons' },
  { ean: '5449000000996', name: 'Coca-Cola 33cl x24',      brand: 'Coca-Cola',category: 'Boissons' },
  { ean: '3228857000166', name: 'Danone Activia x8',       brand: 'Danone',   category: 'Produits laitiers' },
  { ean: '3017760000109', name: "L'Oréal Elvive Shampooing", brand: "L'Oréal", category: 'Hygiène Beauté' },
];

const MOCK_CATEGORIES = [
  { name: 'Épicerie sucrée',   product_count: 342 },
  { name: 'Boissons',          product_count: 218 },
  { name: 'Produits laitiers', product_count: 156 },
  { name: 'Hygiène Beauté',    product_count: 431 },
];

const MOCK_BRANDS = [
  { name: 'Nestlé',   product_count: 127 },
  { name: 'Danone',   product_count: 98  },
  { name: 'Ferrero',  product_count: 64  },
  { name: "L'Oréal",  product_count: 201 },
];

let _userStrategies = [];
let _userStrategyIdCounter = 1;
let _jobs = [
  { id: 'job_001', job_number: 'JOB-0001', status: 'completed', total_processed: 12, created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 'job_002', job_number: 'JOB-0002', status: 'failed',    total_processed: 3,  created_at: new Date(Date.now() - 43200000).toISOString() },
];
let _jobIdCounter = 3;

function delay(ms = 300) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Helper mock interne : enrichit une règle avec les métadonnées complètes ─
function _enrichRule(r) {
  const ruleId  = r.rule_id || r.id;
  const fullDef = MOCK_RULES.find((mr) => mr.id === ruleId) || {};
  return {
    ...r,
    rule_id:              ruleId,
    name:                 r.name        || fullDef.name        || ruleId,
    description:          r.description || fullDef.description || '',
    aggregation_function: r.aggregation_function || fullDef.aggregation_function || 'avg',
    active:               r.active !== undefined ? r.active : true,
  };
}

const mock = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  'POST /auth/register': async (body) => {
    await delay();
    if (MOCK_USERS.find((u) => u.work_mail === body.work_mail)) throw new Error('Email already used');
    const user = { id: `user_${Date.now()}`, ...body };
    MOCK_USERS.push(user);
    return { access_token: 'mock-token-' + Date.now(), token_type: 'bearer', user: { id: user.id, full_name: user.full_name, company_name: user.company_name, work_mail: user.work_mail } };
  },
  'POST /auth/login': async (body) => {
    await delay();
    const user = MOCK_USERS.find((u) => u.work_mail === body.work_mail && u.password === body.password);
    if (!user) throw new Error('Email ou mot de passe incorrect');
    return { access_token: 'mock-token-' + Date.now(), token_type: 'bearer', user: { id: user.id, full_name: user.full_name, company_name: user.company_name, work_mail: user.work_mail } };
  },

  // ── Rules ─────────────────────────────────────────────────────────────────
  'GET /rules':        async () =>         { await delay(); return { rules: MOCK_RULES, total: MOCK_RULES.length }; },
  'GET /rules/:id':    async (_, id) =>    { await delay(); const r = MOCK_RULES.find((x) => x.id === id); if (!r) throw new Error('Rule not found'); return r; },
  'PUT /rules/:id':    async (body, id) => { await delay(); const r = MOCK_RULES.find((x) => x.id === id); if (!r) throw new Error('Rule not found'); Object.assign(r, body); return { status: 'updated', ...r }; },

  // ── System Strategies ─────────────────────────────────────────────────────
  'GET /strategies':      async () =>      { await delay(); return { strategies: MOCK_STRATEGIES, total: MOCK_STRATEGIES.length }; },
  'GET /strategies/:id':  async (_, id) => { await delay(); const s = MOCK_STRATEGIES.find((x) => x.id === id); if (!s) throw new Error('Strategy not found'); return s; },

  // ── User Strategies ───────────────────────────────────────────────────────
  'GET /user-strategies':     async () =>      { await delay(); return { strategies: _userStrategies, total: _userStrategies.length }; },
  'GET /user-strategies/:id': async (_, id) => { await delay(); const s = _userStrategies.find((x) => x.id === id); if (!s) throw new Error('Not found'); return s; },

  // ✅ CORRIGÉ : enrichit les règles avec name + description depuis MOCK_RULES
  'POST /user-strategies': async (body) => {
    await delay();
    const sum = (body.rules || []).reduce((a, r) => a + Number(r.coefficient || 0), 0);
    if (Math.abs(sum - 1.0) > 0.01) throw new Error('Coefficients sum must equal 1');
    const s = {
      id:    `usr_strat_${_userStrategyIdCounter++}`,
      name:  body.name,
      rules: (body.rules || []).map(_enrichRule),
    };
    _userStrategies.push(s);
    return s;
  },

  // ✅ CORRIGÉ : préserve name + description lors d'un Apply Changes
  'PUT /user-strategies/:id': async (body, id) => {
    await delay();
    const idx = _userStrategies.findIndex((x) => x.id === id);
    if (idx === -1) throw new Error('Not found');
    const existingRules = _userStrategies[idx].rules || [];
    const mergedRules = (body.rules || []).map((r) => {
      const ruleId   = r.rule_id || r.id;
      const existing = existingRules.find((er) => (er.rule_id || er.id) === ruleId) || {};
      return _enrichRule({ ...existing, ...r });
    });
    _userStrategies[idx] = { ..._userStrategies[idx], ...body, rules: mergedRules };
    return { status: 'updated', ..._userStrategies[idx] };
  },

  'DELETE /user-strategies/:id': async (_, id) => { await delay(); _userStrategies = _userStrategies.filter((x) => x.id !== id); return null; },

  // ── Products — Search ─────────────────────────────────────────────────────
  'GET /products/search': async (body, _, params) => {
    await delay();
    const q = (params?.q || '').toLowerCase();
    const limit = parseInt(params?.limit || 20);
    const filtered = MOCK_PRODUCTS_SEARCH.filter(
      (p) => p.name.toLowerCase().includes(q) || p.ean.includes(q) || p.brand.toLowerCase().includes(q)
    ).slice(0, limit);
    return { products: filtered, total: filtered.length };
  },

  // ── Products — by EANs ────────────────────────────────────────────────────
  'POST /products/by-eans': async (body) => {
    await delay();
    const products = [];
    const notFound = [];
    for (const ean of (body.eans || [])) {
      const p = MOCK_PRODUCTS_SEARCH.find((x) => x.ean === ean);
      if (p) products.push({ ...p, base_price: body.base_prices?.[ean] || 0 });
      else notFound.push(ean);
    }
    return { products, total: products.length, not_found: notFound };
  },

  // ── Products — Categories ─────────────────────────────────────────────────
  'GET /products/categories': async () => {
    await delay();
    return { categories: MOCK_CATEGORIES, total: MOCK_CATEGORIES.length };
  },

  // ── Products — by Category ────────────────────────────────────────────────
  'GET /products/by-category/:id': async (_, category) => {
    await delay();
    const products = MOCK_PRODUCTS_SEARCH.filter(
      (p) => p.category.toLowerCase().includes(category.toLowerCase())
    );
    return { category, products, total: products.length };
  },

  // ── Products — Brands ─────────────────────────────────────────────────────
  'GET /products/brands': async () => {
    await delay();
    return { brands: MOCK_BRANDS, total: MOCK_BRANDS.length };
  },

  // ── Products — by Brand ───────────────────────────────────────────────────
  'GET /products/by-brand/:id': async (_, brand) => {
    await delay();
    const products = MOCK_PRODUCTS_SEARCH.filter(
      (p) => p.brand.toLowerCase().includes(brand.toLowerCase())
    );
    return { brand, products, total: products.length };
  },

  // ── Pricing ───────────────────────────────────────────────────────────────
  'POST /pricing/calculate':       async (body) => { await delay(500); return { product_id: body.product.id, final_price: +(body.product.price * 0.97).toFixed(2), contributions: [] }; },
  'POST /pricing/calculate-batch': async (body) => { await delay(600); return { strategy_name: body.strategy_name, total_processed: (body.products || []).length, failed: 0, results: (body.products || []).map((p) => ({ product_id: p.id, final_price: +(p.price * 0.97).toFixed(2), contributions: [] })), errors: [] }; },

  // ── Jobs ──────────────────────────────────────────────────────────────────
  'GET /jobs':      async () =>      { await delay(); return { stats: { total: _jobs.length, completed: _jobs.filter((j) => j.status === 'completed').length, failed: _jobs.filter((j) => j.status === 'failed').length }, jobs: _jobs, total: _jobs.length }; },
  'GET /jobs/:id':  async (_, id) => { await delay(); const j = _jobs.find((x) => x.id === id); if (!j) throw new Error('Job not found'); return { job_number: j.job_number, status: j.status, execution_timeline: [{ step: 'fetch', at: j.created_at }, { step: 'compute', at: j.created_at }], price_changes: [], distribution: { decreased: 8, unchanged: 3, increased: 1 } }; },
  'POST /jobs': async (body) => {
    await delay(800);
    const id = `job_00${_jobIdCounter}`;
    const job = { id, job_number: `JOB-000${_jobIdCounter}`, status: 'completed', total_processed: (body.products || []).length, created_at: new Date().toISOString() };
    _jobIdCounter++;
    _jobs.unshift(job);
    return { id: job.id, status: 'completed', total_processed: job.total_processed, price_changes: [], errors: [] };
  },
  'DELETE /jobs/:id': async (_, id) => { await delay(); _jobs = _jobs.filter((x) => x.id !== id); return null; },
};

// ─── Mock router ─────────────────────────────────────────────────────────────

function matchMock(method, path, queryParams) {
  const key = `${method} ${path}`;
  if (mock[key]) return { handler: mock[key], param: null, params: queryParams };
  for (const k of Object.keys(mock)) {
    const [m, pattern] = k.split(' ');
    if (m !== method) continue;
    const patParts  = pattern.split('/');
    const pathParts = path.split('/');
    if (patParts.length !== pathParts.length) continue;
    const params = {};
    const ok = patParts.every((seg, i) => {
      if (seg.startsWith(':')) { params[seg.slice(1)] = pathParts[i]; return true; }
      return seg === pathParts[i];
    });
    if (ok) return { handler: mock[k], param: Object.values(params)[0], params: queryParams };
  }
  return null;
}

async function request(method, path, body, queryParams) {
  if (USE_MOCK) {
    const m = matchMock(method, path, queryParams);
    if (!m) throw new Error(`[MOCK] Route non définie : ${method} ${path}`);
    return m.handler(body, m.param, m.params);
  }

  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders(),
  };

  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  if (queryParams) {
    Object.entries(queryParams).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    logout();
    window.location.href = '/login';
    return;
  }

  if (res.status === 204) return null;

  let data;
  try { data = await res.json(); } catch { throw new Error(`HTTP ${res.status}`); }

  if (!res.ok) {
    const msg = data?.message || (Array.isArray(data?.detail) ? data.detail.map((d) => d.msg).join(', ') : data?.detail) || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}



// ─── Auth ────────────────────────────────────────────────────────────────────

export async function login(body) {
  const data = await request('POST', '/auth/login', {
    work_mail: body.work_mail || body.work_mail,
    password:  body.password
  });
  if (data?.access_token) {
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('accesstoken', data.access_token);
  }
  return data;
}

export async function register(body) {
  const data = await request('POST', '/auth/register', {
    full_name:    body.full_name,
    work_mail:    body.work_mail || body.work_mail,
    company_name: body.company_name,
    password:     body.password
  });
  if (data?.access_token) {
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('accesstoken', data.access_token);
  }
  return data;
}

export function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('current_user');
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export function getRules()            { return request('GET', '/rules'); }
export function getRule(id)           { return request('GET', `/rules/${id}`); }
export function updateRule(id, body)  { return request('PUT', `/rules/${id}`, body); }

// ─── System Strategies ───────────────────────────────────────────────────────

export function getStrategies()       { return request('GET', '/strategies'); }
export function getStrategy(id)       { return request('GET', `/strategies/${id}`); }
export const getStrategyById = getStrategy;

// ─── User Strategies ─────────────────────────────────────────────────────────

export function getUserStrategies()          { return request('GET', '/user-strategies'); }
export function createUserStrategy(body)     { return request('POST', '/user-strategies', body); }
export function getUserStrategy(id)          { return request('GET', `/user-strategies/${id}`); }
export function updateUserStrategy(id, body) { return request('PUT', `/user-strategies/${id}`, body); }
export function deleteUserStrategy(id)       { return request('DELETE', `/user-strategies/${id}`); }

// ─── Products ────────────────────────────────────────────────────────────────

export function searchProducts(q, limit = 20)             { return request('GET', '/products/search', undefined, { q, limit }); }
export function getProductsByEans(eans, basePrices = {})  { return request('POST', '/products/by-eans', { eans, base_prices: basePrices }); }
export function getCategories()                           { return request('GET', '/products/categories'); }
export function getProductsByCategory(category, limit=50) { return request('GET', `/products/by-category/${encodeURIComponent(category)}`, undefined, { limit }); }
export function getBrands(limit = 50)                     { return request('GET', '/products/brands', undefined, { limit }); }
export function getProductsByBrand(brand, limit = 50)     { return request('GET', `/products/by-brand/${encodeURIComponent(brand)}`, undefined, { limit }); }

// ─── Pricing Engine ──────────────────────────────────────────────────────────

export function calculatePrice(body)      { return request('POST', '/pricing/calculate', body); }
export function calculateBatchPrice(body) { return request('POST', '/pricing/calculate-batch', body); }

// ─── Jobs ────────────────────────────────────────────────────────────────────

export function getJobs()       { return request('GET', '/jobs'); }
export function createJob(body) { return request('POST', '/jobs', body); }
export function getJob(id)      { return request('GET', `/jobs/${id}`); }
export const getJobById = getJob;
export function deleteJob(id)   { return request('DELETE', `/jobs/${id}`); }

// ─── Constantes utilitaires ──────────────────────────────────────────────────

export const AGG_FUNCTIONS = ['min', 'max', 'avg', 'median', 'lowest', 'none'];