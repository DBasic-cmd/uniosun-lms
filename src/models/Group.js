const mongoose = require('mongoose');
const { tenantScopePlugin } = require('./tenantContext');

const groupSchema = new mongoose.Schema({
  assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  leader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  code: { type: String, required: true, uppercase: true, trim: true } // 6 alphanumeric characters
}, { timestamps: true });

groupSchema.index({ institutionId: 1, code: 1 }, { unique: true });
tenantScopePlugin(groupSchema);

module.exports = mongoose.models.Group || mongoose.model('Group', groupSchema);
