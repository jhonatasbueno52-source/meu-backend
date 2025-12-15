import mongoose from 'mongoose';

const BlingCredentialsSchema = new mongoose.Schema({
  userId: { type: String, required: true },       // ID do cliente no seu sistema
  apiKey: { type: String, required: true },       // API Key do Bling
  environment: { type: String, default: 'prod' }, // 'prod' ou 'homolog'
  date_created: { type: Date, default: Date.now }
});

export default mongoose.model('BlingCredentials', BlingCredentialsSchema);