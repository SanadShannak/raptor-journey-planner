const mongoose = require("mongoose");

/**
 * One email this server sent, kept only to count against the sending limits.
 *
 * The address is stored as a SHA-256 hash, never as text: the counts need to
 * know "the same address again", not whose address it was. Rows delete
 * themselves after 32 days — long enough to cover a whole calendar month,
 * which is the longest window any limit looks back over.
 */
const emailSendSchema = new mongoose.Schema({
  addressHash: { type: String, required: true },
  sentAt: { type: Date, required: true, default: Date.now, index: { expires: "32d" } },
});

emailSendSchema.index({ addressHash: 1, sentAt: -1 });

module.exports = mongoose.model("EmailSend", emailSendSchema);
