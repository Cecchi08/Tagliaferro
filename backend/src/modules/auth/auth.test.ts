import { describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { canAccessRole } from './policies.js';
import { AppError } from '../../common/errors.js';

describe('lógica pura de autenticación y permisos', () => {
  it('limita la administración de cuentas al rol ADMIN', () => {
    expect(canAccessRole('ADMIN','ADMIN')).toBe(true);
    expect(canAccessRole('EMPLOYEE','ADMIN')).toBe(false);
    expect(canAccessRole('CUSTOMER','ADMIN')).toBe(false);
    expect(canAccessRole(undefined,'ADMIN')).toBe(false);
  });

  it('permite operaciones de inventario compartidas solo a ADMIN y EMPLOYEE', () => {
    expect(canAccessRole('ADMIN','ADMIN','EMPLOYEE')).toBe(true);
    expect(canAccessRole('EMPLOYEE','ADMIN','EMPLOYEE')).toBe(true);
    expect(canAccessRole('CUSTOMER','ADMIN','EMPLOYEE')).toBe(false);
  });

  it('genera y verifica hashes Argon2id sin depender de una base de datos', async () => {
    const password = 'unit-only-password-123';
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(argon2.verify(hash,password)).resolves.toBe(true);
    await expect(argon2.verify(hash,'wrong-password')).resolves.toBe(false);
  });

  it('mantiene códigos HTTP concretos para errores de dominio', () => {
    expect(new AppError(409,'STOCK_INSUFFICIENT','stock').status).toBe(409);
    expect(new AppError(403,'FORBIDDEN','permiso').code).toBe('FORBIDDEN');
  });
});
