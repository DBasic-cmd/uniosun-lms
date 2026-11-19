const mongoose = require('mongoose');
const { tenantScopePlugin } = require('./tenantContext');

// A faculty (e.g. "Faculty of Science") inside one institution.
const facultySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
}, { timestamps: true });

tenantScopePlugin(facultySchema);
facultySchema.index({ institutionId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.models.Faculty || mongoose.model('Faculty', facultySchema);
