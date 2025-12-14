import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import mercadoLivreRoutes from './routes/mercadoLivreRoutes.js';
import shopeeRoutes from './routes/shopeeRoutes.js';
import nfeRoutes from './routes/nfeRoutes.js';
import automacaoRoutes from './routes/automacaoRoutes.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// rotas
app.use('/api/mercado-livre', mercadoLivreRoutes);
app.use('/api/shopee', shopeeRoutes);
app.use('/api/nfe', nfeRoutes);
app.use('/api/automacao', automacaoRoutes);

// ROTA DE TESTE – coloque aqui
app.get('/teste', (req, res) => {
  res.send('Backend online!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));