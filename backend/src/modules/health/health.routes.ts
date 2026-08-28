import { Router } from 'express';
import { getLiveness, getReadiness } from './health.controller.js';

/**
 * Health routes. Mounted at root (`app.use('/', healthRouter)`) per task
 * spec — load balancers and k8s probes expect `/healthz` and `/ready` at
 * the root path, not under `/api/v1`.
 *
 * No auth, no rate limiting, no logging middleware — probes are called
 * every few seconds by infrastructure and must be cheap and never block.
 */
export const healthRouter = Router();

healthRouter.get('/healthz', getLiveness);
healthRouter.get('/ready', getReadiness);
