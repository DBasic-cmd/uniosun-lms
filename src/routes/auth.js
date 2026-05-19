const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { protect, isAdmin } = require('../middleware/authMiddleware');
const Course = require('../models/Course'); 
// Note: Use '../' to go up one folder then into 'models'

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication management
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - identifier
 *               - email
 *               - password
 *               - role
 *               - department
 *             properties:
 *               name:
 *                 type: string
 *               identifier:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *               department:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: User already exists
 *       500:
 *         description: Server error
 */
// REGISTER ROUTE
router.post('/register', async (req, res) => {
  try {
    const { name, identifier, email, password, role, department } = req.body;

    // Check if identifier OR email already exists
    const existingUser = await User.findOne({ 
      $or: [{ identifier }, { email: email.toLowerCase() }] 
    });

    if (existingUser) {
      return res.status(400).json({ 
        error: "User with this Matrix Number or Email already exists" 
      });
    }

    const user = new User({ name, identifier, email, password, role, department });
    await user.save();

    res.status(201).json({ message: "User created successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login a user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - loginKey
 *               - password
 *             properties:
 *               loginKey:
 *                 type: string
 *                 description: Email or identifier
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *       400:
 *         description: Invalid credentials
 *       403:
 *         description: Account suspended
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
// LOGIN ROUTE
router.post('/login', async (req, res) => {
  try {
    const { loginKey, password } = req.body;

    // 1. Check if user exists by Email OR Identifier
    const user = await User.findOne({
      $or: [
        { email: loginKey.toLowerCase() }, 
        { identifier: loginKey }
      ]
    });

    if (!user) {
      return res.status(404).json({ error: "Invalid Credentials" });
    }

    // 2. Check Account Status (Active/Suspended)
    if (user.status === 'suspended') {
      return res.status(403).json({ 
        error: "Your account is suspended. Please contact the ICT center." 
      });
    }

    // 3. Verify Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid Credentials" });
    }

    // 4. Generate JWT Token
    const token = jwt.sign(
      { id: user._id, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' }
    );

    // 5. Send Response
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        identifier: user.identifier
      }
    });

  } catch (err) {
    res.status(500).json({ error: "Server error during login" });
  }
});

/**
 * @swagger
 * /api/auth/toggle-status/{id}:
 *   put:
 *     summary: Toggle user status (active/suspended)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User status updated
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
// PUT /api/auth/toggle-status/:id
router.put('/toggle-status/:id', protect, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Flip the status
    user.status = user.status === 'active' ? 'suspended' : 'active';
    await user.save();

    res.json({ message: `User status updated to ${user.status}`, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




module.exports = router;