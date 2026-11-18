const express = require('express');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const Broadcast = require('../models/Broadcast');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
const LIST_LIMIT = 50;

// Broadcasts a user may see, matching GET /api/broadcasts.
function broadcastFilter(user) {
  if (user.role === 'student') return { targetAudience: { $in: ['all', 'student'] } };
  if (user.role === 'lecturer') return { targetAudience: { $in: ['all', 'lecturer'] } };
  return {};
}

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: The signed-in user's notifications (discussions, replies, broadcasts) with read state
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Newest first, with the unread count
 */
router.get('/', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const [notifications, broadcasts] = await Promise.all([
      Notification.find({ recipient: userId })
        .populate('course', 'courseCode title')
        .sort({ createdAt: -1 })
        .limit(LIST_LIMIT),
      Broadcast.find(broadcastFilter(req.user))
        .sort({ createdAt: -1 })
        .limit(LIST_LIMIT),
    ]);

    const items = [
      ...notifications.map((n) => ({
        id: n._id,
        source: 'notification',
        type: n.type,
        title: n.title,
        message: n.message,
        courseId: n.course?._id || null,
        courseCode: n.course?.courseCode || '',
        courseTitle: n.course?.title || '',
        postId: n.post || null,
        read: n.read,
        createdAt: n.createdAt,
      })),
      ...broadcasts.map((b) => ({
        id: b._id,
        source: 'broadcast',
        type: 'announcement',
        title: b.title,
        message: b.content,
        courseId: null,
        courseCode: '',
        courseTitle: '',
        postId: null,
        read: (b.readBy || []).some((id) => String(id) === String(userId)),
        createdAt: b.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, LIST_LIMIT);

    res.json({
      success: true,
      notifications: items,
      unreadCount: items.filter((item) => !item.read).length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     summary: Mark all of the signed-in user's notifications and broadcasts as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/read-all', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    await Promise.all([
      Notification.updateMany({ recipient: userId, read: false }, { read: true }),
      Broadcast.updateMany(
        { ...broadcastFilter(req.user), readBy: { $ne: userId } },
        { $addToSet: { readBy: userId } },
      ),
    ]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Mark one notification or broadcast as read for the signed-in user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id/read', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Notification not found.' });
    }
    const userId = req.user._id;

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: userId },
      { read: true },
    );
    if (notification) return res.json({ success: true });

    const broadcast = await Broadcast.findOneAndUpdate(
      { _id: req.params.id, ...broadcastFilter(req.user) },
      { $addToSet: { readBy: userId } },
    );
    if (broadcast) return res.json({ success: true });

    return res.status(404).json({ error: 'Notification not found.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
