const express = require('express');
const router = express.Router();
const Test = require('../models/Test');
const Question = require('../models/Question');
const Submission = require('../models/Submission');
const Course = require('../models/Course');
const { protect } = require('../middleware/authMiddleware');


/**
 * @swagger
 * tags:
 *   - name: CBT Test Engine
 *     description: Examination and Question Management for Lecturers
 */

/**
 * @swagger
 * /api/tests/settings:
 *   post:
 *     summary: Configure and schedule a test session
 *     tags: [CBT Test Engine]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [course, testTitle, testType, date, startTime, endTime, numberOfQuestions, marksPerQuestion]
 *             properties:
 *               course:
 *                 type: string
 *                 example: 65f123456789abcdef123456
 *               testTitle:
 *                 type: string
 *                 example: Harmattan Semester Test 1
 *               testType:
 *                 type: string
 *                 enum: [multiple-choice, theory, mixed]
 *               date:
 *                 type: string
 *                 format: date
 *                 example: 2026-06-20
 *               startTime:
 *                 type: string
 *                 example: "10:00 AM"
 *               endTime:
 *                 type: string
 *                 example: "11:00 AM"
 *               duration:
 *                 type: number
 *                 minimum: 1
 *                 description: Test duration in minutes.
 *               numberOfQuestions:
 *                 type: number
 *                 example: 20
 *               marksPerQuestion:
 *                 type: number
 *                 example: 2
 *               instructions:
 *                 type: string
 *                 example: "Answer all questions. Strict monitoring enabled."
 */

/**
 * @swagger
 * /api/tests/{testId}/questions:
 *   post:
 *     summary: Add a question to an existing test configuration
 *     tags: [CBT Test Engine]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: testId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [questionText, correctAnswer]
 *             properties:
 *               questionText:
 *                 type: string
 *                 example: "What is the primary core module used for handling network events in Node.js?"
 *               options:
 *                 type: array
 *                 items:
 *                   type: string
 *                   example: ["fs", "http", "crypto", "path"]
 *               correctAnswer:
 *                 type: string
 *                 description: "The index value or plain text answer matching the option pattern"
 *                 example: "1"
 */


// Middleware helper to ensure only lecturers/admins proceed
const verifyLecturer = (req, res, next) => {
  if (req.user.role !== 'lecturer' && req.user.role !== 'admin') {
    return res.status(403).json({ error: "Access denied. Lecturers only." });
  }
  next();
};

// ==========================================
// PART 1: TEST SETTINGS
// ==========================================

