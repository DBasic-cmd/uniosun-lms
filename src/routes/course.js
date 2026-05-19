const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const { protect, isAdmin } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Courses
 *   description: Course management
 */

/**
 * @swagger
 * /api/courses/create-course:
 *   post:
 *     summary: Create a new course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - courseCode
 *               - title
 *               - department
 *             properties:
 *               courseCode:
 *                 type: string
 *               title:
 *                 type: string
 *               department:
 *                 type: string
 *     responses:
 *       201:
 *         description: Course created successfully
 *       400:
 *         description: Course code already exists
 *       500:
 *         description: Server error
 */
// POST /api/courses/create
router.post('/create-course', protect, isAdmin, async (req, res) => {
  try {
    const { courseCode, title, department } = req.body;

    // 1. Check if course already exists
    const existingCourse = await Course.findOne({ courseCode: courseCode.toUpperCase() });
    if (existingCourse) {
      return res.status(400).json({ error: "Course code already exists" });
    }

    // 2. Create and save the new course
    const newCourse = new Course({
      courseCode: courseCode.toUpperCase(),
      title,
      department,
      materials: [] // Starts empty
    });

    await newCourse.save();

    res.status(201).json({
      message: `Course ${courseCode} created successfully!`,
      course: newCourse
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;