import mongoose from 'mongoose';

const TokenSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

const Token = mongoose.model('Token', TokenSchema);

export default Token;