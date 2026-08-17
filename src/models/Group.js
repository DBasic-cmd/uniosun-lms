const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  leader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  code: { type: String, required: true, unique: true, uppercase: true, trim: true } // 6 alphanumeric characters
}, { timestamps: true });

module.exports = mongoose.models.Group || mongoose.model('Group', groupSchema);
