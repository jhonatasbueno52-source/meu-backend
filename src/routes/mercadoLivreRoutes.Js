import express from 'express';
import {
  authenticateMercadoLivre,
  refreshMLToken,
  syncOrdersML,
  updateStockML,
  sendTrackingCodeML
} from '../controllers/mercadoLivreController.js';

const router = express.Router();

router.post('/authenticate', authenticateMercadoLivre);
router.post('/refresh-token', refreshMLToken);
router.get('/sync-orders', syncOrdersML);
router.post('/update-stock', updateStockML);
router.post('/send-tracking', sendTrackingCodeML);

export default router;