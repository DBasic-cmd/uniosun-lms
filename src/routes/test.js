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
 *                 enum: [multiple-choice, theory]
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
    const newTest = new Test({ ...req.body, lecturer: req.user.id });
    await newTest.save();
    res.status(201).json({ success: true, message: "Test scheduled successfully", test: newTest });
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
    const test = await Test.findById(req.params.testId);
    if (!test) return res.status(404).json({ error: "Test configuration not found" });

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
    const questions = await Question.find({ test: req.params.testId })
      .select('-correctAnswer')
      .limit(test.numberOfQuestions);

    res.json({ success: true, questions });
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

    // Check if already submitted
    const existingSubmission = await Submission.findOne({ student: studentId, test: testId });
    if (existingSubmission) {
      return res.status(400).json({ error: "You have already submitted this test." });
    }

    const test = await Test.findById(testId);
    if (!test) return res.status(404).json({ error: "Test configuration not found" });

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

    // Retrieve the questions for this test to fetch correct answers
    const questions = await Question.find({ test: testId });
    const questionsMap = new Map(questions.map(q => [q._id.toString(), q]));

    const answers = req.body.answers || [];
    let score = 0;

    const formattedAnswers = answers.map(ans => {
      const question = questionsMap.get(ans.questionId);
      if (question) {
        // Compare answers safely (ignoring case/whitespace)
        const studentAns = String(ans.selectedAnswer).trim().toLowerCase();
        const correctAns = String(question.correctAnswer).trim().toLowerCase();
        if (studentAns === correctAns) {
          score += test.marksPerQuestion;
        }
      }
      return {
        question: ans.questionId,
        selectedAnswer: ans.selectedAnswer
      };
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

    // Check course access
    const isEnrolled = req.user.role === 'admin' || req.user.role === 'lecturer' ||
      (req.user.enrolledCourses && req.user.enrolledCourses.some(id => id.toString() === courseId.toString()));

    if (!isEnrolled) {
      return res.status(403).json({ error: "Access denied. You are not enrolled in this course." });
    }

    const tests = await Test.find({ course: courseId }).sort({ date: 1 });

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

      return {
        _id: test._id,
        testTitle: test.testTitle,
        testType: test.testType,
        date: test.date,
        startTime: test.startTime,
        endTime: test.endTime,
        numberOfQuestions: test.numberOfQuestions,
        marksPerQuestion: test.marksPerQuestion,
        instructions: test.instructions,
        scheduledStart,
        scheduledEnd,
        status
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

    const test = await Test.findById(testId);
    if (!test) return res.status(404).json({ error: "Test configuration not found" });

    // Validate if the student is allowed to review
    // They are only allowed to see correct answers if:
    // 1. They have already submitted the test.
    // 2. Or the test session has fully closed.
    const submission = await Submission.findOne({ student: studentId, test: testId });
    
    const currentTime = new Date();
    const scheduledEnd = getLocalDateTime(test.date, test.endTime);
    const isClosed = currentTime > new Date(scheduledEnd.getTime() + 60 * 1000);

    if (!submission && !isClosed) {
      return res.status(400).json({ error: "You cannot review the results of this test until you submit or the test session closes." });
    }

    // Retrieve all questions for this test (including correctAnswer)
    const questions = await Question.find({ test: testId });

    // Map student's selected answers
    const studentAnswersMap = new Map();
    if (submission && submission.answers) {
      submission.answers.forEach(ans => {
        studentAnswersMap.set(ans.questionId.toString(), ans.selectedAnswer);
      });
    }

    const review = questions.map(q => {
      const selectedAnswer = studentAnswersMap.get(q._id.toString()) || null;
      // We normalize strings to do a clean case-insensitive comparison or trim comparison
      const isCorrect = selectedAnswer !== null && 
        selectedAnswer.toString().trim().toLowerCase() === q.correctAnswer.toString().trim().toLowerCase();

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
      score: submission ? submission.score : 0,
      totalPossibleScore: test.numberOfQuestions * test.marksPerQuestion,
      submittedAt: submission ? submission.createdAt : null,
      missed: !submission,
      review
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;