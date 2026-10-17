exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE public.store_orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
      idempotency_key uuid NOT NULL,
      request_hash char(64) NOT NULL,
      status varchar(24) NOT NULL DEFAULT 'PENDING_PAYMENT',
      total numeric(12,2) NOT NULL CHECK (total >= 0),
      currency char(3) NOT NULL DEFAULT 'ARS' CHECK (currency = 'ARS'),
      expires_at timestamptz NOT NULL,
      mp_preference_id text,
      mp_checkout_url text,
      mp_payment_id text UNIQUE,
      paid_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT store_orders_status_valid CHECK (status IN ('PENDING_PAYMENT','PAID','CANCELLED','EXPIRED','REVIEW')),
      CONSTRAINT store_orders_idempotency_unique UNIQUE (customer_id, idempotency_key)
    );
    CREATE INDEX store_orders_customer_idx ON public.store_orders(customer_id, created_at DESC);
    CREATE INDEX store_orders_expiry_idx ON public.store_orders(expires_at) WHERE status='PENDING_PAYMENT';
    CREATE TABLE public.store_order_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES public.store_orders(id) ON DELETE RESTRICT,
      variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
      sku_snapshot varchar(80) NOT NULL,
      product_name_snapshot varchar(160) NOT NULL,
      size_snapshot varchar(50) NOT NULL DEFAULT '',
      color_snapshot varchar(50) NOT NULL DEFAULT '',
      quantity integer NOT NULL CHECK (quantity > 0),
      unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
      line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
      CONSTRAINT store_order_item_variant_unique UNIQUE(order_id, variant_id)
    );
    CREATE TABLE public.stock_reservations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES public.store_orders(id) ON DELETE RESTRICT,
      variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
      quantity integer NOT NULL CHECK (quantity > 0),
      status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RELEASED','COMMITTED','EXPIRED')),
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT stock_reservation_variant_unique UNIQUE(order_id, variant_id)
    );
    CREATE INDEX stock_reservations_active_expiry_idx ON public.stock_reservations(expires_at) WHERE status='ACTIVE';
    ALTER TABLE public.inventory_movements DROP CONSTRAINT inventory_movements_type_valid;
    ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_type_valid CHECK (type IN ('RECEIPT','ADJUSTMENT','POS_SALE','ECOM_SALE'));
    ALTER TABLE public.inventory_movements ADD COLUMN order_id uuid REFERENCES public.store_orders(id) ON DELETE RESTRICT;
    CREATE INDEX inventory_movements_order_idx ON public.inventory_movements(order_id) WHERE order_id IS NOT NULL;
    CREATE TABLE public.payment_notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_event_id text NOT NULL UNIQUE,
      payment_id text NOT NULL,
      outcome varchar(24) NOT NULL DEFAULT 'RECEIVED',
      received_at timestamptz NOT NULL DEFAULT now(),
      processed_at timestamptz
    );

    CREATE TABLE public.projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title varchar(160) NOT NULL CHECK(length(btrim(title)) > 0),
      description text NOT NULL DEFAULT '',
      status varchar(20) NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','ACTIVE','ON_HOLD','COMPLETED','CANCELLED')),
      start_date date,
      due_date date,
      created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK(start_date IS NULL OR due_date IS NULL OR due_date >= start_date)
    );
    CREATE TABLE public.project_phases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
      title varchar(160) NOT NULL CHECK(length(btrim(title)) > 0),
      position integer NOT NULL CHECK(position > 0),
      status varchar(20) NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','ACTIVE','COMPLETED')),
      start_date date,
      due_date date,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(project_id, position)
    );
    CREATE TABLE public.project_tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
      phase_id uuid NOT NULL REFERENCES public.project_phases(id) ON DELETE RESTRICT,
      title varchar(200) NOT NULL CHECK(length(btrim(title)) > 0),
      description text NOT NULL DEFAULT '',
      assignee_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
      priority varchar(12) NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW','MEDIUM','HIGH','URGENT')),
      status varchar(16) NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO','IN_PROGRESS','BLOCKED','DONE')),
      progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
      due_date date,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK((status='DONE' AND progress=100) OR status<>'DONE')
    );
    CREATE INDEX project_tasks_assignee_idx ON public.project_tasks(assignee_id, status);
    CREATE TABLE public.project_task_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE RESTRICT,
      actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
      event_type varchar(32) NOT NULL,
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX project_task_events_task_idx ON public.project_task_events(task_id, created_at DESC);

    ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.store_order_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.payment_notifications ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.project_task_events ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.store_orders, public.store_order_items, public.stock_reservations, public.payment_notifications,
      public.projects, public.project_phases, public.project_tasks, public.project_task_events FROM PUBLIC, anon, authenticated;
  `);
};

exports.down = () => { throw new Error('Migración irreversible: contiene pedidos, notificaciones y trazabilidad de proyectos.'); };
