const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { tenantScopePlugin } = require("./tenantContext");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  enrolledCourses: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
    },
  ],
  // Keep identifier for Matrix Number/Staff ID
  identifier: { type: String, required: true },
  // Add Email
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      "Please fill a valid email address",
    ],
  },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["student", "lecturer", "admin", "platform_admin"],
    default: "student",
  },
  status: { type: String, enum: ["active", "suspended"], default: "active" },
  department: String,
  lastActive: { type: Date },
  profileImage: String,
  profileImages: [
    {
      url: String,
      uploadedAt: Date,
    },
  ],
});

userSchema.index({ institutionId: 1, email: 1 }, {
  unique: true,
  partialFilterExpression: { institutionId: { $type: "objectId" } },
});
userSchema.index({ institutionId: 1, identifier: 1 }, {
  unique: true,
  partialFilterExpression: { institutionId: { $type: "objectId" } },
});
userSchema.index({ email: 1 }, {
  unique: true,
  partialFilterExpression: { role: "platform_admin" },
});
tenantScopePlugin(userSchema);

// Hash password before saving
userSchema.pre("save", async function () {
  // If password isn't changed, just return (don't need next() with async)
  if (!this.isModified("password")) return;

  // Hash the password
  this.password = await bcrypt.hash(this.password, 10);
});

module.exports = mongoose.model("User", userSchema);
