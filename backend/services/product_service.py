from fastapi import HTTPException
from sqlalchemy import text
import csv, io, logging, json, re

logger = logging.getLogger("product_service")


class ProductService:
    """Gère la recherche et l'import de produits depuis le schéma silver."""

    def __init__(self, db_manager):
        self._db = db_manager

    def _query(self, sql: str, params: dict) -> list:
        with self._db.market_conn() as conn:
            result = conn.execute(text(sql), params)
            return [dict(row._mapping) for row in result]

    def _parse_name(self, product_name) -> str:
        if not product_name:
            return ""
        if not isinstance(product_name, str):
            return str(product_name)
        stripped = product_name.strip()
        if not stripped.startswith("["):
            return stripped
        if stripped in ("[]", "[ ]"):
            return ""
        for lang in ("en", "main", "fr", "de"):
            pattern = r"'lang':\s*" + lang + r"\s*,\s*'text':\s*([^,'\}\[\]]+)"
            m = re.search(pattern, stripped)
            if m:
                return m.group(1).strip()
        m = re.search(r"'text':\s*([^,'\}\[\]]+)", stripped)
        if m:
            return m.group(1).strip()
        return stripped

    def _get_image_url(self, code: str, images_raw) -> str:
        try:
            if not images_raw:
                return None
            if isinstance(images_raw, str):
                images = json.loads(
                    images_raw
                    .replace("'", '"')
                    .replace("NULL", "null")
                    .replace("True", "true")
                    .replace("False", "false")
                )
            else:
                images = images_raw
            if not isinstance(images, list):
                return None
            for img in images:
                key   = str(img.get("key", ""))
                imgid = img.get("imgid")
                if key.startswith("front_") and imgid:
                    code_str = str(code)
                    path = (
                        f"{code_str[0:3]}/{code_str[3:6]}/{code_str[6:9]}/{code_str[9:]}"
                        if len(code_str) > 8 else code_str
                    )
                    return f"https://images.openfoodfacts.org/images/products/{path}/{imgid}.400.jpg"
            for img in images:
                imgid = img.get("imgid")
                key   = str(img.get("key", ""))
                if imgid and not key.startswith("front_"):
                    code_str = str(code)
                    path = (
                        f"{code_str[0:3]}/{code_str[3:6]}/{code_str[6:9]}/{code_str[9:]}"
                        if len(code_str) > 8 else code_str
                    )
                    return f"https://images.openfoodfacts.org/images/products/{path}/{imgid}.400.jpg"
            return None
        except Exception as e:
            logger.warning(f"_get_image_url error for {code}: {e}")
            return None

    def _serialize(self, row: dict) -> dict:
        code = row.get("product_code") or ""
        return {
            "ean":       code,
            "name":      self._parse_name(row.get("product_name")),
            "brand":     row.get("brand_primary") or "",
            "category":  row.get("category_name") or "",
            "image_url": self._get_image_url(code, row.get("images_raw"))
        }

    # ------------------------------------------------------------------
    # Recherche
    # ------------------------------------------------------------------

    def search(self, q: str, limit: int) -> dict:
        rows = self._query("""
            SELECT DISTINCT ON (p.product_code)
                   p.product_code, p.product_name, p.brand_primary, p.images_raw
            FROM silver.products p
            INNER JOIN silver.prices pr ON pr.product_code = p.product_code
                                       AND pr.price_eur IS NOT NULL
                                       AND pr.price_eur > 0
            WHERE (p.product_name ILIKE :q OR p.product_code ILIKE :q)
              AND p.product_name IS NOT NULL
              AND p.product_code IS NOT NULL
              AND p.is_viable = TRUE
            LIMIT :limit
        """, {"q": f"%{q}%", "limit": limit})
        return {"products": [self._serialize(r) for r in rows], "total": len(rows)}

    def get_by_eans(self, eans: list) -> dict:
        logger.info(f"get_by_eans appelé avec: {eans}")
        rows = self._query("""
            SELECT DISTINCT ON (p.product_code)
                   p.product_code, p.product_name, p.brand_primary, p.images_raw
            FROM silver.products p
            INNER JOIN silver.prices pr ON pr.product_code = p.product_code
                                       AND pr.price_eur IS NOT NULL
                                       AND pr.price_eur > 0
            WHERE p.product_code = ANY(:eans)
              AND p.product_name IS NOT NULL
        """, {"eans": eans})
        logger.info(f"Rows trouvées: {len(rows)}")
        products    = []
        found_codes = set()
        for r in rows:
            found_codes.add(r["product_code"])
            products.append(self._serialize(r))
        return {
            "products":  products,
            "total":     len(products),
            "not_found": [e for e in eans if e not in found_codes]
        }

    def import_csv(self, content: str) -> dict:
        content = content.lstrip('\ufeff')  # strip BOM Excel
        reader = csv.DictReader(io.StringIO(content))
        eans = []
        for row in reader:
            ean = row.get("ean") or row.get("EAN") or row.get("code") or row.get("barcode")
            if ean and ean.strip():
                ean_clean = ean.strip()
                # Convertir uniquement la notation scientifique Excel (ex: 8.90408E+12)
                if 'E' in ean_clean.upper() and '.' in ean_clean:
                    try:
                        ean_clean = str(int(float(ean_clean)))
                    except ValueError:
                        pass
                if ean_clean:
                    eans.append(ean_clean)
        logger.info(f"=== CSV DEBUG ===")
        logger.info(f"Content repr: {repr(content[:300])}")
        logger.info(f"EANs extraits: {eans}")
        if not eans:
            raise HTTPException(status_code=400, detail="Aucun EAN trouvé dans le fichier")
        return self.get_by_eans(eans)
    # ------------------------------------------------------------------
    # Catégories
    # ------------------------------------------------------------------

    def get_categories(self, magasin_id: str | None = None, gold_only: bool = False) -> dict:
        logger.info(f">>> get_categories appelé avec magasin_id={magasin_id} gold_only={gold_only}")
        if magasin_id and gold_only:
            rows = self._query("""
                SELECT DISTINCT c.category_name,
                    COUNT(DISTINCT dp.brand_id) AS product_count
                FROM gold.dm_pricing_performance dp
                LEFT JOIN silver.category c ON c.category_id = dp.category_id
                WHERE dp.magasin_id = :magasin_id
                AND c.category_name IS NOT NULL
                GROUP BY c.category_name
                ORDER BY product_count DESC
                LIMIT 200
            """, {"magasin_id": magasin_id})
        elif magasin_id:
            rows = self._query("""
                SELECT c.category_name, COUNT(DISTINCT p.product_code) AS product_count
                FROM silver.category c
                INNER JOIN silver.product_category pc ON pc.category_id = c.category_id
                INNER JOIN silver.products prod ON prod.product_code = pc.product_code AND prod.is_viable = TRUE
                INNER JOIN silver.prices p ON p.product_code = prod.product_code
                                        AND p.price_eur IS NOT NULL AND p.price_eur > 0
                                        AND p.magasin_id = :magasin_id
                WHERE c.category_name IS NOT NULL
                GROUP BY c.category_name
                HAVING COUNT(DISTINCT p.product_code) > 0
                ORDER BY product_count DESC
                LIMIT 200
            """, {"magasin_id": magasin_id})
        else:
            rows = self._query("""
                SELECT category_name, product_count
                FROM silver.category
                WHERE category_name IS NOT NULL AND product_count > 10
                ORDER BY product_count DESC
                LIMIT 200
            """, {})
        return {
            "categories": [{"name": r["category_name"], "product_count": r["product_count"]}
                        for r in rows if r.get("category_name")],
            "total": len(rows)
        }

    def get_by_category(self, category: str, magasin_id: str | None, limit: int) -> dict:
        if magasin_id:
            rows = self._query("""
                SELECT DISTINCT ON (pr.product_code)
                       pr.product_code, pr.product_name, pr.brand_primary,
                       pr.images_raw, c.category_name
                FROM silver.products pr
                INNER JOIN silver.prices p ON p.product_code = pr.product_code
                                          AND p.price_eur IS NOT NULL
                                          AND p.price_eur > 0
                                          AND p.magasin_id = :magasin_id
                INNER JOIN silver.product_category pc
                        ON pc.product_code = pr.product_code
                INNER JOIN silver.category c
                        ON c.category_id = pc.category_id
                       AND (c.category_name ILIKE :cat OR c.category_tag ILIKE :cat)
                WHERE pr.product_name IS NOT NULL
                  AND pr.product_code IS NOT NULL
                  AND pr.is_viable = TRUE
                LIMIT :limit
            """, {"cat": f"%{category}%", "magasin_id": magasin_id, "limit": limit})
        else:
            rows = self._query("""
                SELECT DISTINCT ON (pr.product_code)
                       pr.product_code, pr.product_name, pr.brand_primary,
                       pr.images_raw, c.category_name
                FROM silver.products pr
                INNER JOIN silver.prices p ON p.product_code = pr.product_code
                                          AND p.price_eur IS NOT NULL
                                          AND p.price_eur > 0
                INNER JOIN silver.product_category pc
                        ON pc.product_code = pr.product_code
                INNER JOIN silver.category c
                        ON c.category_id = pc.category_id
                       AND (c.category_name ILIKE :cat OR c.category_tag ILIKE :cat)
                WHERE pr.product_name IS NOT NULL
                  AND pr.product_code IS NOT NULL
                  AND pr.is_viable = TRUE
                LIMIT :limit
            """, {"cat": f"%{category}%", "limit": limit})
        return {
            "category": category,
            "products": [self._serialize(r) for r in rows],
            "total":    len(rows)
        }

    # ------------------------------------------------------------------
    # Marques
    # ------------------------------------------------------------------

    def get_brands(self, limit: int, magasin_id: str | None = None, gold_only: bool = False) -> dict:
        if magasin_id and gold_only:
            rows = self._query("""
                SELECT DISTINCT b.brand_name,
                    COUNT(DISTINCT dp.category_id) AS product_count
                FROM gold.dm_pricing_performance dp
                LEFT JOIN silver.brand b ON b.brand_id = dp.brand_id
                WHERE dp.magasin_id = :magasin_id
                AND b.brand_name IS NOT NULL
                GROUP BY b.brand_name
                ORDER BY product_count DESC
                LIMIT :limit
            """, {"magasin_id": magasin_id, "limit": limit})
        elif magasin_id:
            rows = self._query("""
                SELECT p.brand_primary AS brand_name, COUNT(DISTINCT p.product_code) AS product_count
                FROM silver.products p
                INNER JOIN silver.prices pr ON pr.product_code = p.product_code
                                        AND pr.price_eur IS NOT NULL AND pr.price_eur > 0
                                        AND pr.magasin_id = :magasin_id
                WHERE p.brand_primary IS NOT NULL AND p.is_viable = TRUE
                GROUP BY p.brand_primary
                HAVING COUNT(DISTINCT p.product_code) > 0
                ORDER BY product_count DESC
                LIMIT :limit
            """, {"magasin_id": magasin_id, "limit": limit})
        else:
            rows = self._query("""
                SELECT brand_name, product_count FROM silver.brand
                WHERE brand_name IS NOT NULL AND product_count > 5
                ORDER BY product_count DESC LIMIT :limit
            """, {"limit": limit})
        return {
            "brands": [{"name": r["brand_name"], "product_count": r["product_count"]}
                    for r in rows if r.get("brand_name")],
            "total": len(rows)
        }
        
    def get_by_brand(self, brand: str, magasin_id: str | None, limit: int) -> dict:
        if magasin_id:
            rows = self._query("""
                SELECT DISTINCT ON (p.product_code)
                       p.product_code, p.product_name, p.brand_primary, p.images_raw
                FROM silver.products p
                INNER JOIN silver.prices pr ON pr.product_code = p.product_code
                                           AND pr.price_eur IS NOT NULL
                                           AND pr.price_eur > 0
                                           AND pr.magasin_id = :magasin_id
                WHERE p.brand_primary ILIKE :brand
                  AND p.product_name IS NOT NULL
                  AND p.product_code IS NOT NULL
                  AND p.is_viable = TRUE
                LIMIT :limit
            """, {"brand": f"%{brand}%", "magasin_id": magasin_id, "limit": limit})
        else:
            rows = self._query("""
                SELECT DISTINCT ON (p.product_code)
                       p.product_code, p.product_name, p.brand_primary, p.images_raw
                FROM silver.products p
                INNER JOIN silver.prices pr ON pr.product_code = p.product_code
                                           AND pr.price_eur IS NOT NULL
                                           AND pr.price_eur > 0
                WHERE p.brand_primary ILIKE :brand
                  AND p.product_name IS NOT NULL
                  AND p.product_code IS NOT NULL
                  AND p.is_viable = TRUE
                LIMIT :limit
            """, {"brand": f"%{brand}%", "limit": limit})
        return {
            "brand":    brand,
            "products": [self._serialize(r) for r in rows],
            "total":    len(rows)
        }