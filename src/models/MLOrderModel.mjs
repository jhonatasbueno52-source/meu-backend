import mongoose from 'mongoose';

const MLOrderSchema = new mongoose.Schema({
  order_id: { type: String, required: true },
  buyer: {
    id: String,
    nickname: String,
    email: String
  },
  status: String,
  total_amount: Number,
  date_created: Date,
  items: [
    {
      id: String,
      title: String,
      quantity: Number,
      unit_price: Number
    }
  ],
  raw_data: Object, // guarda a resposta completa da API
  date_saved: { type: Date, default: Date.now }
});

const MLOrderModel = mongoose.model('MLOrder', MLOrderSchema);

export default MLOrderModel;