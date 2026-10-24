"use strict";
// Runner-only checkpoint. Stores fictional room state, never credentials or Auth sessions.
const fs = require("node:fs"), path = require("node:path");
class LabCheckpoint {
  constructor(directory) {
    this.directory = path.resolve(directory);
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.file = path.join(this.directory, "room.json");
    this.temporary = path.join(this.directory, "room.tmp");
    this.lock = path.join(this.directory, "writer.lock");
    // No stale-lock removal: an unclean shutdown fails closed instead of risking two writers.
    this.lockFd = fs.openSync(this.lock, "wx", 0o600);
    this.closed = false;
  }
  load() {
    if (this.closed) throw new Error("Checkpoint is closed");
    try {
      if (fs.statSync(this.file).size > 262144) throw new Error("Oversized checkpoint");
      const value = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid checkpoint object");
      return value;
    } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }
  save(value) {
    if (this.closed) throw new Error("Checkpoint is closed");
    const body = JSON.stringify(value);
    if (Buffer.byteLength(body) > 262144) throw new Error("Oversized checkpoint");
    let fd;
    try {
      fd = fs.openSync(this.temporary, "w", 0o600);
      fs.writeFileSync(fd, body); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      fs.renameSync(this.temporary, this.file);
    } finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  close() {
    if (this.closed) return;
    fs.closeSync(this.lockFd); fs.unlinkSync(this.lock); this.closed = true;
  }
}
module.exports = { LabCheckpoint };
