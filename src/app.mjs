/* ==============================
   IMPORTS
============================== */
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import axios from 'axios';
import FormData from 'form-data';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import archiver from 'archiver';

// Rotas externas
import mercadoLivreRoutes from './routes/mercadoLivreRoutes.mjs';

// Models
import MLTokenModel from './models/MLTokenModel.mjs';
import MLOrderModel from './models/MLOrderModel.mjs';
import ShopeeTokenModel from './models/ShopeeTokenModel.mjs';
import NFeQueueModel from './models/NFeQueueModel.mjs';

/* ==============================
   CONFIGURAÇÕES INICIAIS
============================== */
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

/* ==============================
   MIDDLEWARES
============================== */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ==============================
   MONGODB
============================== */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Atlas conectado!'))
  .catch(err => console.error('❌ Erro ao conectar MongoDB:', err));

/* ==============================
   UTILITÁRIOS NF-e
============================== */
function gerarXMLNFeML(order) {
  const itensXML = order.items.map((item, index) => `
    <det nItem="${index + 1}">
      <prod>
        <cProd>${item.id}</cProd>
        <xProd>${item.title}</xProd>
        <qCom>${item.quantity}</qCom>
        <vUnCom>${item.unit_price.toFixed(2)}</vUnCom>
        <vProd>${(item.quantity * item.unit_price).toFixed(2)}</vProd>
        <uCom>UN</uCom>
      </prod>
      <imposto>
        <vTotTrib>0</vTotTrib>
      </imposto>
    </det>
  `).join('');

  const totalPedido = order.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  return `
<nota>
  <cliente>
    <nome>${order.buyer.nickname || order.buyer.id}</nome>
    <email>${order.buyer.email}</email>
  </cliente>
  <itens>
    ${itensXML}
  </itens>
  <total>${totalPedido.toFixed(2)}</total>
</nota>
  `.trim();
}

