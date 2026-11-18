const mongoose = require('mongoose');
const { tenantScopePlugin } = require('./tenantContext');

const broadcastSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  targetAudience: {
    type: String,
    enum: ['all', 'student', 'lecturer'],
    default: 'all'
  },
  // Users who have read this broadcast.
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

tenantScopePlugin(broadcastSchema);

module.exports = mongoose.models.Broadcast || mongoose.model('Broadcast', broadcastSchema);
