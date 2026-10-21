// Jest cannot load native modules. In tests, react-native-quick-crypto is replaced by Node's
// built-in OpenSSL-backed crypto, which exposes the same API for what src/crypto uses.
const nodeCrypto = require('node:crypto');

module.exports = { ...nodeCrypto, Buffer };
