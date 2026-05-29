// src/api/api.js
// Aligned with Data Pricer API v3.0.0

const BASE_URL      = '/api/v1';
const BASE_URL_AUTH = '/api/v1/auth';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('access_token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Core request ────────────────────────────────────────────────────────────

async function request(method, path, body, queryParams) {
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
    work_mail: body.work_mail,
    password:  body.password,
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
    work_mail:    body.work_mail,
    company_name: body.company_name,
    password:     body.password,
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

export function getRules(filters = {})       { return request('GET', '/rules', undefined, filters); }
export function getRule(id)                  { return request('GET', `/rules/${id}`); }
export function updateRule(id, body)         { return request('PUT', `/rules/${id}`, body); }

export function createCustomRule(body) { return request('POST', '/rules/custom', body); }
export function getCustomRules()        { return request('GET',  '/rules/custom'); }

// ─── System Strategies ───────────────────────────────────────────────────────

export function getStrategies(filters = {})  { return request('GET', '/strategies', undefined, filters); }
export function getStrategy(id)              { return request('GET', `/strategies/${id}`); }
export const getStrategyById = getStrategy;

// ─── User Strategies ─────────────────────────────────────────────────────────

export function getUserStrategies(filters = {})      { return request('GET', '/user-strategies', undefined, filters); }
export function createUserStrategy(body)             { return request('POST', '/user-strategies', body); }
export function getUserStrategy(id)                  { return request('GET', `/user-strategies/${id}`); }
export function updateUserStrategy(id, body)         { return request('PUT', `/user-strategies/${id}`, body); }
export function deleteUserStrategy(id)               { return request('DELETE', `/user-strategies/${id}`); }

// ─── LLM Suggestion ──────────────────────────────────────────────────────────

export function getLLMSuggestion(body) {
  return request('POST', '/pricing/suggest-strategy', {
    category: body?.category || undefined,
    brand:    body?.brand    || undefined,
  });
}

// ─── Products ────────────────────────────────────────────────────────────────

export function searchProducts(q, limit = 20)              { return request('GET', '/products/search', undefined, { q, limit }); }
export function getProductsByEans(eans, basePrices = {})   { return request('POST', '/products/by-eans', { eans, base_prices: basePrices }); }
export function getCategories(category, limit=1000) { 
  return request('GET', '/products/categories', undefined, { gold_only: true }); 
}
export function getProductsByCategory(category, limit=1000)  { return request('GET', `/products/by-category/${encodeURIComponent(category)}`, undefined, { limit }); }
export function getBrands(limit = 1000) { 
  return request('GET', '/products/brands', undefined, { limit, gold_only: true }); 
}
export function getProductsByBrand(brand, limit = 500)      { return request('GET', `/products/by-brand/${encodeURIComponent(brand)}`, undefined, { limit }); }
export async function importCsv(formData) {
  const res = await fetch(`${BASE_URL}/products/import-csv`, {
    method:  'POST',
    headers: authHeaders(),   // pas de Content-Type → le browser gère le boundary multipart
    body:    formData,
  });
  if (res.status === 401) { logout(); window.location.href = '/login'; return; }
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
  return data;
}

// ─── Pricing Engine ──────────────────────────────────────────────────────────

export function calculatePrice(body)       { return request('POST', '/pricing/calculate', body); }
export function calculateBatchPrice(body)  { return request('POST', '/pricing/calculate-batch', body); }

// ─── Jobs ────────────────────────────────────────────────────────────────────

export function getJobs()        { return request('GET', '/jobs'); }
export function createJob(body)  { return request('POST', '/jobs', body); }
export function getJob(id)       { return request('GET', `/jobs/${id}`); }
export const getJobById = getJob;
export function deleteJob(id)    { return request('DELETE', `/jobs/${id}`); }

// ─── Constantes utilitaires ──────────────────────────────────────────────────

export const AGG_FUNCTIONS = ['min', 'max', 'avg', 'median', 'lowest', 'none'];
// ─── Superset ────────────────────────────────────────────────────────────────
// dashboard: '1' = Market Overview, '2' = Store Performance
export function getGuestToken(dashboardUuid) {
  return request('GET', `/superset/guest-token/${dashboardUuid}`);
}