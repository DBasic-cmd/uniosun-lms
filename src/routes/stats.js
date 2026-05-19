const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Course = require("../models/Course");
const { protect, isAdmin } = require("../middleware/authMiddleware");

/**
 * @swagger
 * tags:
 *   name: Stats
 *   description: Statistics and dashboard
 */

/**
 * @swagger
 * /api/stats/dashboard:
 *   get:
 *     summary: Get dashboard statistics
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     students:
 *                       type: integer
 *                     lecturers:
 *                       type: integer
 *                     courses:
 *                       type: integer
 *       500:
 *         description: Server error
 */
// GET /api/stats/dashboard
router.get("/dashboard", protect, isAdmin, async (req, res) => {
  try {
    // We run these in parallel to make it super fast
    const [activeStudents, suspendedStudents] = await Promise.all([
      User.countDocuments({ role: "student", status: "active" }),
      User.countDocuments({ role: "student", status: "suspended" }),
    ]);
    const [totalStudents, totalLecturers, totalCourses] = await Promise.all([
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "lecturer" }),
      Course.countDocuments(),
    ]);

    res.json({
      success: true,
      data: {
        students: totalStudents,
        lecturers: totalLecturers,
        courses: totalCourses,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
