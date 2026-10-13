exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });
  pgm.createType('user_role', ['ADMIN', 'EMPLOYEE', 'CUSTOMER']);
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'varchar(100)', notNull: true },
    email: { type: 'varchar(254)', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    role: { type: 'user_role', notNull: true, default: 'CUSTOMER' },
    active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('sessions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    token_hash: { type: 'char(64)', notNull: true, unique: true },
    csrf_token: { type: 'varchar(64)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
    revoked_at: { type: 'timestamptz' },
  });
  pgm.createIndex('sessions', 'user_id');
  pgm.createIndex('sessions', 'expires_at');
  pgm.sql(`ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.users, public.sessions FROM PUBLIC, anon, authenticated;
    ALTER TABLE IF EXISTS public.pgmigrations ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.pgmigrations FROM PUBLIC, anon, authenticated;`);
};

exports.down = () => { throw new Error('La migración de identidad es irreversible para evitar borrar usuarios y sesiones.'); };
