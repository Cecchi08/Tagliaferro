import { describe, expect, it } from 'vitest';
import { canAccessRole } from '../auth/policies.js';

describe('matriz de acceso del inventario', () => {
  it('reserva lectura interna y entradas a ADMIN y EMPLOYEE', () => {
    expect(canAccessRole('ADMIN','ADMIN','EMPLOYEE')).toBe(true);
    expect(canAccessRole('EMPLOYEE','ADMIN','EMPLOYEE')).toBe(true);
    expect(canAccessRole('CUSTOMER','ADMIN','EMPLOYEE')).toBe(false);
  });

  it('reserva catálogo administrativo, ajustes y movimientos a ADMIN', () => {
    expect(canAccessRole('ADMIN','ADMIN')).toBe(true);
    expect(canAccessRole('EMPLOYEE','ADMIN')).toBe(false);
    expect(canAccessRole('CUSTOMER','ADMIN')).toBe(false);
  });
});
