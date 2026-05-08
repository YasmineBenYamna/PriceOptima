// src/pages/ProductScopePage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { C, R, S, Button, Card, Breadcrumb, Stepper } from '../components/ui/index.js';
import { WorkflowFooter } from '../components/ui/WorkflowFooter.jsx';
import { searchProducts, getCategories, getBrands } from '../api/api.js';

// ─── Checkbox card (Category / Brand) ────────────────────────────────────────
function SelectCard({ name, sub, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        12,
        padding:    16,
        borderRadius: R.lg,
        border:     selected ? `2px solid ${C.accent}` : `1.5px solid ${C.border}`,
        background: selected ? '#F0F7FF' : C.surface,
        cursor:     'pointer',
        boxShadow:  selected ? `0 0 0 3px rgba(164,60,18,0.08)` : S.card,
        transition: 'all 0.15s',
      }}
    >
      <div style={{
        width:          18,
        height:         18,
        borderRadius:   5,
        border:         `2px solid ${selected ? C.accent : C.border}`,
        background:     selected ? C.accent : C.surface,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        transition:     'all 0.15s',
      }}>
        {selected && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="#FFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{name}</div>
        <div style={{ fontSize: 11, color: C.textFaint }}>{sub}</div>
      </div>
    </div>
  );
}

