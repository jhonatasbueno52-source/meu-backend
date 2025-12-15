import mongoose from 'mongoose';

const NFeQueueSchema = new mongoose.Schema({
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'MLOrder', required: true },
  processed: { type: Boolean, default: false },
  date_created: { type: Date, default: Date.now }
});

export default mongoose.model('NFeQueue', NFeQueueSchema);