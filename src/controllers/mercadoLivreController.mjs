import axios from 'axios';
import crypto from 'crypto';
import base64url from 'base64url';

// Variável global temporária para PKCE (em produção, salve por usuário/sessão)
let codeVerifierGlobal = '';

// Gera code_verifier aleatório
function generateCodeVerifier() {
  const codeVerifier = base64url(crypto.randomBytes(32));
  codeVerifierGlobal = codeVerifier; // armazenar temporariamente
  return codeVerifier;
}

// Gera code_challenge correspondente
function generateCodeChallenge(codeVerifier) {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return base64url(hash);
}

// Redireciona para Mercado Livre OAuth
export const loginMercadoLivre = (req, res) => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const authUrl = `https://auth.mercadolibre.com.br/authorization?response_type=code&client_id=${process.env.ML_CLIENT_ID}&redirect_uri=${process.env.ML_REDIRECT_URI}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  
  res.redirect(authUrl);
};

// Callback do Mercado Livre
export const authenticateMercadoLivreCallback = async (req, res) => {
  const { code } = req.query;

  if (!code) return res.status(400).json({ error: 'Código de autorização não encontrado' });

  try {
    const response = await axios.post('https://api.mercadolibre.com/oauth/token', {
      grant_type: 'authorization_code',
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      code,
      redirect_uri: process.env.ML_REDIRECT_URI,
      code_verifier: codeVerifierGlobal
    });

    // Retorna tokens para teste (em produção, armazene de forma segura)
    res.json(response.data);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: 'Falha ao autenticar com Mercado Livre', details: error.response?.data || error.message });
  }
};

// Placeholder para demais rotas
export const refreshMLToken = async (req, res) => res.send('Refresh Token OK');
export const syncOrdersML = async (req, res) => res.send('Sync Orders OK');
export const updateStockML = async (req, res) => res.send('Update Stock OK');
export const sendTrackingCodeML = async (req, res) => res.send('Send Tracking Code OK');