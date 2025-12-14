import express from 'express';
import {
  authenticateShopee,
  refreshShopeeToken,
  syncOrdersShopee,
  updateStockShopee,
  sendTrackingCodeShopee
} from '../controllers/shopeeController.js';

const router = express.Router();

router.post('/authenticate', authenticateShopee);
router.post('/refresh-token', refreshShopeeToken);
router.get('/sync-orders', syncOrdersShopee);
router.post('/update-stock', updateStockShopee);
router.post('/send-tracking', sendTrackingCodeShopee);

export default router;