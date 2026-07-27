const express = require('express');
const router = express.Router();
const Broadcast = require('../models/Broadcast');
const { protect, isAdmin } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   - name: Broadcasts
 *     description: Administrative broadcast message (announcement) management
 */

/**
 * @swagger
 * /api/broadcasts:
 *   post:
 *     summary: Create and send a new broadcast message
 *     tags: [Broadcasts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *                 example: Server Maintenance Notice
 *               content:
 *                 type: string
 *                 example: The LMS will be down for scheduled maintenance on Sunday from 2 AM to 4 AM.
 *               targetAudience:
 *                 type: string
 *                 enum: [all, student, lecturer]
 *                 default: all
 *                 example: all
 *     responses:
 *       201:
 *         description: Broadcast message created and sent successfully
 *       400:
 *         description: Invalid input or missing fields
 *       403:
 *         description: Access denied. Admins only.
 *       500:
 *         description: Server error
 */
router.post('/', protect, isAdmin, async (req, res) => {
  try {
    const { title, content, targetAudience } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required." });
    }

    if (targetAudience && !['all', 'student', 'lecturer'].includes(targetAudience)) {
      return res.status(400).json({ error: "Invalid target audience value. Must be 'all', 'student', or 'lecturer'." });
    }

    const broadcast = new Broadcast({
      title,
      content,
      sender: req.user.id,
      targetAudience: targetAudience || 'all'
    });

    await broadcast.save();
    
    // Populate sender details for the response
    await broadcast.populate('sender', 'name email');

    res.status(201).json({
      success: true,
      message: "Broadcast message created successfully!",
      broadcast
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/broadcasts:
 *   get:
 *     summary: Retrieve broadcast messages for the authenticated user
 *     description: Retrieves broadcasts filtered according to the current user's role (Students see 'all' and 'student' broadcasts; Lecturers see 'all' and 'lecturer' broadcasts; Admins see all).
 *     tags: [Broadcasts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of broadcast messages retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/', protect, async (req, res) => {
  try {
    let filter = {};

    // Filter broadcasts depending on the user role
    if (req.user.role === 'student') {
      filter = { targetAudience: { $in: ['all', 'student'] } };
    } else if (req.user.role === 'lecturer') {
      filter = { targetAudience: { $in: ['all', 'lecturer'] } };
    }
    // Admins have filter = {} and can see all broadcasts

    const broadcasts = await Broadcast.find(filter)
      .populate('sender', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: broadcasts.length,
      broadcasts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/broadcasts/{id}:
 *   delete:
 *     summary: Delete a broadcast message
 *     tags: [Broadcasts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Broadcast message ID
 *     responses:
 *       200:
 *         description: Broadcast deleted successfully
 *       403:
 *         description: Access denied. Admins only.
 *       404:
 *         description: Broadcast message not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', protect, isAdmin, async (req, res) => {
  try {
    const broadcast = await Broadcast.findByIdAndDelete(req.params.id);

    if (!broadcast) {
      return res.status(404).json({ error: "Broadcast message not found." });
    }

    res.status(200).json({
      success: true,
      message: "Broadcast message deleted successfully!"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
