import mongoose from 'mongoose';

const MLTokenSchema = new mongoose.Schema({
  access_token: { type: String, required: true },
  refresh_token: { type: String, required: true },
  expires_in: { type: Number, required: true },
  date_created: { type: Date, default: Date.now }
});

const MLTokenModel = mongoose.model('MLToken', MLTokenSchema);

export default MLTokenModel;