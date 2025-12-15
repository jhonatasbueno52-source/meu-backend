import mongoose from 'mongoose';

const ShopeeTokenSchema = new mongoose.Schema({
  access_token: String,
  refresh_token: String,
  expires_in: Number,
  date_created: { type: Date, default: Date.now }
});

export default mongoose.model('ShopeeToken', ShopeeTokenSchema);