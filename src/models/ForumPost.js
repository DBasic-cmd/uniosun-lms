const mongoose = require('mongoose');

const forumPostSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true, trim: true },
  postType: { type: String, enum: ['question', 'announcement', 'general'], default: 'general', required: true },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array of user IDs who liked the post
  isAnswered: { type: Boolean, default: false },
  officialAnswer: { type: mongoose.Schema.Types.ObjectId, ref: 'ForumComment', default: null }, // Pinned lecturer comment
  repliesCount: { type: Number, default: 0 },
  targetType: { type: String, enum: ['course', 'student', 'group'], default: 'course' },
  targetLabel: { type: String, default: 'Entire Course' }
}, { timestamps: true });

module.exports = mongoose.models.ForumPost || mongoose.model('ForumPost', forumPostSchema);
