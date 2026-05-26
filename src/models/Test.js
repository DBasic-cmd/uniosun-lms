const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  lecturer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  testTitle: { type: String, required: true, trim: true },
  testType: { type: String, enum: ['multiple-choice', 'theory'], required: true },
  date: { type: Date, required: true },
  startTime: { type: String, required: true }, // e.g., "09:00 AM"
  endTime: { type: String, required: true },   // e.g., "10:00 AM"
  numberOfQuestions: { type: Number, required: true }, // Max questions to display/require
  marksPerQuestion: { type: Number, required: true, default: 1 },
  instructions: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.models.Test || mongoose.model('Test', testSchema);