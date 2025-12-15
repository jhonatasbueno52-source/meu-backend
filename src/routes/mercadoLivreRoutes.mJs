import express from 'express';
import axios from 'axios';
import Token from '../models/Token.mjs';
import Order from '../models/order.mjs';

const router = express.Router();

/* =====================================================
   LOGIN MERCADO LIVRE (OAuth)
===================================================== */
router.get('/login', (req, res) => {
  const authUrl =
    `https://auth.mercadolivre.com.br/authorization` +
    `?response_type=code` +
    `&client_id=${process.env.ML_CLIENT_ID}` +
    `&redirect_uri=${process.env.ML_REDIRECT_URI}`;

  res.redirect(authUrl);
});

/* =====================================================
   CALLBACK MERCADO LIVRE
===================================================== */
router.get('/authenticate/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Código de autorização não fornecido');
  }

  try {
    const response = await axios.post(
      'https://api.mercadolibre.com/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        code,
        redirect_uri: process.env.ML_REDIRECT_URI
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in, user_id } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    await Token.findOneAndUpdate(
      { userId: user_id },
      {
        userId: user_id,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt
      },
      { upsert: true }
    );

    res.json({
      message: 'Tokens recebidos e salvos com sucesso!',
      userId: user_id
    });

  } catch (error) {
    console.error('Erro OAuth:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao trocar código por token' });
  }
});

/* =====================================================
   REFRESH TOKEN
===================================================== */
router.post('/refresh-token', async (req, res) => {
  try {
    const tokenData = await Token.findOne();

    if (!tokenData) {
      return res.status(400).json({ error: 'Nenhum token encontrado' });
    }

    const response = await axios.post(
      'https://api.mercadolibre.com/oauth/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        refresh_token: tokenData.refreshToken
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    tokenData.accessToken = access_token;
    tokenData.refreshToken = refresh_token;
    tokenData.expiresAt = expiresAt;
    await tokenData.save();

    res.json({
      message: 'Token renovado com sucesso',
      expiresAt
    });

  } catch (error) {
    console.error('Erro refresh token:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao renovar token' });
  }
});

/* =====================================================
   BUSCAR PEDIDOS DO MERCADO LIVRE
   ✔ Salva no Mongo
   ✔ Evita duplicados
===================================================== */
router.get('/orders', async (req, res) => {
  try {
    const tokenData = await Token.findOne();

    if (!tokenData) {
      return res.status(400).json({ error: 'Token não encontrado' });
    }

    const response = await axios.get(
      `https://api.mercadolibre.com/orders/search?seller=${tokenData.userId}`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.accessToken}`
        }
      }
    );

    const orders = response.data.results || [];
    let novosSalvos = 0;

    for (const order of orders) {
      const exists = await Order.findOne({ orderId: order.id });

      if (exists) continue; // 🚫 evita duplicar

      await Order.create({
        orderId: order.id,
        status: order.status,
        totalAmount: order.total_amount,
        buyerId: order.buyer?.id,
        rawData: order
      });

      novosSalvos++;
    }

    res.json({
      message: 'Pedidos sincronizados com sucesso',
      totalRecebidos: orders.length,
      novosSalvos
    });

  } catch (error) {
    console.error('Erro ao buscar pedidos:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
});

/* =====================================================
   ATUALIZAR ESTOQUE NO MERCADO LIVRE
===================================================== */
router.post('/update-stock', async (req, res) => {
  try {
    const { itemId, quantity } = req.body;

    // Validação
    if (!itemId || quantity === undefined) {
      return res.status(400).json({
        error: 'itemId e quantity são obrigatórios'
      });
    }

    // Buscar token salvo
    const tokenData = await Token.findOne();

    if (!tokenData) {
      return res.status(400).json({
        error: 'Token do Mercado Livre não encontrado'
      });
    }

    // Chamada API Mercado Livre
    await axios.put(
      `https://api.mercadolibre.com/items/${itemId}`,
      {
        available_quantity: quantity
      },
      {
        headers: {
          Authorization: `Bearer ${tokenData.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      message: 'Estoque atualizado com sucesso',
      itemId,
      quantity
    });

  } catch (error) {
    console.error(
      'Erro ao atualizar estoque:',
      error.response?.data || error.message
    );

    res.status(500).json({
      error: 'Erro ao atualizar estoque no Mercado Livre'
    });
  }
});

/* =====================================================
   ENVIAR CÓDIGO DE RASTREIO (MERCADO LIVRE)
===================================================== */
router.post('/send-tracking', async (req, res) => {
  try {
    const { shipmentId, trackingNumber, carrier } = req.body;

    // Validação básica
    if (!shipmentId || !trackingNumber) {
      return res.status(400).json({
        error: 'shipmentId e trackingNumber são obrigatórios'
      });
    }

    // Busca token salvo
    const tokenData = await Token.findOne();

    if (!tokenData) {
      return res.status(400).json({ error: 'Token não encontrado' });
    }

    // Envia rastreio para o Mercado Livre
    const response = await axios.put(
      `https://api.mercadolibre.com/shipments/${shipmentId}`,
      {
        tracking_number: trackingNumber,
        tracking_method: carrier || 'Correios'
      },
      {
        headers: {
          Authorization: `Bearer ${tokenData.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      message: 'Código de rastreio enviado com sucesso',
      shipmentId,
      response: response.data
    });

  } catch (error) {
    console.error(
      'Erro ao enviar rastreio:',
      error.response?.data || error.message
    );

    res.status(500).json({
      error: 'Erro ao enviar código de rastreio'
    });
  }
});

export default router;