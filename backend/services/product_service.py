from fastapi import HTTPException
from sqlalchemy import text
import csv, io, logging

logger = logging.getLogger("product_service")


class ProductService:
    """Gère la recherche et l'import de produits depuis le schéma silver."""

    def __init__(self, db_manager):
        """
        Args:
            db_manager: Instance de DatabaseManager
        """
        self._db = db_manager

    def _query(self, sql: str, params: dict) -> list:
        """Exécute une requête SQL sur la base marché et retourne les résultats."""
        with self._db.market_conn() as conn:
            result = conn.execute(text(sql), params)
            return [dict(row._mapping) for row in result]

    def _get_image_url(self, code: str, images_raw) -> str:
        """
        Construit l'URL de l'image principale du produit depuis images_raw.
        silver.products expose images_raw comme liste JSON.

        Args:
            code: EAN / product_code du produit
            images_raw: Valeur brute de la colonne images_raw
        """
        import json
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

            # Priorité : front_* avec imgid
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

            # Fallback : premier imgid non-front
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
        """
        Convertit une ligne silver.products en dict produit standard.

        Mapping silver → ancien public :
          product_code  ← code
          product_name  ← product_name  (identique)
          brand_primary ← brands
          (catégorie via silver.category si disponible, sinon vide)
          images_raw    ← images
        """
        code = row.get("product_code") or ""
        return {
            "ean":       code,
            "name":      row.get("product_name")  or "",
            "brand":     row.get("brand_primary") or "",
            "category":  row.get("category_name") or "",   # injecté par les requêtes avec JOIN category
            "image_url": self._get_image_url(code, row.get("images_raw"))
        }

    # ------------------------------------------------------------------
    # Recherche
    # ------------------------------------------------------------------

    def search(self, q: str, limit: int) -> dict:
        """
        Recherche des produits par nom ou code EAN dans silver.products.
        Seuls les produits ayant au moins un prix dans silver.prices sont retournés.

        Args:
            q: Terme de recherche
            limit: Nombre maximum de résultats
        """
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
        """
        Récupère les infos produit pour une liste d'EANs depuis silver.products.
        Seuls les produits ayant au moins un prix dans silver.prices sont retournés.

        Args:
            eans: Liste de codes EAN (product_code)
        """
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
        """
        Importe des EANs depuis un fichier CSV.

        Args:
            content: Contenu du fichier CSV décodé en UTF-8
        """
        reader = csv.DictReader(io.StringIO(content))
        eans   = []
        for row in reader:
            ean = row.get("ean") or row.get("EAN") or row.get("code")
            if ean and ean.strip():
                eans.append(ean.strip())
        if not eans:
            raise HTTPException(status_code=400, detail="Aucun EAN trouvé dans le fichier")
        return self.get_by_eans(eans)

    # ------------------------------------------------------------------
    # Catégories  (silver.category)
    # ------------------------------------------------------------------

    def get_categories(self) -> dict:
        """Retourne la liste des catégories avec le nombre de produits depuis silver.category."""
        rows = self._query("""
            SELECT category_name, product_count
            FROM silver.category
            WHERE category_name IS NOT NULL
              AND product_count > 10
            ORDER BY product_count DESC
            LIMIT 50
        """, {})
        return {
            "categories": [
                {"name": r["category_name"], "product_count": r["product_count"]}
                for r in rows if r.get("category_name")
            ],
            "total": len(rows)
        }

    def get_by_category(self, category: str, limit: int) -> dict:
        """
        Retourne les produits d'une catégorie depuis silver.products.
        Seuls les produits ayant un prix dans silver.prices sont retournés.
        """
        rows = self._query("""
            SELECT DISTINCT ON (pr.product_code)
                   pr.product_code, pr.product_name, pr.brand_primary,
                   pr.images_raw, c.category_name
            FROM silver.products pr
            INNER JOIN silver.prices p ON p.product_code = pr.product_code
                                      AND p.price_eur IS NOT NULL
                                      AND p.price_eur > 0
            JOIN silver.category c
              ON c.category_tag ILIKE :cat
              OR c.category_name ILIKE :cat
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
    # Marques  (silver.brand)
    # ------------------------------------------------------------------

    def get_brands(self, limit: int) -> dict:
        """Retourne la liste des marques avec le nombre de produits depuis silver.brand."""
        rows = self._query("""
            SELECT brand_name, product_count
            FROM silver.brand
            WHERE brand_name IS NOT NULL
              AND product_count > 5
            ORDER BY product_count DESC
            LIMIT :limit
        """, {"limit": limit})
        return {
            "brands": [
                {"name": r["brand_name"], "product_count": r["product_count"]}
                for r in rows if r.get("brand_name")
            ],
            "total": len(rows)
        }

    def get_by_brand(self, brand: str, limit: int) -> dict:
        """
        Retourne les produits d'une marque depuis silver.products.
        Seuls les produits ayant un prix dans silver.prices sont retournés.
        """
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