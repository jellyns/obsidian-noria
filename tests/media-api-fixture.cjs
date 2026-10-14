const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');

// The API delegates through the optional feature boundary. Stub domain I/O there,
// while exercising the real API and its error/revision contracts.
function mediaFeature(stubs) {
  const file = path.resolve(__dirname, '../src/media-api.js');
  const module = {exports: {}};
  const local = createRequire(file);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, require: id => Object.hasOwn(stubs, id) ? stubs[id] : local(id)
  }, {filename: file});
  return {api: module.exports.createMediaApi, operations: () => module.exports.operations};
}
module.exports = {mediaFeature};
