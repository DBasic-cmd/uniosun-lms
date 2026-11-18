const mongoose = require('mongoose');

const institutionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[a-z0-9-]+$/,
  },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.models.Institution ||
  mongoose.model('Institution', institutionSchema);
