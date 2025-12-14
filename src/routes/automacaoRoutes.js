import express from 'express';
import { scheduledSyncOrders, processNFeQueue } from '../controllers/automacaoController.js';

const router = express.Router();

router.get('/sync-orders', scheduledSyncOrders);
router.get('/process-nfe', processNFeQueue);

export default router;