const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const { tenantContext, tenantScopePlugin } = require('../src/models/tenantContext');

mongoose.set('bufferCommands', false);
let modelNumber = 0;

function createTenantModel() {
  const schema = new mongoose.Schema({ name: String });
  schema.plugin(tenantScopePlugin);
  return mongoose.model(`TenantScopeTest${Date.now()}${++modelNumber}`, schema);
}

test('tenant query and update middleware enforces the active institution', async () => {
  const Model = createTenantModel();
  const institutionId = new mongoose.Types.ObjectId();
  const otherInstitutionId = new mongoose.Types.ObjectId();

  await tenantContext.run({ institutionId }, async () => {
    const query = Model.find({ institutionId: otherInstitutionId });
    await query.exec().catch(() => {});
    assert.equal(String(query.getFilter().institutionId), String(institutionId));

    const update = Model.updateOne({}, { $set: { institutionId: otherInstitutionId } });
    await update.exec().catch(() => {});
    assert.equal(String(update.getUpdate().$set.institutionId), String(institutionId));
  });
});

test('tenant insertMany and document validation assign the active institution', async () => {
  const Model = createTenantModel();
  const institutionId = new mongoose.Types.ObjectId();

  await tenantContext.run({ institutionId }, async () => {
    const documents = [{ name: 'bulk record' }];
    await Model.insertMany(documents).catch(() => {});
    assert.equal(String(documents[0].institutionId), String(institutionId));

    const document = new Model({ name: 'validated record' });
    await document.validate();
    assert.equal(String(document.institutionId), String(institutionId));
  });
});

test('tenant aggregation middleware prepends an institution filter', async () => {
  const Model = createTenantModel();
  const institutionId = new mongoose.Types.ObjectId();
  const aggregate = Model.aggregate([]);

  await tenantContext.run({ institutionId }, async () => {
    await aggregate.exec().catch(() => {});
    assert.deepEqual(aggregate.pipeline()[0], { $match: { institutionId } });
  });
});

test('platform bypass does not add a tenant filter', async () => {
  const Model = createTenantModel();
  const query = Model.find({});

  await tenantContext.run({ bypass: true }, async () => {
    await query.exec().catch(() => {});
    assert.equal(query.getFilter().institutionId, undefined);
  });
});

test('findOne, findById and findOneAnd* queries are scoped to the active institution', async () => {
  const Model = createTenantModel();
  const institutionId = new mongoose.Types.ObjectId();
  const otherInstitutionId = new mongoose.Types.ObjectId();

  await tenantContext.run({ institutionId }, async () => {
    const queries = [
      Model.findOne({ institutionId: otherInstitutionId }),
      Model.findById(new mongoose.Types.ObjectId()),
      Model.findOneAndDelete({}),
      Model.findOneAndReplace({}, { name: 'replaced' }),
    ];
    for (const query of queries) {
      await query.exec().catch(() => {});
      assert.equal(String(query.getFilter().institutionId), String(institutionId), query.op);
    }
  });
});

test('findOneAndReplace keeps the active institution on the replacement', async () => {
  const Model = createTenantModel();
  const institutionId = new mongoose.Types.ObjectId();
  const otherInstitutionId = new mongoose.Types.ObjectId();

  await tenantContext.run({ institutionId }, async () => {
    const query = Model.findOneAndReplace({}, { name: 'x', institutionId: otherInstitutionId });
    await query.exec().catch(() => {});
    assert.equal(String(query.getUpdate().institutionId), String(institutionId));
    assert.equal(query.getUpdate().$set, undefined);
  });
});
