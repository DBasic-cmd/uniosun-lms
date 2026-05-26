const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { protect, isAdmin } = require("../middleware/authMiddleware");
const Course = require("../models/Course");

/**
 * @swagger
 * tags:
 * name: Auth
 * description: Authentication management
 */

/**
 * @swagger
 * /api/auth/register:
 * post:
 * summary: Register a new user
 * tags: [Auth]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * required:
 * - name
 * - identifier
 * - email
 * - password
 * - role
 * - department
 * properties:
 * name:
 * type: string
 * identifier:
 * type: string
 * email:
 * type: string
 * password:
 * type: string
 * role:
 * type: string
 * department:
 * type: string
 * responses:
 * 201:
 * description: User created successfully
 * 400:
 * description: User already exists
 * 500:
 * description: Server error
 */
router.post("/register", async (req, res) => {
  try {
    const { name, identifier, email, password, role, department } = req.body;

    const existingUser = await User.findOne({
      $or: [{ identifier }, { email: email.toLowerCase() }],
    });

    if (existingUser) {
      return res.status(400).json({
        error: "User with this Matrix Number or Email already exists",
      });
    }

    const user = new User({
      name,
      identifier,
      email,
      password,
      role,
      department,
    });
    await user.save();

    res.status(201).json({ message: "User created successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/auth/login:
 * post:
 * summary: Login a user
 * tags: [Auth]
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * required:
 * - loginKey
 * - password
 * properties:
 * loginKey:
 * type: string
 * description: Email or identifier
 * password:
 * type: string
 * responses:
 * 200:
 * description: Login successful
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * token:
 * type: string
 * user:
 * type: object
 * 400:
 * description: Invalid credentials
 * 403:
 * description: Account suspended
 * 404:
 * description: User not found
 * 500:
 * description: Server error
 */
router.post("/login", async (req, res) => {
  try {
    const { loginKey, password } = req.body;

    const user = await User.findOne({
      $or: [{ email: loginKey.toLowerCase() }, { identifier: loginKey }],
    });

    if (!user) {
      return res.status(404).json({ error: "Invalid Credentials" });
    }

    if (user.status === "suspended") {
      return res.status(403).json({
        error: "Your account is suspended. Please contact the ICT center.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid Credentials" });
    }

    user.lastActive = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        identifier: user.identifier,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Server error during login" });
  }
});

/**
 * @swagger
 * /api/auth/toggle-status/{id}:
 * put:
 * summary: Toggle user status (active/suspended)
 * tags: [Auth]
 * security:
 * - bearerAuth: []
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: User ID
 * responses:
 * 200:
 * description: User status updated
 * 404:
 * description: User not found
 * 500:
 * description: Server error
 */
router.put("/toggle-status/:id", protect, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.status = user.status === "active" ? "suspended" : "active";
    await user.save();

    res.json({ message: `User status updated to ${user.status}`, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/auth/edit-user/{id}:
 * put:
 * summary: Edit user details (Admin manages all, User updates own profile)
 * tags: [Auth]
 * security:
 * - bearerAuth: []
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: User ID
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * name:
 * type: string
 * email:
 * type: string
 * identifier:
 * type: string
 * role:
 * type: string
 * department:
 * type: string
 * status:
 * type: string
 * enum: [active, suspended]
 * responses:
 * 200:
 * description: User updated successfully
 * 400:
 * description: Email or Identifier already exists
 * 403:
 * description: Unauthorized access
 * 404:
 * description: User not found
 * 500:
 * description: Server error
 */
router.put("/edit-user/:id", protect, async (req, res) => {
  try {
    const { name, email, identifier, role, department, status } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Security check: Only allow admin or the owner to edit
    if (req.user.role !== "admin" && req.user.id !== user._id.toString()) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (email) {
      const existingEmail = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: req.params.id },
      });

      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }
      user.email = email.toLowerCase();
    }

    if (identifier) {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Only admin can edit identifier" });
      }

      const existingIdentifier = await User.findOne({
        identifier,
        _id: { $ne: req.params.id },
      });

      if (existingIdentifier) {
        return res.status(400).json({ error: "Identifier already exists" });
      }
      user.identifier = identifier;
    }

    if (name) user.name = name;
    if (department) user.department = department;
    
    // Strict admin overrides
    if (req.user.role === "admin") {
      if (role) user.role = role;
      if (status) user.status = status;
    }

    await user.save();
    res.status(200).json({ message: "User updated successfully", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/users
router.get("/users", protect, isAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select("name email identifier role department status lastActive")
      .sort({ createdAt: -1 });

    res.status(200).json({ count: users.length, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/auth/user/{id}:
 * get:
 * summary: Get single user information
 * tags: [Auth]
 * security:
 * - bearerAuth: []
 * parameters:
 * - in: path
 * name: id
 * required: true
 * schema:
 * type: string
 * description: User ID
 * responses:
 * 200:
 * description: User retrieved successfully
 * 403:
 * description: Access denied
 * 404:
 * description: User not found
 * 500:
 * description: Server error
 */
router.get("/user/:id", protect, async (req, res) => {
  try {
    // Security check: Only allow admin or the account owner to fetch profile details
    if (req.user.role !== "admin" && req.user.id !== req.params.id) {
      return res.status(403).json({ error: "Access denied. Unauthorized profile fetch." });
    }

    const user = await User.findById(req.params.id).select(
      "name email identifier role department status lastActive",
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
/**
 * @swagger
 * /api/auth/change-password:
 * put:
 * summary: Change logged-in user's password
 * tags: [Auth]
 * security:
 * - bearerAuth: []
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * required:
 * - currentPassword
 * - newPassword
 * - confirmPassword
 * properties:
 * currentPassword:
 * type: string
 * newPassword:
 * type: string
 * confirmPassword:
 * type: string
 * responses:
 * 200:
 * description: Password updated successfully
 * 400:
 * description: Validation errors (passwords mismatch, wrong current password)
 * 401:
 * description: Unauthorized
 * 500:
 * description: Server error
 */
// PUT /api/auth/change-password
router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // 1. Basic input validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "All password fields are required." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "New password and confirm password do not match." });
    }

    // 2. Fetch the user with password included (since we exclude it in protect middleware)
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // 3. Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "The current password you entered is incorrect." });
    }

    // 4. Optional: Prevent reuse of old password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ error: "New password cannot be the same as your current password." });
    }

    // 5. Update and Save (Mongoose .pre('save') hook hashes this automatically)
    user.password = newPassword;
    await user.save();

    res.status(200).json({ success: true, message: "Password updated successfully!" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;