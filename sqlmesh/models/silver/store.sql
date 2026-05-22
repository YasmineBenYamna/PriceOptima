MODEL (
  name        silver.store,
  kind        FULL,
  cron   '@weekly', 
  grain       (store_id),
  description 'Référentiel dédupliqué des points de vente physiques, normalisé depuis prices_raw. Enrichi avec géolocalisation OSM, mapping enseigne canonique via matching ILIKE robuste sur nom complet.'
);

WITH

raw_stores AS (
  SELECT DISTINCT
    location_osm_id                           AS osm_id,
    location_osm_type                         AS osm_type,
    location_osm_name                         AS osm_name_raw,
    location_osm_brand                        AS osm_brand_raw,
    location_osm_display_name                 AS osm_display_name,
    location_osm_lat                          AS osm_lat,
    location_osm_lon                          AS osm_lon,
    location_osm_tag_key                      AS osm_tag_key,
    location_osm_tag_value                    AS osm_tag_value,
    location_osm_address_postcode             AS postcode_raw,
    location_osm_address_city                 AS city_raw,
    location_osm_address_country              AS country_raw,
    location_osm_address_country_code         AS country_code_raw,
    location_type
  FROM bronze.prices_raw
  WHERE location_osm_id    IS NOT NULL
     OR location_osm_name  IS NOT NULL
     OR location_osm_brand IS NOT NULL
),

stores_cleaned AS (
  SELECT
    osm_id,
    osm_type,
    osm_tag_key,
    osm_tag_value,
    location_type,
    osm_name_raw,
    osm_brand_raw,
    osm_display_name,
    osm_lat,
    osm_lon,

    NULLIF(UPPER(TRIM(country_code_raw)), '')  AS country_code,
    NULLIF(INITCAP(TRIM(country_raw)), '')     AS country,

    NULLIF(
      INITCAP(TRIM(REGEXP_REPLACE(city_raw, '\s+', ' ', 'g'))),
    '')                                        AS city,

    NULLIF(
      REGEXP_REPLACE(TRIM(COALESCE(postcode_raw,'')), '[^0-9\-]', '', 'g'),
    '')                                        AS postcode,

    CASE
      WHEN country_code_raw ILIKE 'fr'
        AND TRIM(COALESCE(postcode_raw,'')) ~ '^\d{5}$'
        THEN LEFT(TRIM(postcode_raw), 2)
      ELSE NULL
    END                                        AS department_code,

    CASE
      WHEN osm_brand_raw IS NOT NULL
        AND LENGTH(TRIM(osm_brand_raw)) > 1
        THEN INITCAP(TRIM(osm_brand_raw))
      WHEN osm_name_raw IS NOT NULL
        AND LENGTH(TRIM(osm_name_raw)) > 3
        THEN INITCAP(TRIM(REGEXP_REPLACE(osm_name_raw, '\s+', ' ', 'g')))
      WHEN osm_display_name IS NOT NULL
        AND LENGTH(TRIM(SPLIT_PART(osm_display_name, ',', 1))) > 2
        THEN INITCAP(TRIM(SPLIT_PART(osm_display_name, ',', 1)))
      ELSE NULL
    END                                        AS store_name_pre,

    LOWER(
      TRIM(
        REGEXP_REPLACE(
          CONCAT_WS(' ',
            COALESCE(osm_brand_raw, ''),
            COALESCE(osm_name_raw, ''),
            COALESCE(SPLIT_PART(osm_display_name, ',', 1), '')
          ),
          '[^a-zA-ZÀ-ÿ0-9\s]', ' ', 'g'
        )
      )
    )                                          AS search_text,

    LOWER(TRIM(
      REGEXP_REPLACE(
        COALESCE(osm_brand_raw, osm_name_raw, ''),
        '[^a-zA-ZÀ-ÿ0-9\s\-]', '', 'g'
      )
    ))                                         AS nom_enseigne_extrait_raw

  FROM raw_stores
),

stores_mapped AS (
  SELECT DISTINCT ON (s.osm_id)
    s.*,
    m.brand_canonical                          AS nom_magasin,

    CASE
      WHEN s.store_name_pre IS NOT NULL
        THEN s.store_name_pre
      WHEN m.brand_canonical IS NOT NULL AND s.city IS NOT NULL
        THEN INITCAP(m.brand_canonical) || ' ' || s.city
      WHEN m.brand_canonical IS NOT NULL
        THEN INITCAP(m.brand_canonical)
      WHEN s.osm_id IS NOT NULL
        THEN 'Store OSM-' || s.osm_id::TEXT
      ELSE 'Store Inconnu'
    END                                        AS store_name

  FROM stores_cleaned s
  LEFT JOIN seeds.mapping_magasin m
    ON s.search_text ILIKE '%' || m.nom_enseigne_extrait || '%'
    AND LENGTH(m.nom_enseigne_extrait) >= 3

  ORDER BY s.osm_id, LENGTH(m.nom_enseigne_extrait) DESC NULLS LAST
),

deduped AS (
  SELECT DISTINCT ON (osm_id)
    osm_id,
    store_name,
    nom_magasin,
    country_code,
    country,
    department_code,
    city,
    postcode,
    osm_lat                                    AS latitude,
    osm_lon                                    AS longitude,
    osm_tag_key,
    osm_tag_value,
    location_type,

    (
      (CASE WHEN store_name IS NOT NULL
              AND store_name NOT LIKE 'Store OSM-%'
              AND store_name <> 'Store Inconnu' THEN 1 ELSE 0 END) +
      (CASE WHEN city        IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN postcode    IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN osm_lat     IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN nom_magasin IS NOT NULL THEN 1 ELSE 0 END)
    )                                          AS completeness_score

  FROM stores_mapped
  WHERE osm_id IS NOT NULL
  ORDER BY
    osm_id,
    nom_magasin NULLS LAST,
    city        NULLS LAST,
    osm_lat     NULLS LAST
)

SELECT
  MD5(osm_id::TEXT)               AS store_id,

  CASE
    WHEN nom_magasin IS NOT NULL THEN MD5(nom_magasin)
    ELSE NULL
  END                             AS magasin_id,

  osm_id,
  store_name,
  nom_magasin,

  country_code,
  country,
  department_code,
  city,
  postcode,
  latitude,
  longitude,

  osm_tag_key,
  osm_tag_value,
  location_type,

  completeness_score,

  CURRENT_TIMESTAMP               AS created_at,
  CURRENT_TIMESTAMP               AS updated_at

FROM deduped