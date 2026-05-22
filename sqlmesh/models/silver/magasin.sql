
MODEL (
  name        silver.magasin,
  kind        FULL,
  cron   '@weekly', 
  grain       (magasin_id),
  description 'Entité enseigne consolidée...'
);
WITH

canonical_brands AS (
  SELECT DISTINCT
    brand_canonical
  FROM seeds.mapping_magasin
  WHERE brand_canonical IS NOT NULL
    AND TRIM(brand_canonical) <> ''
    AND brand_canonical ~ '^[a-zA-ZÀ-ÿ0-9 \.\-\''&]+$'
),

store_stats AS (
  SELECT
    nom_magasin                                           AS brand_canonical,
    COUNT(*)                                              AS nb_stores,
    COUNT(*) FILTER (WHERE latitude  IS NOT NULL
                       AND longitude IS NOT NULL)         AS nb_stores_geolocated,
    MODE() WITHIN GROUP (ORDER BY country_code)           AS country_code_main,
    MODE() WITHIN GROUP (ORDER BY country)                AS country_main,
    MODE() WITHIN GROUP (ORDER BY department_code)        AS department_main,
    ROUND(AVG(completeness_score)::NUMERIC, 2)            AS avg_store_completeness,
    COUNT(*) FILTER (WHERE store_name NOT LIKE 'Store OSM-%'
                       AND store_name <> 'Store Inconnu') AS nb_stores_named
  FROM silver.store AS store_ref
  WHERE store_ref.nom_magasin IS NOT NULL
  GROUP BY store_ref.nom_magasin
),

enriched AS (
  SELECT
    cb.brand_canonical,
    COALESCE(ss.nb_stores, 0)              AS nb_stores,
    COALESCE(ss.nb_stores_geolocated, 0)   AS nb_stores_geolocated,
    COALESCE(ss.nb_stores_named, 0)        AS nb_stores_named,
    ROUND(
      CASE WHEN COALESCE(ss.nb_stores, 0) > 0
        THEN ss.nb_stores_geolocated::NUMERIC / ss.nb_stores * 100
        ELSE 0
      END, 2
    )                                      AS pct_geo_coverage,
    ss.country_code_main,
    ss.country_main,
    ss.department_main,
    COALESCE(ss.avg_store_completeness, 0) AS avg_store_completeness,
    CONCAT(
      'Enseigne ',
      INITCAP(cb.brand_canonical),
      CASE
        WHEN ss.country_main IS NOT NULL
          THEN ' (' || ss.country_main || ')'
        ELSE ''
      END,
      '. Présente dans ',
      COALESCE(ss.nb_stores, 0)::TEXT,
      ' point(s) de vente référencé(s).'
    )                                      AS description,
    CASE
      WHEN COALESCE(ss.nb_stores, 0) >= 100 THEN 'major'
      WHEN COALESCE(ss.nb_stores, 0) >= 20  THEN 'mid'
      WHEN COALESCE(ss.nb_stores, 0) >= 1   THEN 'minor'
      ELSE 'no_store_matched'
    END                                    AS network_tier
  FROM canonical_brands cb
  LEFT JOIN store_stats ss USING (brand_canonical)
)

SELECT
  MD5(brand_canonical)            AS magasin_id,
  brand_canonical                 AS nom_enseigne,
  description,
  country_code_main               AS country_code,
  country_main                    AS country,
  department_main                 AS department,
  nb_stores,
  nb_stores_geolocated,
  nb_stores_named,
  pct_geo_coverage,
  network_tier,
  avg_store_completeness,
  CURRENT_TIMESTAMP               AS created_at,
  CURRENT_TIMESTAMP               AS updated_at
FROM enriched
WHERE nb_stores > 0