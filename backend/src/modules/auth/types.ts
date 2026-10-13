export type Role = 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER';
export interface AuthUser { id: string; name: string; email: string; role: Role; active: boolean }
declare global {
  namespace Express { interface Request { auth?: AuthUser; csrfToken?: string } }
}
