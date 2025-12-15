import express from 'express';
import {
  authenticateMercadoLivre,
  refreshMLToken,
  syncOrdersML,
  updateStockML,
  sendTrackingCodeML
} from '../controllers/mercadoLivreController.mjs';

const router = express.Router();

// Rotas principais
router.post('/authenticate', authenticateMercadoLivre);
router.post('/refresh-token', refreshMLToken);
router.get('/sync-orders', syncOrdersML);
router.post('/update-stock', updateStockML);
router.post('/send-tracking', sendTrackingCodeML);

// Rota de teste
router.get('/teste', (req, res) => {
  res.send('Rota Mercado Livre online!');
});

// Rota de login (redireciona para Mercado Livre)
router.get('/login', (req, res) => {
  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${process.env.ML_CLIENT_ID}&redirect_uri=${process.env.ML_REDIRECT_URI}`;
  res.redirect(authUrl);
});

export default router;