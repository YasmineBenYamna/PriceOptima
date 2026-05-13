// src/pages/ProductScopePage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { C, R, S, Button, Card, Breadcrumb, Stepper } from '../components/ui/index.js';
import { WorkflowFooter } from '../components/ui/WorkflowFooter.jsx';
import { getCategories, getBrands, getProductsByCategory, getProductsByBrand } from '../api/api.js';


function SelectCard({ name, sub, selected, onClick, onCheck }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 16,
        borderRadius: R.lg,
        border: selected ? `2px solid ${C.accent}` : `1.5px solid ${C.border}`,
        background: selected ? '#F0F7FF' : C.surface,
        cursor: 'pointer',
        boxShadow: selected ? `0 0 0 3px rgba(164,60,18,0.08)` : S.card,
        transition: 'all 0.15s',
      }}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          onCheck?.();
        }}
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          border: `2px solid ${selected ? C.accent : C.border}`,
          background: selected ? C.accent : C.surface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.15s',
          cursor: 'pointer',
        }}
      >
        {selected && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFF"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
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


const IconUpload = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);


const IconBack = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);


export default function ProductScopePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('Product');


  // ── Product tab ──
  const [eanText, setEanText] = useState('');


  // ── Category tab ──
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [openedCategory, setOpenedCategory] = useState(null);
  const [categoryProducts, setCategoryProducts] = useState([]);
  const [loadingCatProds, setLoadingCatProds] = useState(false);
  const [selectedCatEans, setSelectedCatEans] = useState(new Set());


  // ── Brand tab ──
  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [openedBrand, setOpenedBrand] = useState(null);
  const [brandProducts, setBrandProducts] = useState([]);
  const [loadingBrandProds, setLoadingBrandProds] = useState(false);
  const [selectedBrandEans, setSelectedBrandEans] = useState(new Set());


  useEffect(() => {
    getCategories().then(d => setCategories(d?.categories ?? []));
    getBrands().then(d => setBrands(d?.brands ?? []));
  }, []);


  // Ouvrir produits d'une catégorie
  const handleOpenCategory = async (catName) => {
    if (openedCategory === catName) {
      setOpenedCategory(null);
      setCategoryProducts([]);
      return;
    }

    setOpenedCategory(catName);
    setLoadingCatProds(true);
    try {
      const data = await getProductsByCategory(catName, 100);
      setCategoryProducts(data?.products ?? []);
    } finally {
      setLoadingCatProds(false);
    }
  };


  // Cocher catégorie
  const handleCheckCategory = (catName) => {
    if (selectedCategory === catName) {
      setSelectedCategory(null);
      setSelectedCatEans(new Set());
      return;
    }

    setSelectedCategory(catName);
    setSelectedCatEans(new Set());
  };


  // Ouvrir produits d'une marque
  const handleOpenBrand = async (brandName) => {
    if (openedBrand === brandName) {
      setOpenedBrand(null);
      setBrandProducts([]);
      return;
    }

    setOpenedBrand(brandName);
    setLoadingBrandProds(true);
    try {
      const data = await getProductsByBrand(brandName, 100);
      setBrandProducts(data?.products ?? []);
    } finally {
      setLoadingBrandProds(false);
    }
  };


  // Cocher marque
  const handleCheckBrand = (brandName) => {
    if (selectedBrand === brandName) {
      setSelectedBrand(null);
      setSelectedBrandEans(new Set());
      return;
    }

    setSelectedBrand(brandName);
    setSelectedBrandEans(new Set());
  };


  const toggleCatEan = (ean) => setSelectedCatEans(prev => {
    const n = new Set(prev);
    n.has(ean) ? n.delete(ean) : n.add(ean);
    return n;
  });


  const toggleBrandEan = (ean) => setSelectedBrandEans(prev => {
    const n = new Set(prev);
    n.has(ean) ? n.delete(ean) : n.add(ean);
    return n;
  });


  const selectAllCat = () => setSelectedCatEans(new Set(categoryProducts.map(p => p.ean)));
  const deselectAllCat = () => setSelectedCatEans(new Set());


  const selectAllBrand = () => setSelectedBrandEans(new Set(brandProducts.map(p => p.ean)));
  const deselectAllBrand = () => setSelectedBrandEans(new Set());


  // EANs valides depuis textarea
  const eanList = eanText
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(s => /^\d{8,14}$/.test(s));


  const handleCSVImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const eans = ev.target.result
        .split(/[\n,;]+/)
        .map(s => s.trim())
        .filter(s => /^\d{8,14}$/.test(s));
      setEanText(prev => {
        const existing = prev.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        return [...new Set([...existing, ...eans])].join(',\n');
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };


  // Total sélectionné
  const totalSelected =
    tab === 'Product' ? eanList.length :
    tab === 'Category' ? selectedCatEans.size :
    selectedBrandEans.size;


  const canNext =
    tab === 'Product' ? eanList.length > 0 :
    tab === 'Category' ? selectedCatEans.size > 0 || !!selectedCategory :
    selectedBrandEans.size > 0 || !!selectedBrand;


  const handleNext = () => {
    navigate('/pricing-rules/strategy-configuration', {
      state: {
        scope: {
          scopeType: tab,
          eans:
            tab === 'Product' ? eanList :
            tab === 'Category'
              ? (selectedCatEans.size > 0 ? [...selectedCatEans] : [])
              : (selectedBrandEans.size > 0 ? [...selectedBrandEans] : []),
          categories: tab === 'Category' && selectedCategory ? [selectedCategory] : [],
          brands: tab === 'Brand' && selectedBrand ? [selectedBrand] : [],
        }
      }
    });
  };


  const scopeLabel = () => {
    const n = totalSelected;
    if (tab === 'Product') {
      return (
        <>
          <strong style={{ color: C.text }}>{n} EAN{n !== 1 ? 's' : ''}</strong>{' '}
          <span style={{ fontStyle: 'italic' }}>sélectionné{n !== 1 ? 's' : ''}.</span>
        </>
      );
    }

    if (tab === 'Category') {
      if (selectedCatEans.size > 0) {
        return (
          <>
            <strong style={{ color: C.text }}>{n} produit{n !== 1 ? 's' : ''}</strong>{' '}
            <span style={{ fontStyle: 'italic' }}>sélectionné{n !== 1 ? 's' : ''} dans {selectedCategory || '...'}</span>
          </>
        );
      }

      return (
        <>
          <strong style={{ color: C.text }}>{selectedCategory ? '1 catégorie' : '0 catégorie'}</strong>{' '}
          <span style={{ fontStyle: 'italic' }}>
            {selectedCategory ? `${selectedCategory} sélectionnée.` : 'aucune catégorie sélectionnée.'}
          </span>
        </>
      );
    }

    if (selectedBrandEans.size > 0) {
      return (
        <>
          <strong style={{ color: C.text }}>{n} produit{n !== 1 ? 's' : ''}</strong>{' '}
          <span style={{ fontStyle: 'italic' }}>sélectionné{n !== 1 ? 's' : ''} dans {selectedBrand || '...'}</span>
        </>
      );
    }

    return (
      <>
        <strong style={{ color: C.text }}>{selectedBrand ? '1 marque' : '0 marque'}</strong>{' '}
        <span style={{ fontStyle: 'italic' }}>
          {selectedBrand ? `${selectedBrand} sélectionnée.` : 'aucune marque sélectionnée.'}
        </span>
      </>
    );
  };


  // Composant liste produits avec select all
  const ProductList = ({ products, selectedEans, onToggle, onSelectAll, onDeselectAll, loading }) => {
    if (loading) return <div style={{ textAlign: 'center', padding: 24, color: C.textMuted, fontSize: 13 }}>Chargement...</div>;
    if (!products.length) return <div style={{ textAlign: 'center', padding: 24, color: C.textMuted, fontSize: 13 }}>Aucun produit trouvé.</div>;
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '8px 12px', background: '#F4F7FF', borderRadius: R.md }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>{selectedEans.size} / {products.length} sélectionnés</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onSelectAll} style={{ fontSize: 12, fontWeight: 600, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              Tout sélectionner
            </button>
            <span style={{ color: C.border }}>|</span>
            <button onClick={onDeselectAll} style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              Tout désélectionner
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflowY: 'auto' }}>
          {products.map(p => {
            const on = selectedEans.has(p.ean);
            return (
              <div key={p.ean} onClick={() => onToggle(p.ean)} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: R.md, cursor: 'pointer',
                background: on ? '#F0F7FF' : 'transparent',
                border: on ? `1.5px solid ${C.accent}` : '1.5px solid transparent',
                transition: 'all 0.12s',
              }}>
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
                {p.image_url && (
                  <img src={p.image_url} alt={p.name}
                    onError={e => e.target.style.display = 'none'}
                    style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6, background: '#F8F9FC', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: C.textFaint }}>EAN {p.ean}</div>
                </div>
                <span style={{ fontSize: 11, color: C.textFaint }}>{p.brand}</span>
              </div>
            );
          })}
        </div>
      </>
    );
  };


  return (
    <div style={{ paddingBottom: 100 }}>
      <Breadcrumb items={[{ label: 'Pricing Workflow' }, { label: 'Product Scope', active: true }]} />
      <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>
        Select your products
      </h1>
      <p style={{ fontSize: 13, color: C.textMuted, margin: '0 0 24px', lineHeight: 1.6 }}>
        Choisissez le périmètre de produits pour votre stratégie de pricing.
      </p>
      <Stepper step={1} />

      <Card style={{ padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4, background: '#F4F7FF', borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 20 }}>
          {['Product', 'Category', 'Brand'].map(t => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setSelectedCategory(null);
                setOpenedCategory(null);
                setCategoryProducts([]);
                setSelectedCatEans(new Set());
                setSelectedBrand(null);
                setOpenedBrand(null);
                setBrandProducts([]);
                setSelectedBrandEans(new Set());
              }}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: 'none',
                background: tab === t ? C.surface : 'transparent',
                color: tab === t ? C.text : C.textMuted,
                fontSize: 13,
                fontWeight: tab === t ? 700 : 400,
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: tab === t ? S.card : 'none',
                transition: 'all 0.15s',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'Product' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>Entrez les EANs</div>
                <div style={{ fontSize: 12, color: C.textMuted }}>Un par ligne ou séparés par des virgules</div>
              </div>
              <div>
                <Button variant="secondary" icon={<IconUpload />} onClick={() => document.getElementById('csv-upload').click()}>
                  Import CSV
                </Button>
                <input id="csv-upload" type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVImport} />
              </div>
            </div>
            <textarea
              value={eanText}
              onChange={e => setEanText(e.target.value)}
              rows={6}
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
                ✓ {eanList.length} EAN{eanList.length !== 1 ? 's' : ''} valide{eanList.length !== 1 ? 's' : ''} détecté{eanList.length !== 1 ? 's' : ''}
              </div>
            )}
          </>
        )}

        {tab === 'Category' && (
          <>
            {!openedCategory ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {categories.map(cat => (
                  <SelectCard
                    key={cat.name}
                    name={cat.name}
                    sub={`${cat.product_count} produits`}
                    selected={selectedCategory === cat.name}
                    onCheck={() => handleCheckCategory(cat.name)}
                    onClick={() => handleOpenCategory(cat.name)}
                  />
                ))}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <button
                    onClick={() => {
                      setOpenedCategory(null);
                      setCategoryProducts([]);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 13, color: C.textMuted, background: 'none',
                      border: `1px solid ${C.border}`, borderRadius: R.md,
                      padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <IconBack /> Retour
                  </button>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                    Catégorie : <span style={{ color: C.accent }}>{openedCategory}</span>
                  </div>
                </div>
                <ProductList
                  products={categoryProducts}
                  selectedEans={selectedCatEans}
                  onToggle={toggleCatEan}
                  onSelectAll={selectAllCat}
                  onDeselectAll={deselectAllCat}
                  loading={loadingCatProds}
                />
              </>
            )}
          </>
        )}

        {tab === 'Brand' && (
          <>
            {!openedBrand ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {brands.map(br => (
                  <SelectCard
                    key={br.name}
                    name={br.name}
                    sub={`${br.product_count} produits`}
                    selected={selectedBrand === br.name}
                    onCheck={() => handleCheckBrand(br.name)}
                    onClick={() => handleOpenBrand(br.name)}
                  />
                ))}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <button
                    onClick={() => {
                      setOpenedBrand(null);
                      setBrandProducts([]);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 13, color: C.textMuted, background: 'none',
                      border: `1px solid ${C.border}`, borderRadius: R.md,
                      padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <IconBack /> Retour
                  </button>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                    Marque : <span style={{ color: C.accent }}>{openedBrand}</span>
                  </div>
                </div>
                <ProductList
                  products={brandProducts}
                  selectedEans={selectedBrandEans}
                  onToggle={toggleBrandEan}
                  onSelectAll={selectAllBrand}
                  onDeselectAll={deselectAllBrand}
                  loading={loadingBrandProds}
                />
              </>
            )}
          </>
        )}
      </Card>

      <WorkflowFooter
        label={scopeLabel()}
        onNext={handleNext}
        nextDisabled={!canNext}
      />
    </div>
  );
}