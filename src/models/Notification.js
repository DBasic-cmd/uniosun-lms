const mongoose = require('mongoose');
const { tenantScopePlugin } = require('./tenantContext');

// One row per recipient, so each person's read state is stored on the server.
const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['discussion', 'reply', 'announcement'], required: true },
  title: { type: String, required: true, trim: true },
  message: { type: String, trim: true, default: '' },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'ForumPost' },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  read: { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ recipient: 1, createdAt: -1 });
tenantScopePlugin(notificationSchema);

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
