import type { Role } from './types.js';

export const canAccessRole = (actual: Role | undefined, ...allowed: Role[]) => actual !== undefined && allowed.includes(actual);
