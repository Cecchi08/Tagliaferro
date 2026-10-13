exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE public.categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(100) NOT NULL,
      slug varchar(120) NOT NULL UNIQUE,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT categories_name_not_blank CHECK (length(btrim(name)) > 0),
      CONSTRAINT categories_slug_not_blank CHECK (length(btrim(slug)) > 0)
    );

    CREATE TABLE public.products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
      name varchar(160) NOT NULL,
      description text NOT NULL DEFAULT '',
      brand varchar(100) NOT NULL DEFAULT '',
      sport varchar(100) NOT NULL DEFAULT '',
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT products_name_not_blank CHECK (length(btrim(name)) > 0)
    );
    CREATE INDEX products_category_active_idx ON public.products(category_id, active);
    CREATE INDEX products_name_search_idx ON public.products USING gin (to_tsvector('simple', name));

    CREATE TABLE public.product_variants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
      sku varchar(80) NOT NULL UNIQUE,
      size varchar(50) NOT NULL DEFAULT '',
      color varchar(50) NOT NULL DEFAULT '',
      price numeric(12,2) NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT variants_sku_not_blank CHECK (length(btrim(sku)) > 0),
      CONSTRAINT variants_price_nonnegative CHECK (price >= 0)
    );
    CREATE INDEX variants_product_active_idx ON public.product_variants(product_id, active);

    CREATE TABLE public.inventory (
      variant_id uuid PRIMARY KEY REFERENCES public.product_variants(id) ON DELETE RESTRICT,
      on_hand integer NOT NULL DEFAULT 0,
      reserved integer NOT NULL DEFAULT 0,
      low_stock_threshold integer NOT NULL DEFAULT 5,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT inventory_quantities_valid CHECK (on_hand >= reserved AND reserved >= 0),
      CONSTRAINT inventory_threshold_nonnegative CHECK (low_stock_threshold >= 0)
    );

    CREATE TABLE public.inventory_movements (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
      delta integer NOT NULL,
      type varchar(20) NOT NULL,
      reason varchar(500) NOT NULL,
      actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT inventory_movements_delta_nonzero CHECK (delta <> 0),
      CONSTRAINT inventory_movements_type_valid CHECK (type IN ('RECEIPT', 'ADJUSTMENT')),
      CONSTRAINT inventory_movements_reason_not_blank CHECK (length(btrim(reason)) > 0)
    );
    CREATE INDEX inventory_movements_variant_date_idx ON public.inventory_movements(variant_id, created_at DESC);

    ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.categories, public.products, public.product_variants, public.inventory, public.inventory_movements FROM PUBLIC, anon, authenticated;
  `);
};

exports.down = () => { throw new Error('La migración de catálogo e inventario es irreversible para evitar borrar productos y movimientos.'); };
