const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const Test = require('../models/Test');
const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Group = require('../models/Group');
const { protect, isAdmin } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   - name: Courses
 *     description: Course management
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
    const { courseCode, title, department, lecturer, level, status } = req.body;

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
      lecturer,
      level,
      status: status || "Draft",
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
 *   post:
 *     summary: Enroll a student in a course from the catalog
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
 *               - courseId
 *             properties:
 *               courseId:
 *                 type: string
 *                 description: The MongoDB Object ID of the course
 *                 example: 65f123456789abcdef123456
 *     responses:
 *       200:
 *         description: Successfully enrolled in the course
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 enrolledCourses:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Already enrolled or invalid request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       403:
 *         description: Only students can enroll in courses
 *       404:
 *         description: Course not found
 *       500:
 *         description: Server error
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

/**
 * @swagger
 * /api/courses:
 *   get:
 *     summary: Retrieve all courses
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all courses retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                 courses:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       courseCode:
 *                         type: string
 *                       title:
 *                         type: string
 *                       department:
 *                         type: string
 *       500:
 *         description: Server error
 */
router.get('/', protect, async (req, res) => {
  try {
    const courses = await Course.find().sort({ courseCode: 1 });
    res.status(200).json({ count: courses.length, courses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/courses/edit-course/{id}:
 *   put:
 *     summary: Edit course details (Admin only)
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Course ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               courseCode:
 *                 type: string
 *               title:
 *                 type: string
 *               department:
 *                 type: string
 *     responses:
 *       200:
 *         description: Course updated successfully
 *       400:
 *         description: Invalid parameters or course code already exists
 *       404:
 *         description: Course not found
 *       500:
 *         description: Server error
 */
router.put('/edit-course/:id', protect, isAdmin, async (req, res) => {
  try {
    const { courseCode, title, department, lecturer, level, status } = req.body;
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    if (courseCode) {
      const normalizedCode = courseCode.toUpperCase();
      const existingCourse = await Course.findOne({
        courseCode: normalizedCode,
        _id: { $ne: req.params.id }
      });
      if (existingCourse) {
        return res.status(400).json({ error: "Course code already exists" });
      }
      course.courseCode = normalizedCode;
    }

    if (title) course.title = title;
    if (department) course.department = department;
    if (lecturer) course.lecturer = lecturer;
    if (level) course.level = level;
    if (status) course.status = status;

    await course.save();
    res.status(200).json({ message: "Course updated successfully", course });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/courses/{courseId}/grades:
 *   get:
 *     summary: Get a student's grades report for a specific course (CBT Tests and Assignments)
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Course MongoDB ID
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *         description: Optionally query a specific student's grades (Lecturer/Admin only)
 *     responses:
 *       200:
 *         description: Grades list retrieved successfully
 *       403:
 *         description: Access denied (must be enrolled or lecturer of course)
 *       404:
 *         description: Course not found
 */
router.get('/:courseId/grades', protect, async (req, res) => {
  try {
    const courseId = req.params.courseId;

    // Determine target student ID (students default to self, lecturers can specify via query)
    let studentId = req.user.id;
    if (req.user.role === 'lecturer' || req.user.role === 'admin') {
      if (req.query.studentId) {
        studentId = req.query.studentId;
      } else {
        return res.status(400).json({ error: "Lecturer/Admin must provide studentId in the query parameters (e.g. ?studentId=...)" });
      }
    }

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ error: "Course not found" });

    // Validate course access
    const isAuthorized = req.user.role === 'admin' || req.user.role === 'lecturer' ||
      (req.user.enrolledCourses && req.user.enrolledCourses.some(id => id.toString() === courseId.toString()));

    if (!isAuthorized) {
      return res.status(403).json({ error: "Access denied. You are not authorized to view grades for this course." });
    }

    // 1. Fetch all Tests for the course
    const tests = await Test.find({ course: courseId });

    // Fetch student's test submissions
    const testSubmissions = await Submission.find({
      student: studentId,
      test: { $in: tests.map(t => t._id) }
    });
    const testSubmissionsMap = new Map(testSubmissions.map(s => [s.test.toString(), s]));

    // 2. Fetch all Assignments for the course
    const assignments = await Assignment.find({ course: courseId });

    // Fetch the student's active group memberships for these assignments
    const groups = await Group.find({
      assignment: { $in: assignments.map(a => a._id) },
      members: studentId
    });
    const groupsMap = new Map(groups.map(g => [g.assignment.toString(), g]));

    // Fetch the student's individual and group assignment submissions
    const assignmentSubmissions = await AssignmentSubmission.find({
      assignment: { $in: assignments.map(a => a._id) },
      $or: [
        { student: studentId },
        { group: { $in: groups.map(g => g._id) } }
      ]
    });
    const assignmentSubmissionsMap = new Map(assignmentSubmissions.map(sub => [sub.assignment.toString(), sub]));

    // Helper to convert date and time string to Date object in server timezone
    const getLocalDateTime = (dateField, timeStr) => {
      const date = new Date(dateField);
      const year = date.getFullYear();
      const month = date.getMonth();
      const day = date.getDate();

      const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (!match) return date;

      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = match[3].toUpperCase();

      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;

      return new Date(year, month, day, hours, minutes, 0, 0);
    };

    const currentTime = new Date();
    const grades = [];

    // Compile Tests
    tests.forEach(test => {
      const sub = testSubmissionsMap.get(test._id.toString());
      const maxScore = test.numberOfQuestions * test.marksPerQuestion;
      
      const scheduledEnd = getLocalDateTime(test.date, test.endTime);
      const isOverdue = currentTime > new Date(scheduledEnd.getTime() + 60 * 1000); // 60s grace period

      let score = null;
      if (sub) {
        score = sub.score;
      } else if (isOverdue) {
        score = 0; // Missed the test
      }

      const percentage = score !== null && maxScore > 0 ? parseFloat(((score / maxScore) * 100).toFixed(2)) : null;

      grades.push({
        name: test.testTitle,
        type: 'test',
        date: test.date,
        maxScore,
        score,
        percentage
      });
    });

    // Compile Assignments
    assignments.forEach(assign => {
      const sub = assignmentSubmissionsMap.get(assign._id.toString());
      const maxScore = 100; // Standard max score baseline for assignments
      
      const isOverdue = currentTime > new Date(assign.dueDate);

      let score = null;
      if (sub) {
        score = sub.score;
      } else if (isOverdue) {
        score = 0; // Missed the assignment
      }

      const percentage = score !== null ? parseFloat(((score / maxScore) * 100).toFixed(2)) : null;

      grades.push({
        name: assign.title,
        type: 'assignment',
        date: assign.dueDate,
        maxScore,
        score,
        percentage
      });
    });

    res.json({ success: true, grades });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;