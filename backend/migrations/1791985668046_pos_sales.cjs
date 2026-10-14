exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE public.pos_sales (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      receipt_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
      cashier_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
      idempotency_key uuid NOT NULL,
      request_hash char(64) NOT NULL,
      payment_method varchar(24) NOT NULL,
      payment_status varchar(16) NOT NULL DEFAULT 'RECORDED',
      status varchar(16) NOT NULL DEFAULT 'COMPLETED',
      total numeric(12,2) NOT NULL,
      cash_received numeric(12,2),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pos_sales_payment_method_valid CHECK (payment_method IN ('CASH','DEBIT_CARD','CREDIT_CARD','BANK_TRANSFER','OTHER')),
      CONSTRAINT pos_sales_payment_recorded CHECK (payment_status = 'RECORDED'),
      CONSTRAINT pos_sales_status_completed CHECK (status = 'COMPLETED'),
      CONSTRAINT pos_sales_total_nonnegative CHECK (total >= 0),
      CONSTRAINT pos_sales_cash_valid CHECK (
        (payment_method = 'CASH' AND cash_received IS NOT NULL AND cash_received >= total)
        OR (payment_method <> 'CASH' AND cash_received IS NULL)
      ),
      CONSTRAINT pos_sales_idempotency_unique UNIQUE (cashier_id, idempotency_key)
    );
    CREATE INDEX pos_sales_created_at_idx ON public.pos_sales(created_at DESC);
    CREATE INDEX pos_sales_cashier_created_at_idx ON public.pos_sales(cashier_id, created_at DESC);

    CREATE TABLE public.pos_sale_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sale_id uuid NOT NULL REFERENCES public.pos_sales(id) ON DELETE RESTRICT,
      variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
      sku_snapshot varchar(80) NOT NULL,
      product_name_snapshot varchar(160) NOT NULL,
      size_snapshot varchar(50) NOT NULL DEFAULT '',
      color_snapshot varchar(50) NOT NULL DEFAULT '',
      quantity integer NOT NULL,
      unit_price numeric(12,2) NOT NULL,
      line_total numeric(12,2) NOT NULL,
      CONSTRAINT pos_sale_items_quantity_positive CHECK (quantity > 0),
      CONSTRAINT pos_sale_items_prices_nonnegative CHECK (unit_price >= 0 AND line_total >= 0),
      CONSTRAINT pos_sale_items_sale_variant_unique UNIQUE (sale_id, variant_id)
    );
    CREATE INDEX pos_sale_items_sale_idx ON public.pos_sale_items(sale_id);

    ALTER TABLE public.inventory_movements
      DROP CONSTRAINT inventory_movements_type_valid,
      ADD CONSTRAINT inventory_movements_type_valid CHECK (type IN ('RECEIPT', 'ADJUSTMENT', 'POS_SALE')),
      ADD COLUMN sale_id uuid REFERENCES public.pos_sales(id) ON DELETE RESTRICT;
    CREATE INDEX inventory_movements_sale_idx ON public.inventory_movements(sale_id) WHERE sale_id IS NOT NULL;

    ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.pos_sales, public.pos_sale_items FROM PUBLIC, anon, authenticated;
  `);
};

exports.down = () => { throw new Error('La migración POS es irreversible para preservar ventas y movimientos de inventario.'); };