// Create Test Settings
router.post('/settings', protect, verifyLecturer, async (req, res) => {
  try {
    const { date, startTime, endTime, duration } = req.body;
    if (!await Course.findById(req.body.course)) {
      return res.status(404).json({ error: "Course not found in this institution." });
    }
    const scheduledStart = getLocalDateTime(date, startTime);
    const scheduledEnd = getLocalDateTime(date, endTime);
    if (Number.isNaN(scheduledStart.getTime()) || Number.isNaN(scheduledEnd.getTime()) ||
      scheduledEnd <= scheduledStart ||
      (duration !== undefined &&
        (!Number.isInteger(Number(duration)) ||
          Number(duration) < 1 ||
          scheduledEnd - scheduledStart !== Number(duration) * 60000))) {
      return res.status(400).json({ error: "Provide a valid test date, start/end time, and positive duration." });
    }

    const newTest = new Test({ ...req.body, lecturer: req.user.id });
    await newTest.save();
    res.status(201).json({ success: true, message: "Test scheduled successfully", test: newTest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Test Settings
router.patch('/settings/:testId', protect, verifyLecturer, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId);
    if (!test) return res.status(404).json({ error: "Test configuration not found" });

    if (test.lecturer.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. You can only update your own tests." });
    }

    const candidate = { ...test.toObject(), ...req.body };
    if (candidate.course && !await Course.findById(candidate.course)) {
      return res.status(404).json({ error: "Course not found in this institution." });
    }
    const scheduledStart = getLocalDateTime(candidate.date, candidate.startTime);
    const scheduledEnd = getLocalDateTime(candidate.date, candidate.endTime);
    if (Number.isNaN(scheduledStart.getTime()) || Number.isNaN(scheduledEnd.getTime()) ||
      scheduledEnd <= scheduledStart ||
      (candidate.duration !== undefined &&
        (!Number.isInteger(Number(candidate.duration)) ||
          Number(candidate.duration) < 1 ||
          scheduledEnd - scheduledStart !== Number(candidate.duration) * 60000))) {
      return res.status(400).json({ error: "Provide a valid test date, start/end time, and positive duration." });
    }

    const updatedTest = await Test.findByIdAndUpdate(
      req.params.testId,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    res.json({ success: true, message: "Test updated successfully", test: updatedTest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PART 2: QUESTION BANK MANAGEMENT
// ==========================================

// Add a Question to a specific Test
router.post('/:testId/questions', protect, verifyLecturer, async (req, res) => {
  try {
    const testExists = await Test.findById(req.params.testId);
    if (!testExists) return res.status(404).json({ error: "Test configuration not found" });

    const newQuestion = new Question({
      test: req.params.testId,
      questionText: req.body.questionText,
      options: req.body.options,
      correctAnswer: req.body.correctAnswer
    });

    await newQuestion.save();
    res.status(201).json({ success: true, message: "Question added", question: newQuestion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/tests/{testId}/questions:
 *   get:
 *     summary: Retrieve all questions for a test (Lecturer Review - includes correctAnswer)
 *     tags: [CBT Test Engine]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: testId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved questions with correct answers
 *       403:
 *         description: Access denied (must be the test owner or admin)
 *       404:
 *         description: Test not found
 */
// Get all Questions for a Test (Lecturer Review View - Includes correctAnswer)
router.get('/:testId/questions', protect, verifyLecturer, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId);
    if (!test) return res.status(404).json({ error: "Test configuration not found" });

    // Ensure the lecturer owns this test, or they are an admin
    if (test.lecturer.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. You can only review questions for your own tests." });
    }

    const questions = await Question.find({ test: req.params.testId });
    res.json({ success: true, questions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/tests/{testId}/questions/bulk:
 *   post:
 *     summary: Bulk upload multiple questions to a test
 *     tags: [CBT Test Engine]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: testId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [questions]
 *             properties:
 *               questions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [questionText, correctAnswer]
 *                   properties:
 *                     questionText:
 *                       type: string
 *                       example: "What does HTML stand for?"
 *                     options:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["HyperText Markup Language", "HighText Machine Language", "HyperTabular Markup Language"]
 *                     correctAnswer:
 *                       type: string
 *                       example: "HyperText Markup Language"
 *     responses:
 *       201:
 *         description: Questions imported successfully
 *       400:
 *         description: Invalid payload or validation error
 *       403:
 *         description: Access denied
 *       404:
 *         description: Test not found
 */
// Bulk Upload Questions to a Test
router.post('/:testId/questions/bulk', protect, verifyLecturer, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId);
    if (!test) return res.status(404).json({ error: "Test configuration not found" });

    // Ensure the lecturer owns this test, or is an admin
    if (test.lecturer.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. You can only add questions to your own tests." });
    }

    const questionsList = req.body.questions;
    if (!Array.isArray(questionsList) || questionsList.length === 0) {
      return res.status(400).json({ error: "Invalid payload. 'questions' field must be a non-empty array." });
    }

    // Format and validate questions
    const formattedQuestions = [];
    for (const q of questionsList) {
      if (!q.questionText || !q.correctAnswer) {
        return res.status(400).json({ error: "Each question must contain 'questionText' and 'correctAnswer'." });
      }
      formattedQuestions.push({
        test: req.params.testId,
        questionText: q.questionText,
        options: q.options || [],
        correctAnswer: q.correctAnswer
      });
    }

    const savedQuestions = await Question.insertMany(formattedQuestions);
    res.status(201).json({
      success: true,
      message: `${savedQuestions.length} questions successfully imported.`,
      questions: savedQuestions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/tests/questions/{questionId}:
 *   patch:
 *     summary: Edit a question
 *     tags: [CBT Test Engine]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: questionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               questionText:
 *                 type: string
 *               options:
 *                 type: array
 *                 items:
 *                   type: string
 *               correctAnswer:
 *                 type: string
 *     responses:
 *       200:
 *         description: Question updated successfully
 *       403:
 *         description: Access denied (not the owner or admin)
 *       404:
 *         description: Question or test not found
 */
// Edit a Question
router.patch('/questions/:questionId', protect, verifyLecturer, async (req, res) => {
  try {
    const question = await Question.findById(req.params.questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });

    const test = await Test.findById(question.test);
    if (!test) return res.status(404).json({ error: "Test configuration not found" });

    // Verify ownership
    if (test.lecturer.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. You can only modify questions for your own tests." });
    }

    const { questionText, options, correctAnswer } = req.body;
    const updatedQuestion = await Question.findByIdAndUpdate(
      req.params.questionId,
      { $set: { questionText, options, correctAnswer } },
      { new: true, runValidators: true }
    );

    res.json({ success: true, message: "Question updated successfully", question: updatedQuestion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/tests/questions/{questionId}:
 *   delete:
 *     summary: Delete a question
 *     tags: [CBT Test Engine]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: questionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Question deleted successfully
 *       403:
 *         description: Access denied (not the owner or admin)
 *       404:
 *         description: Question or test not found
 */
// Delete a Question
router.delete('/questions/:questionId', protect, verifyLecturer, async (req, res) => {
  try {
    const question = await Question.findById(req.params.questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });

    const test = await Test.findById(question.test);
    if (!test) return res.status(404).json({ error: "Test configuration not found" });

    // Verify ownership
    if (test.lecturer.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. You can only delete questions from your own tests." });
    }

    await Question.findByIdAndDelete(req.params.questionId);
    res.json({ success: true, message: "Question deleted from test database" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PART 3: STUDENT TEST ENGINE
// ==========================================

// Interpret date-only values as local calendar dates and accept 12h or 24h times.
const getLocalDateTime = (dateField, timeStr) => {
  const dateKey = typeof dateField === 'string'
    ? dateField.slice(0, 10)
    : '';
  const dateParts = /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
    ? dateKey.split('-').map(Number)
    : (() => {
        const date = new Date(dateField);
        return Number.isNaN(date.getTime())
          ? []
          : [date.getFullYear(), date.getMonth() + 1, date.getDate()];
      })();
  if (dateParts.length !== 3 || typeof timeStr !== 'string') return new Date(NaN);

  const timeMatch = timeStr.match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)?$/i);
  if (!timeMatch) return new Date(NaN);
  let hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const ampm = timeMatch[3]?.toUpperCase();

  if (ampm) {
    if (hours < 1 || hours > 12) return new Date(NaN);
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
  } else if (hours > 23) {
    return new Date(NaN);
  }

  const [year, month, day] = dateParts;
  const result = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) {
    return new Date(NaN);
  }
  return result;
};

const isStudent = (user) => user.role === 'student';

const isEnrolledIn = (user, courseId) =>
  Array.isArray(user.enrolledCourses) &&
  user.enrolledCourses.some((id) => String(id) === String(courseId));

// Lecturers and admins may view any test; students only tests of courses they take.
const canAccessCourse = (user, courseId) => !isStudent(user) || isEnrolledIn(user, courseId);

// The questions a test shows, in a stable order, so taking and reviewing agree.
const getTestQuestions = (test) =>
  Question.find({ test: test._id }).sort({ _id: 1 }).limit(test.numberOfQuestions);

const describeCourse = (course) => ({
  courseId: course?._id || null,
  courseCode: course?.courseCode || '',
  courseTitle: course?.title || '',
});

/**
 * @swagger
 * /api/tests/{testId}/questions/student:
 *   get:
 *     summary: Retrieve test questions for students (excluding correctAnswer)
 *     tags: [CBT Test Engine]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: testId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully retrieved questions
 *       400:
 *         description: Test has not started or has expired
 *       404:
 *         description: Test not found
 */
// Get Questions for Student (Excluding correctAnswer)
router.get('/:testId/questions/student', protect, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId).populate('course', 'courseCode title');
    if (!test) return res.status(404).json({ error: "Test configuration not found" });

    if (!canAccessCourse(req.user, test.course?._id)) {
      return res.status(403).json({ error: "You are not enrolled in this course." });
    }

    if (isStudent(req.user) && await Submission.exists({ student: req.user.id, test: test._id })) {
      return res.status(400).json({ error: "You have already submitted this test." });
    }

    // Validate that the test is currently open/running
    const currentTime = new Date();
    const scheduledStart = getLocalDateTime(test.date, test.startTime);
    const scheduledEnd = getLocalDateTime(test.date, test.endTime);
    const gracePeriodMs = 60 * 1000; // 60s grace period

    if (currentTime < scheduledStart) {
      return res.status(400).json({ error: "Test has not started yet." });
    }

    if (currentTime > new Date(scheduledEnd.getTime() + gracePeriodMs)) {
      return res.status(400).json({ error: "Test session has already closed." });
    }

    // Retrieve questions, projecting out correctAnswer
    const questions = await getTestQuestions(test).select('-correctAnswer');

    res.json({
      success: true,
      test: {
        _id: test._id,
        testTitle: test.testTitle,
        testType: test.testType,
        duration: test.duration,
        numberOfQuestions: test.numberOfQuestions,
        marksPerQuestion: test.marksPerQuestion,
        instructions: test.instructions,
        scheduledEnd,
        ...describeCourse(test.course),
      },
      questions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/tests/{testId}/submit:
 *   post:
 *     summary: Submit and auto-grade student answers
 *     tags: [CBT Test Engine]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: testId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [answers]
 *             properties:
 *               answers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [questionId, selectedAnswer]
 *                   properties:
 *                     questionId:
 *                       type: string
 *                       example: 65f324123456789abcdef123
 *                     selectedAnswer:
 *                       type: string
 *                       example: fs
 *     responses:
 *       201:
 *         description: Test graded and saved successfully
 *       400:
 *         description: Double submission or time expired
 *       404:
 *         description: Test not found
 */
// Submit Test Answers & Auto-Grade
router.post('/:testId/submit', protect, async (req, res) => {
  try {
    const testId = req.params.testId;
    const studentId = req.user.id;

    const test = await Test.findById(testId);
    if (!test) return res.status(404).json({ error: "Test configuration not found" });

    if (!isStudent(req.user) || !isEnrolledIn(req.user, test.course)) {
      return res.status(403).json({ error: "Only students enrolled in this course can submit this test." });
    }

    // Check if already submitted
    const existingSubmission = await Submission.findOne({ student: studentId, test: testId });
    if (existingSubmission) {
      return res.status(400).json({ error: "You have already submitted this test." });
    }

    // Validate submission time
    const currentTime = new Date();
    const scheduledStart = getLocalDateTime(test.date, test.startTime);
    const scheduledEnd = getLocalDateTime(test.date, test.endTime);
    const gracePeriodMs = 60 * 1000; // 60s grace period for submission network delay

    if (currentTime < scheduledStart) {
      return res.status(400).json({ error: "Test has not started yet." });
    }

    if (currentTime > new Date(scheduledEnd.getTime() + gracePeriodMs)) {
      return res.status(400).json({ error: "Test session has closed. Submission rejected." });
    }

    // Grade only against the questions this test serves, once per question.
    const questions = await getTestQuestions(test);
    const questionsMap = new Map(questions.map(q => [q._id.toString(), q]));

    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const seen = new Set();
    let score = 0;
    const formattedAnswers = [];

    answers.forEach((ans) => {
      const questionId = String(ans?.questionId || '');
      const question = questionsMap.get(questionId);
      const selected = String(ans?.selectedAnswer ?? '').trim();
      if (!question || !selected || seen.has(questionId)) return;
      seen.add(questionId);

      // Compare answers safely (ignoring case/whitespace)
      if (selected.toLowerCase() === String(question.correctAnswer).trim().toLowerCase()) {
        score += test.marksPerQuestion;
      }
      formattedAnswers.push({ question: question._id, selectedAnswer: selected });
    });

    const totalPossibleScore = test.numberOfQuestions * test.marksPerQuestion;

    const submission = new Submission({
      student: studentId,
      test: testId,
      answers: formattedAnswers,
      score,
      totalPossibleScore
    });

    await submission.save();

    res.status(201).json({
      success: true,
      message: "Test submitted and graded successfully.",
      score,
      totalPossibleScore,
      submissionId: submission._id
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "You have already submitted this test." });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/tests/courses/{courseId}:
 *   get:
 *     summary: Retrieve scheduled tests for a course with calculated status (upcoming, active, closed)
 *     tags: [CBT Test Engine]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tests retrieved successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Course not found
 */
router.get('/courses/:courseId', protect, async (req, res) => {
  try {
    const courseId = req.params.courseId;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ error: "Course not found" });

    if (!canAccessCourse(req.user, courseId)) {
      return res.status(403).json({ error: "Access denied. You are not enrolled in this course." });
    }

    const tests = await Test.find({ course: courseId }).sort({ date: 1 });

    // A student also sees whether they have taken each test, and their score.
    const submissionsByTest = new Map();
    if (isStudent(req.user) && tests.length) {
      const submissions = await Submission.find({
        student: req.user.id,
        test: { $in: tests.map((test) => test._id) },
      }).select('test score totalPossibleScore createdAt');
      submissions.forEach((submission) => submissionsByTest.set(String(submission.test), submission));
    }

    const currentTime = new Date();
    const formattedTests = tests.map(test => {
      const scheduledStart = getLocalDateTime(test.date, test.startTime);
      const scheduledEnd = getLocalDateTime(test.date, test.endTime);

      let status = "upcoming";
      if (currentTime >= scheduledStart && currentTime <= scheduledEnd) {
        status = "active";
      } else if (currentTime > scheduledEnd) {
        status = "closed";
      }

      const submission = submissionsByTest.get(String(test._id));
      return {
        _id: test._id,
        testTitle: test.testTitle,
        testType: test.testType,
        date: test.date,
        startTime: test.startTime,
        endTime: test.endTime,
        duration: test.duration,
        numberOfQuestions: test.numberOfQuestions,
        marksPerQuestion: test.marksPerQuestion,
        instructions: test.instructions,
        scheduledStart,
        scheduledEnd,
        status,
        ...describeCourse(course),
        submission: submission ? {
          score: submission.score,
          totalPossibleScore: submission.totalPossibleScore,
          submittedAt: submission.createdAt,
        } : null,
      };
    });

    res.json({ success: true, tests: formattedTests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/tests/{testId}/results:
 *   get:
 *     summary: Retrieve test review details (questions, selected answers, and correct answers) for a student
 *     tags: [CBT Test Engine]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: testId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Test results retrieved successfully
 *       400:
 *         description: Cannot review active test before submitting
 *       404:
 *         description: Test or submission not found
 */
router.get('/:testId/results', protect, async (req, res) => {
  try {
    const testId = req.params.testId;
    const studentId = req.user.id;

    const test = await Test.findById(testId).populate('course', 'courseCode title');
    if (!test) return res.status(404).json({ error: "Test configuration not found" });

    if (!canAccessCourse(req.user, test.course?._id)) {
      return res.status(403).json({ error: "You are not enrolled in this course." });
    }

    // A student may see the correct answers once they have submitted,
    // or once the test session has fully closed.
    const submission = await Submission.findOne({ student: studentId, test: testId });

    const currentTime = new Date();
    const scheduledEnd = getLocalDateTime(test.date, test.endTime);
    const isClosed = currentTime > new Date(scheduledEnd.getTime() + 60 * 1000);

    if (!submission && !isClosed) {
      return res.status(400).json({ error: "You cannot review the results of this test until you submit or the test session closes." });
    }

    const questions = await getTestQuestions(test);

    // Map student's selected answers (stored per answer as `question`)
    const studentAnswersMap = new Map();
    (submission?.answers || []).forEach((ans) => {
      if (ans.question) studentAnswersMap.set(String(ans.question), ans.selectedAnswer);
    });

    const review = questions.map((q) => {
      const selectedAnswer = studentAnswersMap.get(q._id.toString()) ?? null;
      const isCorrect = selectedAnswer !== null &&
        String(selectedAnswer).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase();

      return {
        questionId: q._id,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        selectedAnswer,
        isCorrect
      };
    });

    res.json({
      success: true,
      testTitle: test.testTitle,
      testType: test.testType,
      duration: test.duration,
      ...describeCourse(test.course),
      score: submission ? submission.score : 0,
      totalPossibleScore: test.numberOfQuestions * test.marksPerQuestion,
      submittedAt: submission ? submission.createdAt : null,
      missed: !submission,
      correctCount: review.filter((item) => item.isCorrect).length,
      answeredCount: review.filter((item) => item.selectedAnswer !== null).length,
      review
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;