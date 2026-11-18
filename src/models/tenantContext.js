const { AsyncLocalStorage } = require('async_hooks');

const tenantContext = new AsyncLocalStorage();

function currentTenant() {
  return tenantContext.getStore();
}

function tenantScopePlugin(schema) {
  if (!schema.path('institutionId')) {
    schema.add({
      institutionId: {
        type: require('mongoose').Schema.Types.ObjectId,
        ref: 'Institution',
        index: true,
      },
    });
  }

  schema.pre('validate', function () {
    const tenant = currentTenant();
    if (tenant?.institutionId) {
      this.institutionId = tenant.institutionId;
    }
  });

  schema.pre('insertMany', function (documents) {
    const tenant = currentTenant();
    if (tenant?.institutionId) {
      documents.forEach((document) => {
        document.institutionId = tenant.institutionId;
      });
    }
  });

  schema.pre(
    // findOne must be listed explicitly: findById() and exists() run as findOne,
    // and a hook registered for 'find' does not fire for it.
    /^(find|findOne|countDocuments|updateOne|updateMany|findOneAndUpdate|findOneAndReplace|findOneAndDelete|deleteOne|deleteMany|replaceOne|distinct)$/,
    function () {
      const tenant = currentTenant();
      if (tenant?.institutionId && !tenant.bypass) {
        this.where({ institutionId: tenant.institutionId });
        if (['replaceOne', 'findOneAndReplace'].includes(this.op)) {
          // A replacement document may not contain operators such as $set.
          this.setUpdate({ ...(this.getUpdate() || {}), institutionId: tenant.institutionId });
        } else if (['updateOne', 'updateMany', 'findOneAndUpdate'].includes(this.op)) {
          this.set('institutionId', tenant.institutionId);
        }
      }
    },
  );

  schema.pre('aggregate', function () {
    const tenant = currentTenant();
    if (tenant?.institutionId && !tenant.bypass) {
      this.pipeline().unshift({ $match: { institutionId: tenant.institutionId } });
    }
  });
}

module.exports = { currentTenant, tenantContext, tenantScopePlugin };
