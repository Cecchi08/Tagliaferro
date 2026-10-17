import { Router } from 'express';
import { z } from 'zod';
import { asyncRoute, AppError } from '../../common/errors.js';
import { requireRole } from '../auth/auth.middleware.js';
import * as service from './commerce.service.js';

export const commerceRouter=Router();
commerceRouter.post('/store/orders',requireRole('CUSTOMER'),asyncRoute(async(req,res)=>{
 const input=z.object({idempotencyKey:z.uuid(),items:z.array(z.object({variantId:z.uuid(),quantity:z.number().int().min(1).max(1000000)})).min(1).max(50)}).parse(req.body);
 res.status(201).json({order:await service.createOrder(req.auth!.id,input.idempotencyKey,input.items)});
}));
commerceRouter.get('/store/orders',requireRole('CUSTOMER'),asyncRoute(async(req,res)=>res.json({orders:await service.listOrders(req.auth!.id)})));
commerceRouter.get('/store/orders/:id',requireRole('CUSTOMER'),asyncRoute(async(req,res)=>{const id=z.uuid().safeParse(req.params.id);if(!id.success)throw new AppError(400,'INVALID_ID','Identificador inválido.');res.json({order:await service.getOrder(id.data,req.auth!.id)});}));
commerceRouter.post('/store/orders/:id/cancel',requireRole('CUSTOMER'),asyncRoute(async(req,res)=>{const id=z.uuid().safeParse(req.params.id);if(!id.success)throw new AppError(400,'INVALID_ID','Identificador inválido.');await service.cancelOrder(id.data,req.auth!.id);res.status(204).end();}));

commerceRouter.post('/payments/mercadopago/webhook',asyncRoute(async(req,res)=>{
 const query=z.object({'data.id':z.string().min(1),'type':z.string().optional(),id:z.string().optional()}).safeParse(req.query);
 const signature=req.get('x-signature'); const requestId=req.get('x-request-id');
 if(!query.success||!service.validMpSignature(signature,requestId,query.data['data.id'])) throw new AppError(401,'INVALID_WEBHOOK_SIGNATURE','Firma de notificación inválida.');
 const eventId=String((req.body as {id?:unknown})?.id ?? `${query.data.type ?? 'payment'}:${query.data['data.id']}`);
 await service.processMpWebhook(eventId,query.data['data.id']);res.status(200).json({received:true});
}));
