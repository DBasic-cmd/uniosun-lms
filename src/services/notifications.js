const Notification = require('../models/Notification');
const User = require('../models/User');
const ForumComment = require('../models/ForumComment');

const PREVIEW_LENGTH = 140;

function preview(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > PREVIEW_LENGTH ? `${clean.slice(0, PREVIEW_LENGTH - 1)}…` : clean;
}

function uniqueIds(ids, excludeId) {
  const exclude = String(excludeId);
  return [...new Set(ids.map(String))].filter((id) => id && id !== exclude);
}

// People in a course. Courses store the lecturer by name, so lecturers are
// matched on that name; students by enrollment.
async function courseMemberIds(course, { students = false, lecturer = false } = {}) {
  const filters = [];
  if (students) filters.push({ role: 'student', enrolledCourses: course._id });
  if (lecturer && course.lecturer) filters.push({ role: 'lecturer', name: course.lecturer });
  if (!filters.length) return [];
  const members = await User.find({ $or: filters, status: { $ne: 'suspended' } }).select('_id');
  return members.map((member) => member._id);
}

// Who hears about a new post, by its type.
const AUDIENCE_BY_POST_TYPE = {
  question: { lecturer: true },                     // the lecturer answers questions
  general: { students: true },                      // the whole class
  announcement: { students: true, lecturer: true }, // everyone in the course
};

async function createFor(recipientIds, payload) {
  if (!recipientIds.length) return;
  await Notification.insertMany(recipientIds.map((recipient) => ({ ...payload, recipient })));
}

// A new discussion post notifies its audience (see AUDIENCE_BY_POST_TYPE).
async function notifyNewPost({ post, course, author }) {
  const audience = AUDIENCE_BY_POST_TYPE[post.postType] || AUDIENCE_BY_POST_TYPE.general;
  const recipients = uniqueIds(await courseMemberIds(course, audience), author._id);
  const isAnnouncement = post.postType === 'announcement';
  const kind = isAnnouncement ? 'announcement' : post.postType === 'question' ? 'question' : 'discussion';
  await createFor(recipients, {
    type: isAnnouncement ? 'announcement' : 'discussion',
    title: `${author.name} posted a new ${kind} in ${course.courseCode}: "${preview(post.title)}"`,
    message: preview(post.content),
    course: course._id,
    post: post._id,
    actor: author._id,
  });
}

// A reply notifies the post's author and everyone who already replied.
async function notifyReply({ post, comment, course, author }) {
  const earlierRepliers = await ForumComment.find({ post: post._id }).distinct('author');
  const recipients = uniqueIds([post.author, ...earlierRepliers], author._id);
  await createFor(recipients, {
    type: 'reply',
    title: `${author.name} replied to "${preview(post.title)}" in ${course?.courseCode || 'your course'}`,
    message: preview(comment.content),
    course: post.course,
    post: post._id,
    actor: author._id,
  });
}

// Notifications must never break the action that triggered them.
function safely(task) {
  return task().catch((error) => console.error('Could not create notifications:', error));
}

module.exports = { notifyNewPost, notifyReply, safely, AUDIENCE_BY_POST_TYPE };