// ─── Icônes ───────────────────────────────────────────────────────────────────
const IconUpload = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// ─── Hook utilitaire Set (candidat composant si réutilisé ailleurs) ───────────
function useSet(initial = []) {
  const [set, setSet] = useState(new Set(initial));
  const toggle = (id) =>
    setSet((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  return [set, toggle];
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function ProductScopePage() {
  const navigate = useNavigate();

  const [tab,      setTab]      = useState('Product');
  const [eanText,  setEanText]  = useState('');
  const [search,   setSearch]   = useState('');
  const [showMore, setShowMore] = useState(false);

  const [products,    setProducts]    = useState([]);
  const [categories,  setCategories]  = useState([]);
  const [brands,      setBrands]      = useState([]);
  const [loadingProd, setLoadingProd] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    getCategories().then((data) => setCategories(data?.categories ?? []));
    getBrands().then((data)     => setBrands(data?.brands ?? []));
  }, []);

  // Remplace le useEffect products par ceci :
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoadingProd(true);
      try { 
        const limit = showMore ? 50 : 20;
        const data = await searchProducts(search, limit);
        setProducts(data?.products ?? []);
      } finally {
        setLoadingProd(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search, showMore]); // ← ajouter showMore ici

  const [selected,  toggleProduct]  = useSet();
  const [selCats,   toggleCategory] = useSet();
  const [selBrands, toggleBrand]    = useSet();

  const eanList = eanText
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{8,14}$/.test(s));

  const totalSelected =
    tab === 'Product'  ? eanList.length + selected.size :
    tab === 'Category' ? selCats.size :
    selBrands.size;

  const scopeLabel = () => {
    if (tab === 'Product') {
      const n = totalSelected;
      return <><strong style={{ color: C.text }}>{n} product{n !== 1 ? 's' : ''} selected</strong>{' '}<span style={{ fontStyle: 'italic' }}>for this strategy scope.</span></>;
    }
    if (tab === 'Category') {
      const n = totalSelected;
      return <><strong style={{ color: C.text }}>{n} categor{n !== 1 ? 'ies' : 'y'} selected</strong>{' '}<span style={{ fontStyle: 'italic' }}>for this strategy scope.</span></>;
    }
    const n = totalSelected;
    return <><strong style={{ color: C.text }}>{n} brand{n !== 1 ? 's' : ''} selected</strong>{' '}<span style={{ fontStyle: 'italic' }}>for this strategy scope.</span></>;
  };

  const handleCSVImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const eans = ev.target.result
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter((s) => /^\d{8,14}$/.test(s));
      setEanText((prev) => {
        const existing = prev.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
        return [...new Set([...existing, ...eans])].join(',\n');
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleNext = () => {
    navigate('/pricing-rules/strategy-configuration', {
      state: {
        scopeType:  tab,
        eans:       tab === 'Product'  ? [...new Set([...eanList, ...selected])] : [],
        categories: tab === 'Category' ? [...selCats]   : [],
        brands:     tab === 'Brand'    ? [...selBrands]  : [],
      },
    });
  };

  const EMOJI_MAP = {
    'Épicerie sucrée':   '🥫',
    'Boissons chaudes':  '☕',
    'Boissons':          '💧',
    'Produits laitiers': '🥛',
    'Hygiène Beauté':    '🧴',
  };
  const getEmoji = (category) => EMOJI_MAP[category] ?? '📦';

  return (
    <div style={{ paddingBottom: 100 }}>
      <Breadcrumb items={[{ label: 'Pricing Workflow' }, { label: 'Product Scope', active: true }]} />

      <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>
        Select your products
      </h1>
      <p style={{ fontSize: 13, color: C.textMuted, margin: '0 0 24px', lineHeight: 1.6 }}>
        Choose the scope to which you want to apply your pricing rule.
        You can select individual products, entire categories, or specific brands.
      </p>

      <Stepper step={1} />

      <Card style={{ padding: '20px 24px', marginBottom: 16 }}>
        {/* Tab switcher */}
        <div style={{
          display: 'flex', gap: 4, background: '#F4F7FF',
          borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 20,
        }}>
          {['Product', 'Category', 'Brand'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding:    '8px 20px',
                borderRadius: 8,
                border:     'none',
                background: tab === t ? C.surface : 'transparent',
                color:      tab === t ? C.text : C.textMuted,
                fontSize:   13,
                fontWeight: tab === t ? 700 : 400,
                cursor:     'pointer',
                fontFamily: 'inherit',
                boxShadow:  tab === t ? S.card : 'none',
                transition: 'all 0.15s',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Product tab ── */}
        {tab === 'Product' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', marginBottom: 10,
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>
                    Enter the EANs
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted }}>
                    One per line or separated by commas
                  </div>
                </div>
                <div>
                  <Button
                    variant="secondary"
                    icon={<IconUpload />}
                    onClick={() => document.getElementById('csv-upload').click()}
                  >
                    Import CSV
                  </Button>
                  <input
                    id="csv-upload" type="file" accept=".csv"
                    style={{ display: 'none' }} onChange={handleCSVImport}
                  />
                </div>
              </div>

              <style>{`#ean-input::placeholder { color: #C0C8D8; font-style: italic; }`}</style>
              <textarea
                id="ean-input"
                value={eanText}
                onChange={(e) => setEanText(e.target.value)}
                rows={4}
                placeholder={"3017620422003,\n7613034945532,\n..."}
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: R.md,
                  border: `1.5px solid ${C.border}`, fontSize: 13, color: C.text,
                  outline: 'none', fontFamily: 'monospace', resize: 'vertical',
                  boxSizing: 'border-box', background: C.bg,
                }}
              />
              {eanList.length > 0 && (
                <div style={{ fontSize: 11, color: C.accent, marginTop: 6, fontWeight: 600 }}>
                  ✓ {eanList.length} valid EAN{eanList.length !== 1 ? 's' : ''} detected
                </div>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>
                Or search products
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: C.bg, border: `1.5px solid ${C.border}`,
                borderRadius: R.md, padding: '9px 14px',
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textFaint}
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or EAN..."
                  style={{
                    border: 'none', outline: 'none', fontSize: 13,
                    color: C.text, background: 'transparent', fontFamily: 'inherit', flex: 1,
                  }}
                />
              </div>
            </div>

            {loadingProd ? (
              <div style={{ textAlign: 'center', padding: 24, color: C.textMuted, fontSize: 13 }}>Loading…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {products.map((p) => {
                  const on = selected.has(p.ean);
                  return (
                    <div
                      key={p.ean} onClick={() => toggleProduct(p.ean)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px', borderRadius: R.md, cursor: 'pointer',
                        background: on ? '#F0F7FF' : 'transparent',
                        border: on ? `1.5px solid ${C.accent}` : '1.5px solid transparent',
                        transition: 'all 0.12s',
                      }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                        border: `2px solid ${on ? C.accent : C.border}`,
                        background: on ? C.accent : C.surface,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {on && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                            stroke="#FFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <span style={{ fontSize: 20 }}>{getEmoji(p.category)}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: C.textFaint }}>EAN {p.ean}</div>
                      </div>
                      <span style={{ fontSize: 11, color: C.textFaint }}>{p.brand}</span>
                    </div>
                  );
                })}
                {products.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 24, color: C.textMuted, fontSize: 13 }}>
                    No products found.
                  </div>
                )}
              </div>
            )}

            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button
                onClick={() => setShowMore((s) => !s)}
                style={{
                  fontSize: 13, fontWeight: 600, color: C.accent,
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', textDecoration: 'underline',
                }}
              >
                {showMore ? 'Show less' : 'Show more products'}
              </button>
            </div>
          </>
        )}

        {/* ── Category tab ── */}
        {tab === 'Category' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {categories.map((cat) => (
              <SelectCard
                key={cat.name} name={cat.name} sub={`${cat.product_count} products`}
                selected={selCats.has(cat.name)} onClick={() => toggleCategory(cat.name)}
              />
            ))}
          </div>
        )}

        {/* ── Brand tab ── */}
        {tab === 'Brand' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {brands.map((br) => (
              <SelectCard
                key={br.name} name={br.name} sub={`${br.product_count} products`}
                selected={selBrands.has(br.name)} onClick={() => toggleBrand(br.name)}
              />
            ))}
          </div>
        )}
      </Card>

      <WorkflowFooter
        label={scopeLabel()}
        onNext={handleNext}
        nextDisabled={totalSelected === 0}
      />
    </div>
  );
}