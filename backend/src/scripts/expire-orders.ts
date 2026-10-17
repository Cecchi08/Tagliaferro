import { expireSafeOrders } from '../modules/commerce/commerce.service.js';
try { const result=await expireSafeOrders(); console.log(`Pedidos revisados: ${result.checked}; reservas liberadas: ${result.released}.`); process.exitCode=0; }
catch { console.error('No se pudieron expirar pedidos con seguridad. Las reservas quedan intactas para conciliación.'); process.exitCode=1; }
