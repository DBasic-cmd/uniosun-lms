const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Used for individual assignments
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },     // Used for group assignments
  fileUrl: { type: String, required: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Submitting individual user
  score: { type: Number },
  feedback: { type: String },
  submittedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.models.AssignmentSubmission || mongoose.model('AssignmentSubmission', submissionSchema);
