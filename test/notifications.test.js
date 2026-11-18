const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const mongoose = require('mongoose');

const Notification = require('../src/models/Notification');
const User = require('../src/models/User');
const ForumComment = require('../src/models/ForumComment');
const { notifyNewPost, notifyReply } = require('../src/services/notifications');

const id = () => new mongoose.Types.ObjectId();
let inserted;
let userQuery;

beforeEach(() => {
  inserted = [];
  Notification.insertMany = async (docs) => { inserted.push(...docs); return docs; };
});

function stubCourseMembers(members) {
  User.find = (query) => {
    userQuery = query;
    return { select: async () => members.map((_id) => ({ _id })) };
  };
}

function stubRepliers(authorIds) {
  ForumComment.find = () => ({ distinct: async () => authorIds });
}

const course = { _id: id(), courseCode: 'BIO101', lecturer: 'Dr. Ade' };
const studentsFilter = { role: 'student', enrolledCourses: course._id };
const lecturerFilter = { role: 'lecturer', name: 'Dr. Ade' };

async function postOfType(postType, author = { _id: id(), name: 'Ada' }) {
  await notifyNewPost({
    post: { _id: id(), title: 'Mitosis?', content: 'How many phases?', postType },
    course,
    author,
  });
}

test('a question notifies only the course lecturer', async () => {
  stubCourseMembers([id()]);
  await postOfType('question');
  assert.deepEqual(userQuery.$or, [lecturerFilter]);
  assert.equal(inserted[0].type, 'discussion');
  assert.match(inserted[0].title, /Ada posted a new question in BIO101/);
});

test('a general post notifies the students in the course', async () => {
  stubCourseMembers([id()]);
  await postOfType('general');
  assert.deepEqual(userQuery.$or, [studentsFilter]);
  assert.match(inserted[0].title, /posted a new discussion/);
});

test('an announcement notifies everyone in the course', async () => {
  stubCourseMembers([id()]);
  await postOfType('announcement', { _id: id(), name: 'Dr. Ade' });
  assert.deepEqual(userQuery.$or, [studentsFilter, lecturerFilter]);
  assert.equal(inserted[0].type, 'announcement');
});

test('the person who posts is never notified about their own post', async () => {
  const author = { _id: id(), name: 'Ada' };
  const classmate = id();
  stubCourseMembers([author._id, classmate]);
  await postOfType('general', author);
  assert.deepEqual(inserted.map((n) => String(n.recipient)), [String(classmate)]);
});

test('a reply notifies the post author and earlier repliers once each, not the replier', async () => {
  const postAuthor = id();
  const earlier = id();
  const replier = { _id: id(), name: 'Bola' };
  stubRepliers([earlier, replier._id, earlier, postAuthor]);

  await notifyReply({
    post: { _id: id(), author: postAuthor, title: 'Mitosis?', course: id() },
    comment: { content: 'Four phases.' },
    course: { courseCode: 'BIO101' },
    author: replier,
  });

  assert.deepEqual(inserted.map((n) => String(n.recipient)).sort(), [String(postAuthor), String(earlier)].sort());
  assert.equal(inserted[0].type, 'reply');
  assert.match(inserted[0].title, /Bola replied to "Mitosis\?" in BIO101/);
});

test('replying to your own post with no other repliers notifies nobody', async () => {
  const me = { _id: id(), name: 'Ada' };
  stubRepliers([me._id]);
  await notifyReply({
    post: { _id: id(), author: me._id, title: 'Note', course: id() },
    comment: { content: 'Update' },
    course: { courseCode: 'BIO101' },
    author: me,
  });
  assert.equal(inserted.length, 0);
});