function encryptCertificatePassword(password) {
  const cipher = crypto.createCipher('aes-256-cbc', process.env.CERT_SECRET_KEY);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decryptCertificatePassword(encrypted) {
  const decipher = crypto.createDecipher('aes-256-cbc', process.env.CERT_SECRET_KEY);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/* ==============================
   FUNÇÕES MERCADO LIVRE
============================== */
async function authenticateMercadoLivre(authCode) {
  try {
    const response = await axios.post('https://api.mercadolibre.com/oauth/token', null, {
      params: {
        grant_type: 'authorization_code',
        client_id: process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        code: authCode,
        redirect_uri: process.env.ML_REDIRECT_URI
      }
    });
    const { access_token, refresh_token, expires_in } = response.data;
    await MLTokenModel.create({ access_token, refresh_token, expires_in });
    console.log('✅ Token Mercado Livre salvo no MongoDB');
    return { access_token, refresh_token, expires_in };
  } catch (err) {
    console.error('❌ Erro ao autenticar ML:', err.response?.data || err.message);
    throw err;
  }
}

async function refreshMLToken() {
  try {
    const tokenDoc = await MLTokenModel.findOne().sort({ date_created: -1 });
    if (!tokenDoc) throw new Error('Nenhum token ML encontrado');
    const response = await axios.post('https://api.mercadolibre.com/oauth/token', null, {
      params: {
        grant_type: 'refresh_token',
        client_id: process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        refresh_token: tokenDoc.refresh_token
      }
    });
    const { access_token, refresh_token, expires_in } = response.data;
    await MLTokenModel.create({ access_token, refresh_token, expires_in });
    console.log('✅ Token ML renovado e salvo no MongoDB');
    return { access_token, refresh_token, expires_in };
  } catch (err) {
    console.error('❌ Erro ao renovar token ML:', err.response?.data || err.message);
    throw err;
  }
}

async function syncOrdersML() {
  try {
    const tokenDoc = await MLTokenModel.findOne().sort({ date_created: -1 });
    if (!tokenDoc) throw new Error('Nenhum token ML encontrado');
    const response = await axios.get('https://api.mercadolibre.com/orders/search/recent', {
      headers: { Authorization: `Bearer ${tokenDoc.access_token}` }
    });
    const orders = response.data.results || [];

    for (let order of orders) {
      const exists = await MLOrderModel.findOne({ order_id: order.id });
      if (!exists) {
        const newOrder = await MLOrderModel.create({
          order_id: order.id,
          buyer: { id: order.buyer.id, nickname: order.buyer.nickname, email: order.buyer.email },
          status: order.status,
          total_amount: order.total_amount,
          date_created: new Date(order.date_created),
          items: order.order_items.map(item => ({
            id: item.item.id,
            title: item.item.title,
            quantity: item.quantity,
            unit_price: item.unit_price
          })),
          raw_data: order
        });

        await NFeQueueModel.create({ order_id: newOrder._id, processed: false });
      }
    }

    console.log(`✅ ${orders.length} pedidos sincronizados`);
    return orders;
  } catch (err) {
    console.error('❌ Erro ao sincronizar pedidos ML:', err.response?.data || err.message);
    throw err;
  }
}

async function updateStockML(itemId, quantity) {
  try {
    const tokenDoc = await MLTokenModel.findOne().sort({ date_created: -1 });
    if (!tokenDoc) throw new Error('Nenhum token ML encontrado');
    const response = await axios.put(
      `https://api.mercadolibre.com/items/${itemId}/quantity`,
      { available: quantity },
      { headers: { Authorization: `Bearer ${tokenDoc.access_token}` } }
    );
    console.log(`✅ Estoque do item ${itemId} atualizado para ${quantity}`);
    return response.data;
  } catch (err) {
    console.error('❌ Erro ao atualizar estoque ML:', err.response?.data || err.message);
    throw err;
  }
}

async function sendTrackingCodeML(orderId, trackingNumber, carrier) {
  try {
    const tokenDoc = await MLTokenModel.findOne().sort({ date_created: -1 });
    if (!tokenDoc) throw new Error('Nenhum token ML encontrado');
    const response = await axios.post(
      `https://api.mercadolibre.com/orders/${orderId}/shipments`,
      { shipments: [{ shipment_type: 'custom', status: 'ready_to_ship', tracking_number: trackingNumber, carrier }] },
      { headers: { Authorization: `Bearer ${tokenDoc.access_token}` } }
    );
    console.log(`✅ Rastreio enviado para pedido ${orderId}`);
    return response.data;
  } catch (err) {
    console.error('❌ Erro ao enviar rastreio ML:', err.response?.data || err.message);
    throw err;
  }
}

/* ==============================
   FUNÇÕES SHOPEE (SIMULADAS)
============================== */
async function authenticateShopee(authCode) {
  const access_token = 'token_simulado_' + Date.now();
  const refresh_token = 'refresh_simulado_' + Date.now();
  const expires_in = 3600;
  await ShopeeTokenModel.create({ access_token, refresh_token, expires_in });
  console.log('✅ Token Shopee salvo no MongoDB');
  return { access_token, refresh_token, expires_in };
}

async function refreshShopeeToken() {
  const tokenDoc = await ShopeeTokenModel.findOne().sort({ date_created: -1 });
  if (!tokenDoc) throw new Error('Nenhum token Shopee encontrado');
  const access_token = 'token_renovado_' + Date.now();
  const refresh_token = 'refresh_renovado_' + Date.now();
  const expires_in = 3600;
  await ShopeeTokenModel.create({ access_token, refresh_token, expires_in });
  console.log('✅ Token Shopee renovado e salvo no MongoDB');
  return { access_token, refresh_token, expires_in };
}

async function syncOrdersShopee() {
  const orders = [
    {
      order_id: 'SP' + Date.now(),
      buyer: { id: 123, nickname: 'clienteSP', email: 'cliente@shopee.com' },
      status: 'paid',
      total_amount: 200,
      date_created: new Date(),
      items: [{ id: 'itemSP1', title: 'Produto Shopee 1', quantity: 1, unit_price: 200 }],
    },
  ];
  console.log(`✅ ${orders.length} pedidos Shopee sincronizados`);
  return orders;
}

async function updateStockShopee(itemId, quantity) {
  console.log(`✅ Estoque do item Shopee ${itemId} atualizado para ${quantity}`);
  return { itemId, quantity };
}

async function sendTrackingCodeShopee(orderId, trackingNumber, carrier) {
  console.log(`✅ Rastreio enviado para pedido Shopee ${orderId}`);
  return { orderId, trackingNumber, carrier };
}

/* ==============================
   FUNÇÕES NF-e (BLING) + ENVIO EMAIL
============================== */
async function emitirNFe(dadosNota) {
  try {
    if (!fs.existsSync('nfe_files')) fs.mkdirSync('nfe_files');

    const form = new FormData();
    form.append('xml', dadosNota.xml);

    const response = await axios.post(
      `https://bling.com.br/Api/v2/notasfiscais/xml/`,
      form,
      { headers: { 'apikey': process.env.NFE_API_KEY, ...form.getHeaders() } }
    );

    const nfe = response.data.retorno.notasfiscais[0].nota[0];
    console.log('✅ NF-e emitida no Bling', nfe.numero);

    const xmlPath = path.join('nfe_files', `NFe_${nfe.numero}.xml`);
    fs.writeFileSync(xmlPath, dadosNota.xml);

    const danfePath = path.join('nfe_files', `DANFE_${nfe.numero}.pdf`);
    fs.writeFileSync(danfePath, `DANFE do pedido ${dadosNota.order_id || 'desconhecido'}`);

    if (dadosNota.buyerEmail) await enviarEmailNF(dadosNota.buyerEmail, xmlPath, danfePath);

    return { status: 'emitida', id: nfe.numero, xmlPath, danfePath };
  } catch (err) {
    console.error('❌ Erro ao emitir NF-e:', err.response?.data || err.message);
    throw err;
  }
}

async function enviarEmailNF(email, xmlPath, danfePath) {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: email,
      subject: 'Sua NF-e',
      text: 'Segue em anexo sua nota fiscal.',
      attachments: [
        { filename: path.basename(xmlPath), path: xmlPath },
        { filename: path.basename(danfePath), path: danfePath }
      ]
    });

    console.log(`📧 NF-e enviada por email para ${email}`);
  } catch (err) {
    console.error(`❌ Erro ao enviar email para ${email}:`, err.message);
  }
}

