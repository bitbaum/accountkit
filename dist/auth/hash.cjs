"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var hash_exports = {};
__export(hash_exports, {
  BCRYPT_ROUNDS: () => BCRYPT_ROUNDS,
  PASSWORD_HASH_PREFIX: () => PASSWORD_HASH_PREFIX,
  createPasswordHasher: () => createPasswordHasher
});
module.exports = __toCommonJS(hash_exports);
var import_node_crypto = require("node:crypto");
const PASSWORD_HASH_PREFIX = "$bs1$";
const BCRYPT_ROUNDS = 12;
const digest = (plain) => (0, import_node_crypto.createHash)("sha256").update(plain, "utf8").digest("base64");
function createPasswordHasher(bcrypt, rounds = BCRYPT_ROUNDS) {
  return {
    async hash(plain) {
      return PASSWORD_HASH_PREFIX + await bcrypt.hash(digest(plain), rounds);
    },
    async verify(plain, stored) {
      if (typeof plain !== "string" || !stored)
        return { valid: false, rehash: false };
      if (stored.startsWith(PASSWORD_HASH_PREFIX)) {
        const valid2 = await bcrypt.compare(
          digest(plain),
          stored.slice(PASSWORD_HASH_PREFIX.length)
        );
        return { valid: valid2, rehash: false };
      }
      const valid = await bcrypt.compare(plain, stored);
      return { valid, rehash: valid };
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BCRYPT_ROUNDS,
  PASSWORD_HASH_PREFIX,
  createPasswordHasher
});
