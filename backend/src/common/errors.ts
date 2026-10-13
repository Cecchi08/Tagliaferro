export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function asyncRoute(fn: (req: import('express').Request, res: import('express').Response) => Promise<unknown>) {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

export function errorHandler(error: unknown, _req: import('express').Request, res: import('express').Response, _next: import('express').NextFunction) {
  if (error instanceof AppError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
  if (error && typeof error === 'object' && 'status' in error && error.status === 400) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'La solicitud no es válida.' } });
  if (error && typeof error === 'object' && 'issues' in error) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Revisá los datos ingresados.' } });
  console.error('Error interno de solicitud.');
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error interno.' } });
}
