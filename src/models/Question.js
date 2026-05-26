const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  test: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  questionText: { type: String, required: true, trim: true },
  // For multiple-choice, we store options. For theory, this can be empty.
  options: [{ type: String, trim: true }], 
  // Stores the index of the correct option (e.g., 0 for option A, 1 for B) or string answer
  correctAnswer: { type: String, required: true } 
}, { timestamps: true });

module.exports = mongoose.models.Question || mongoose.model('Question', questionSchema);