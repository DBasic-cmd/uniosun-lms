const mongoose = require('mongoose');
const { tenantScopePlugin } = require('./tenantContext');

const forumCommentSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'ForumPost', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true }
}, { timestamps: true });

tenantScopePlugin(forumCommentSchema);

module.exports = mongoose.models.ForumComment || mongoose.model('ForumComment', forumCommentSchema);
