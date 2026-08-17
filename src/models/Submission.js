const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  test: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  answers: [
    {
      question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
      selectedAnswer: { type: String, required: true }
    }
  ],
  score: { type: Number, required: true },
  totalPossibleScore: { type: Number, required: true },
  submittedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Prevent double submission for the same test by the same student
submissionSchema.index({ student: 1, test: 1 }, { unique: true });

module.exports = mongoose.models.Submission || mongoose.model('Submission', submissionSchema);
