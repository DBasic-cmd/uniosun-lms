const mongoose = require('mongoose');
const { tenantScopePlugin } = require('./tenantContext');

// A department belongs to one faculty. Users and courses store the department
// by name, so names are unique across the whole institution.
const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty', required: true },
}, { timestamps: true });

tenantScopePlugin(departmentSchema);
departmentSchema.index({ institutionId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.models.Department || mongoose.model('Department', departmentSchema);
