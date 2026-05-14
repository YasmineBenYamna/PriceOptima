MODEL (
  name seeds.mapping_magasin,
  kind SEED (
    path '../../seeds/mapping_magasin_filtered_utf8.csv'
  ),
  
  columns (
    nom_enseigne_extrait TEXT,
    brand_canonical TEXT
  )
);