/* ==============================
   FILA NF-e AUTOMÁTICA
============================== */
async function processNFeQueue() {
  const queue = await NFeQueueModel.find({ processed: false }).limit(5);
  for (let item of queue) {
    try {
      const order = await MLOrderModel.findById(item.order_id);
      if (!order) continue;
      const xml = gerarXMLNFeML(order);
      const nfe = await emitirNFe({ xml, order_id: order.order_id, buyerEmail: order.buyer.email });
      order.nfe = nfe;
      await order.save();
      item.processed = true;
      await item.save();
      console.log(`✅ NF-e processada e enviada para pedido ${order.order_id}`);
    } catch (err) {
      console.error(`⚠️ Falha ao processar NF-e para fila ${item._id}:`, err.message);
    }
  }
}

/* ==============================
   ROTAS
============================== */
app.get('/', (req, res) => res.send('API Base44 online!'));
app.get('/teste', (req, res) => res.json({ message: 'Backend funcionando!' }));

app.use('/api/mercado-livre', mercadoLivreRoutes);

app.get('/download-nfe/:numero', async (req, res) => {
  const numero = req.params.numero;
  const xmlPath = path.join('nfe_files', `NFe_${numero}.xml`);
  const danfePath = path.join('nfe_files', `DANFE_${numero}.pdf`);

  if (!fs.existsSync(xmlPath) || !fs.existsSync(danfePath)) {
    return res.status(404).json({ error: 'Arquivos não encontrados' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename=NFe_${numero}.zip`);

  const archive = archiver('zip');
  archive.pipe(res);
  archive.file(xmlPath, { name: `NFe_${numero}.xml` });
  archive.file(danfePath, { name: `DANFE_${numero}.pdf` });
  archive.finalize();
});

/* ==============================
   AUTOMATIZAÇÃO
============================== */
setInterval(async () => {
  try { await syncOrdersML(); console.log('🕒 Pedidos ML sincronizados automaticamente'); }
  catch (err) { console.error('❌ Erro na sincronização automática ML:', err.message); }
}, 300000);

setInterval(async () => {
  try { await processNFeQueue(); console.log('🕒 Fila de NF-e processada'); }
  catch (err) { console.error('❌ Erro ao processar fila NF-e:', err.message); }
}, 600000);

/* ==============================
   SERVER
============================== */
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
