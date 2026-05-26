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

/**
 * @swagger
 * /api/courses/enroll:
 * post:
 * summary: Enroll a student in a course from the catalog
 * tags: [Courses]
 * security:
 * - bearerAuth: []
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * required:
 * - courseId
 * properties:
 * courseId:
 * type: string
 * description: The MongoDB Object ID of the course
 * example: 65f123456789abcdef123456
 * responses:
 * 200:
 * description: Successfully enrolled in the course
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * message:
 * type: string
 * enrolledCourses:
 * type: array
 * items:
 * type: string
 * 400:
 * description: Already enrolled or invalid request
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * error:
 * type: string
 * 403:
 * description: Only students can enroll in courses
 * 404:
 * description: Course not found
 * 500:
 * description: Server error
 */
// POST /api/courses/enroll
router.post('/enroll', protect, async (req, res) => {
  try {
    // 1. Enforce that only students can enroll in academic courses
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: "Access denied. Only students can enroll in courses." });
    }

    const { courseId } = req.body;

    if (!courseId) {
      return res.status(400).json({ error: "Course ID is required." });
    }

    // 2. Verify that the course actually exists in the database
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found." });
    }

    // 3. Find the user from the DB to check their current enrollment list
    // (We use req.user.id populated by the protect middleware)
    const user = await User.findById(req.user.id);

    // 4. Check if the course ID is already in their enrolledCourses array
    if (user.enrolledCourses.includes(courseId)) {
      return res.status(400).json({ error: "You are already enrolled in this course." });
    }

    // 5. Push the course ID and save the updated profile
    user.enrolledCourses.push(courseId);
    await user.save();

    res.status(200).json({
      success: true,
      message: `Successfully enrolled in ${course.courseCode}: ${course.title}`,
      enrolledCourses: user.enrolledCourses
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;