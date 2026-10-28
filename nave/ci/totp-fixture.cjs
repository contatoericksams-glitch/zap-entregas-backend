"use strict";
// Test fixture only: secret comes from ephemeral Auth enrollment, never a personal account.
const crypto = require("node:crypto");
function fixtureTotp(secret, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  if (typeof secret !== "string" || !/^[A-Z2-7]+=*$/.test(secret)) throw new Error("Invalid fixture secret");
  const bits = [...secret.replace(/=+$/, "")].map(c => alphabet.indexOf(c).toString(2).padStart(5, "0")).join("");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const digest = crypto.createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}
module.exports = { fixtureTotp };
