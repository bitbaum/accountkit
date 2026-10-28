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
var password_exports = {};
__export(password_exports, {
  MAX_PASSWORD_LENGTH: () => MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH: () => MIN_PASSWORD_LENGTH,
  passwordProblem: () => passwordProblem
});
module.exports = __toCommonJS(password_exports);
const MIN_PASSWORD_LENGTH = 1;
const MAX_PASSWORD_LENGTH = 128;
function passwordProblem(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH)
    return "empty";
  return password.length > MAX_PASSWORD_LENGTH ? "too_long" : null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  passwordProblem
});
