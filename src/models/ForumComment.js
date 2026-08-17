const mongoose = require('mongoose');

const forumCommentSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'ForumPost', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true }
}, { timestamps: true });

module.exports = mongoose.models.ForumComment || mongoose.model('ForumComment', forumCommentSchema);
