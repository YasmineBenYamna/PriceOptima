MODEL (
  name        gold.dm_pricing_performance,
  kind        FULL,
  grain       (magasin_id, category_id, brand_id, date_id),
  description 'Gold — Performance prix par enseigne × catégorie × marque × mois.
               Étoile stricte : FK → silver.magasin, silver.category, silver.brand, silver.temps.
               KPIs : ipp_global, ipp_category, ipp_brand,
               price_evolution_pct_mom, indice_saisonnier_category, indice_saisonnier_brand.
               Faits de contexte : avg_price_eur, nb_prices.'
);

WITH

base AS (
  SELECT
    p.price_eur,
    p.date,
    DATE_TRUNC('month', p.date)::DATE         AS month_date,
    EXTRACT(YEAR  FROM p.date)::INT           AS year_num,
    EXTRACT(MONTH FROM p.date)::INT           AS month_num,
    p.magasin_id,
    pc.category_tag,
    b.brand_tag
  FROM silver.prices p
  LEFT JOIN silver.products         pr ON p.product_code  = pr.product_code
  LEFT JOIN silver.product_category pc ON p.product_code  = pc.product_code
                                      AND pc.rank = 0
  LEFT JOIN silver.brand             b ON pr.brand_id      = b.brand_id
  WHERE p.price_eur  IS NOT NULL
    AND p.magasin_id IS NOT NULL
),

monthly_avg AS (
  SELECT
    magasin_id,
    category_tag,
    brand_tag,
    month_date,
    year_num,
    month_num,
    ROUND(AVG(price_eur)::NUMERIC, 4)                       AS avg_price_eur,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_eur)  AS median_price_eur,
    COUNT(*)                                                AS nb_prices
  FROM base
  GROUP BY magasin_id, category_tag, brand_tag,
           month_date, year_num, month_num
),

market_global_monthly AS (
  SELECT
    month_date,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_eur)  AS market_median_global
  FROM base
  GROUP BY month_date
),

market_category_monthly AS (
  SELECT
    category_tag,
    month_date,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_eur)  AS market_median_price_cat
  FROM base
  GROUP BY category_tag, month_date
),

market_brand_monthly AS (
  SELECT
    brand_tag,
    month_date,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_eur)  AS market_median_price_brand
  FROM base
  GROUP BY brand_tag, month_date
),

annual_category AS (
  SELECT
    magasin_id,
    category_tag,
    year_num,
    ROUND(AVG(price_eur)::NUMERIC, 4)                       AS annual_avg_cat
  FROM base
  GROUP BY magasin_id, category_tag, year_num
),

annual_brand AS (
  SELECT
    magasin_id,
    brand_tag,
    year_num,
    ROUND(AVG(price_eur)::NUMERIC, 4)                       AS annual_avg_brand
  FROM base
  GROUP BY magasin_id, brand_tag, year_num
),

enriched AS (
  SELECT
    m.*,
    CASE
      WHEN mg.market_median_global > 0
        THEN ROUND((m.median_price_eur / mg.market_median_global * 100)::NUMERIC, 2)
      ELSE NULL
    END                                                     AS ipp_global,
    CASE
      WHEN mc.market_median_price_cat > 0
        THEN ROUND((m.median_price_eur / mc.market_median_price_cat * 100)::NUMERIC, 2)
      ELSE NULL
    END                                                     AS ipp_category,
    CASE
      WHEN mb.market_median_price_brand > 0
        THEN ROUND((m.median_price_eur / mb.market_median_price_brand * 100)::NUMERIC, 2)
      ELSE NULL
    END                                                     AS ipp_brand,
    CASE
      WHEN ac.annual_avg_cat > 0
        THEN ROUND((m.avg_price_eur / ac.annual_avg_cat * 100)::NUMERIC, 2)
      ELSE NULL
    END                                                     AS indice_saisonnier_category,
    CASE
      WHEN ab.annual_avg_brand > 0
        THEN ROUND((m.avg_price_eur / ab.annual_avg_brand * 100)::NUMERIC, 2)
      ELSE NULL
    END                                                     AS indice_saisonnier_brand
  FROM monthly_avg m
  LEFT JOIN market_global_monthly   mg ON m.month_date   = mg.month_date
  LEFT JOIN market_category_monthly mc ON m.category_tag = mc.category_tag
                                      AND m.month_date   = mc.month_date
  LEFT JOIN market_brand_monthly    mb ON m.brand_tag    = mb.brand_tag
                                      AND m.month_date   = mb.month_date
  LEFT JOIN annual_category         ac ON m.magasin_id   = ac.magasin_id
                                      AND m.category_tag = ac.category_tag
                                      AND m.year_num     = ac.year_num
  LEFT JOIN annual_brand            ab ON m.magasin_id   = ab.magasin_id
                                      AND m.brand_tag    = ab.brand_tag
                                      AND m.year_num     = ab.year_num
),

with_mom AS (
  SELECT
    *,
    LAG(avg_price_eur) OVER (
      PARTITION BY magasin_id, category_tag, brand_tag
      ORDER BY month_date
    )                                                       AS prev_month_avg_price_eur
  FROM enriched
)

SELECT
  -- ── Clés étrangères étoile
  w.magasin_id,                                            -- FK → silver.magasin
  cat.category_id,                                         -- FK → silver.category
  b.brand_id,                                              -- FK → silver.brand
  TO_CHAR(w.month_date, 'YYYYMMDD')::INT                   AS date_id, -- FK → silver.temps

  -- ── Faits de contexte
  w.nb_prices,
  w.avg_price_eur,

  -- ── KPIs
  w.ipp_global,
  w.ipp_category,
  w.ipp_brand,
  CASE
    WHEN w.prev_month_avg_price_eur > 0
      THEN ROUND(
        (w.avg_price_eur - w.prev_month_avg_price_eur)
        / w.prev_month_avg_price_eur * 100, 2
      )
    ELSE NULL
  END                                                      AS price_evolution_pct_mom,
  w.indice_saisonnier_category,
  w.indice_saisonnier_brand,

  CURRENT_TIMESTAMP                                        AS created_at,
  CURRENT_TIMESTAMP                                        AS updated_at

FROM with_mom w
LEFT JOIN silver.category cat ON w.category_tag = cat.category_tag
LEFT JOIN silver.brand    b   ON w.brand_tag    = b.brand_tag