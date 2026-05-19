const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  courseCode: { type: String, required: true, unique: true, uppercase: true },
  title: { type: String, required: true },
  department: { type: String, required: true }, // e.g., "Computer Science"
  materials: [{
    title: String,
    s3Key: String,
    uploadedAt: { type: Date, default: Date.now }
  }]
});

module.exports = mongoose.models.Course || mongoose.model('Course', courseSchema);