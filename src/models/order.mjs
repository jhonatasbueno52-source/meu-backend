import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true // 🔐 impede duplicados
  },

  status: String,

  totalAmount: Number,

  buyer: {
    id: String,
    nickname: String
  },

  items: [
    {
      itemId: String,
      title: String,
      quantity: Number,
      unitPrice: Number
    }
  ],

  createdAtML: Date
}, {
  timestamps: true // createdAt / updatedAt do Mongo
});

export default mongoose.model('Order', OrderSchema);