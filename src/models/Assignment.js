const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  dueDate: { type: Date, required: true },
  attachmentUrl: { type: String }, // Optional attachment uploaded by lecturer
  isGroupAssignment: { type: Boolean, default: false },
  groupMethod: { type: String, enum: ['student_choose', 'system_auto', 'matric_last_digit'], default: 'student_choose' },
  groupSize: { type: Number, default: 4 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

module.exports = mongoose.models.Assignment || mongoose.model('Assignment', assignmentSchema);
