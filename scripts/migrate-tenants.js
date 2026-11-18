require('dotenv').config();
const mongoose = require('mongoose');
const Institution = require('../src/models/Institution');
const User = require('../src/models/User');
const Course = require('../src/models/Course');
const Event = require('../src/models/Event');
const Test = require('../src/models/Test');
const Assignment = require('../src/models/Assignment');
const AssignmentSubmission = require('../src/models/AssignmentSubmission');
const Submission = require('../src/models/Submission');
const Group = require('../src/models/Group');
const Question = require('../src/models/Question');
const ForumPost = require('../src/models/ForumPost');
const ForumComment = require('../src/models/ForumComment');
const Broadcast = require('../src/models/Broadcast');

async function dropLegacyIndex(collection, name) {
  try {
    const indexes = await collection.indexes();
    if (indexes.some((index) => index.name === name)) {
      await collection.dropIndex(name);
    }
  } catch (error) {
    if (error.codeName !== 'NamespaceNotFound') {
      throw error;
    }
  }
}

async function migrate() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required.');
  }

  await mongoose.connect(process.env.MONGO_URI);
  const institution = await Institution.findOneAndUpdate(
    { code: 'uniosun' },
    { $setOnInsert: { name: 'Osun State University', code: 'uniosun', status: 'active' } },
    { upsert: true, returnDocument: 'after' },
  );
  const models = [
    User,
    Course,
    Event,
    Test,
    Assignment,
    AssignmentSubmission,
    Submission,
    Group,
    Question,
    ForumPost,
    ForumComment,
    Broadcast,
  ];

  for (const model of models) {
    const filter = model === User
      ? { role: { $ne: 'platform_admin' }, $or: [{ institutionId: { $exists: false } }, { institutionId: null }] }
      : { $or: [{ institutionId: { $exists: false } }, { institutionId: null }] };
    const result = await model.updateMany(filter, { $set: { institutionId: institution._id } });
    console.log(`${model.modelName}: assigned ${result.modifiedCount} existing record(s) to UNIOSUN`);
  }

  await dropLegacyIndex(User.collection, 'email_1');
  await dropLegacyIndex(User.collection, 'identifier_1');
  await dropLegacyIndex(Course.collection, 'courseCode_1');
  await dropLegacyIndex(Group.collection, 'code_1');

  await User.collection.createIndex(
    { institutionId: 1, email: 1 },
    { unique: true, partialFilterExpression: { institutionId: { $type: 'objectId' } } },
  );
  await User.collection.createIndex(
    { institutionId: 1, identifier: 1 },
    { unique: true, partialFilterExpression: { institutionId: { $type: 'objectId' } } },
  );
  await User.collection.createIndex(
    { email: 1 },
    { unique: true, partialFilterExpression: { role: 'platform_admin' } },
  );
  await Course.collection.createIndex({ institutionId: 1, courseCode: 1 }, { unique: true });
  await Group.collection.createIndex({ institutionId: 1, code: 1 }, { unique: true });

  const { PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD, PLATFORM_ADMIN_IDENTIFIER, PLATFORM_ADMIN_NAME } = process.env;
  const platformAdminConfig = [
    PLATFORM_ADMIN_EMAIL,
    PLATFORM_ADMIN_PASSWORD,
    PLATFORM_ADMIN_IDENTIFIER,
    PLATFORM_ADMIN_NAME,
  ];
  if (platformAdminConfig.some(Boolean) && platformAdminConfig.some((value) => !value)) {
    throw new Error('Set all four PLATFORM_ADMIN_* variables to bootstrap the platform administrator.');
  }
  if (PLATFORM_ADMIN_EMAIL) {
    if (PLATFORM_ADMIN_PASSWORD.length < 12) {
      throw new Error('PLATFORM_ADMIN_PASSWORD must be at least 12 characters.');
    }
    const existing = await User.findOne({
      role: 'platform_admin',
      email: PLATFORM_ADMIN_EMAIL.toLowerCase(),
    });
    if (!existing) {
      await User.create({
        name: PLATFORM_ADMIN_NAME.trim(),
        email: PLATFORM_ADMIN_EMAIL.trim().toLowerCase(),
        password: PLATFORM_ADMIN_PASSWORD,
        identifier: PLATFORM_ADMIN_IDENTIFIER.trim(),
        role: 'platform_admin',
        status: 'active',
      });
      console.log('Created platform administrator.');
    } else {
      console.log('Platform administrator already exists; left unchanged.');
    }
  }

  console.log(`Tenant migration complete. Legacy records now belong to ${institution.name} (${institution.code}).`);
}

migrate()
  .catch((error) => {
    console.error('Tenant migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
