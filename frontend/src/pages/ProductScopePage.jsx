import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card } from '../components/ui';
import { WorkflowFooter } from '../components/ui';
import WorkflowPage from '../components/workflow/WorkflowPage.jsx';
import ScopeTabs from '../components/product-scope/ScopeTabs.jsx';
import SelectCard from '../components/product-scope/SelectCard.jsx';
import ProductList from '../components/product-scope/ProductList.jsx';

import {
  getCategories,
  getBrands,
  getProductsByCategory,
  getProductsByBrand,
  importCsv,
} from '../api/api.js';

const IconUpload = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 5 17 10" />
    <line x1="12" y1="5" x2="12" y2="23" />
  </svg>
);

export default function ProductScopePage() {
  const navigate = useNavigate();

  const [tab, setTab] = useState('Product');
  const [eanText, setEanText] = useState('');

  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [openedCategory, setOpenedCategory] = useState(null);
  const [categoryProducts, setCategoryProducts] = useState([]);
  const [loadingCatProds, setLoadingCatProds] = useState(false);
  const [selectedCatEans, setSelectedCatEans] = useState(new Set());

  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [openedBrand, setOpenedBrand] = useState(null);
  const [brandProducts, setBrandProducts] = useState([]);
  const [loadingBrandProds, setLoadingBrandProds] = useState(false);
  const [selectedBrandEans, setSelectedBrandEans] = useState(new Set());

  useEffect(() => {
    getCategories().then((d) => setCategories(d?.categories ?? []));
    getBrands().then((d) => setBrands(d?.brands ?? []));
  }, []);

  const eanList = eanText
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && s.length <= 14);

  const resetTabState = (nextTab) => {
    setTab(nextTab);
    setSelectedCategory(null);
    setOpenedCategory(null);
    setCategoryProducts([]);
    setSelectedCatEans(new Set());
    setSelectedBrand(null);
    setOpenedBrand(null);
    setBrandProducts([]);
    setSelectedBrandEans(new Set());
  };

  const handleOpenCategory = async (catName) => {
    if (openedCategory === catName) {
      setOpenedCategory(null);
      setCategoryProducts([]);
      return;
    }

    setOpenedCategory(catName);
    setLoadingCatProds(true);
    try {
      const data = await getProductsByCategory(catName, 500);
      setCategoryProducts(data?.products ?? []);
    } finally {
      setLoadingCatProds(false);
    }
  };

  const handleOpenBrand = async (brandName) => {
    if (openedBrand === brandName) {
      setOpenedBrand(null);
      setBrandProducts([]);
      return;
    }
    setOpenedBrand(brandName);
    setLoadingBrandProds(true);
    try {
      const data = await getProductsByBrand(brandName, 500);
      setBrandProducts(data?.products ?? []);
    } finally {
      setLoadingBrandProds(false);
    }
  };

  const toggleSetValue = (setter, value) => {
    setter((prev) => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  };

  
  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, '').split('\n'); // strip BOM
    const header = lines[0].toLowerCase().trim();
    
    // Détecter la colonne EAN
    const sep = header.includes(';') ? ';' : ',';
    const cols = header.split(sep);
    const eanIdx = cols.findIndex(c => ['ean','code','barcode'].includes(c.trim()));
    
    const eans = lines.slice(1)
      .map(line => {
        const val = eanIdx >= 0 ? line.split(sep)[eanIdx] : line;
        return val?.trim().replace(/"/g, '') || '';
      })
      .filter(v => v.length >= 8);

    setTab('Product');
    setEanText(eans.join('\n'));
    e.target.value = '';
  };

  const canNext =
    tab === 'Product'
      ? eanList.length > 0
      : tab === 'Category'
      ? selectedCatEans.size > 0 || !!selectedCategory
      : selectedBrandEans.size > 0 || !!selectedBrand;

  const scopeLabel =
    tab === 'Product'
      ? eanList.length > 0
        ? `${eanList.length} EAN${eanList.length !== 1 ? 's' : ''} selected`
        : 'No EANs entered'
      : tab === 'Category'
      ? selectedCatEans.size > 0
        ? `${selectedCatEans.size} product(s) selected in ${selectedCategory}`
        : selectedCategory
        ? `Category ${selectedCategory} selected`
        : 'No category selected'
      : selectedBrandEans.size > 0
      ? `${selectedBrandEans.size} product(s) selected in ${selectedBrand}`
      : selectedBrand
      ? `Brand ${selectedBrand} selected`
      : 'No brand selected';

  const handleNext = () => {
    navigate('/pricing-rules/strategy-configuration', {
      state: {
        scope: {
          scopeType: tab,
          eans:
            tab === 'Product'
              ? eanList
              : tab === 'Category'
              ? [...selectedCatEans]
              : [...selectedBrandEans],
          categories: tab === 'Category' && selectedCategory ? [selectedCategory] : [],
          brands: tab === 'Brand' && selectedBrand ? [selectedBrand] : [],
        },
      },
    });
  };

  return (
    <WorkflowPage
      breadcrumbItems={[
        { label: 'Pricing Workflow' },
        { label: 'Product Scope', active: true },
      ]}
      title="Select your products"
      subtitle="Choose the product scope for your pricing strategy."
      step={1}
      footer={
        <WorkflowFooter
          label={<span style={{ fontStyle: 'italic' }}>{scopeLabel}</span>}
          onNext={handleNext}
          nextDisabled={!canNext}
        />
      }
    >
      <Card style={{ padding: '20px 24px', marginBottom: 16 }}>
        <ScopeTabs value={tab} onChange={resetTabState} />

        {tab === 'Product' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', marginBottom: 2 }}>
                  Enter EANs
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  One per line or comma-separated
                </div>
              </div>

              <Button
                variant="secondary"
                icon={IconUpload}
                onClick={() => document.getElementById('csv-upload')?.click()}
              >
                Import CSV
              </Button>
              <input id="csv-upload" type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCsvUpload} />
            </div>

            <textarea
              value={eanText}
              onChange={(e) => setEanText(e.target.value)}
              rows={6}
              placeholder="3017620422003, 7613034945532..."
              style={{
                width: '100%',
                padding: '11px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--color-border)',
                fontSize: 13,
                color: 'var(--color-text)',
                outline: 'none',
                fontFamily: 'monospace',
                resize: 'vertical',
                boxSizing: 'border-box',
                background: 'var(--color-bg)',
              }}
            />

            {eanList.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--color-primary)', marginTop: 6, fontWeight: 600 }}>
                {eanList.length} valid EAN(s) detected
              </div>
            )}
          </div>
        )}

        {tab === 'Category' && !openedCategory && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {categories.map((cat) => (
              <SelectCard
                key={cat.name}
                name={cat.name}
                selected={selectedCategory === cat.name}
                onCheck={() =>
                  setSelectedCategory((prev) => (prev === cat.name ? null : cat.name))
                }
                onClick={() => handleOpenCategory(cat.name)}
              />
            ))}
          </div>
        )}

        {tab === 'Category' && openedCategory && (
          <ProductList
            products={categoryProducts}
            selectedEans={selectedCatEans}
            onToggle={(ean) => toggleSetValue(setSelectedCatEans, ean)}
            onSelectAll={() => setSelectedCatEans(new Set(categoryProducts.map((p) => p.ean)))}
            onDeselectAll={() => setSelectedCatEans(new Set())}
            loading={loadingCatProds}
          />
        )}

        {tab === 'Brand' && !openedBrand && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {brands.map((brand) => (
              <SelectCard
                key={brand.name}
                name={brand.name}
                selected={selectedBrand === brand.name}
                onCheck={() =>
                  setSelectedBrand((prev) => (prev === brand.name ? null : brand.name))
                }
                onClick={() => handleOpenBrand(brand.name)}
              />
            ))}
          </div>
        )}

        {tab === 'Brand' && openedBrand && (
          <ProductList
            products={brandProducts}
            selectedEans={selectedBrandEans}
            onToggle={(ean) => toggleSetValue(setSelectedBrandEans, ean)}
            onSelectAll={() => setSelectedBrandEans(new Set(brandProducts.map((p) => p.ean)))}
            onDeselectAll={() => setSelectedBrandEans(new Set())}
            loading={loadingBrandProds}
          />
        )}
      </Card>
    </WorkflowPage>
  );
}