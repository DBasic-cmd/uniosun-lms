const express = require('express');
const router = express.Router();
const Test = require('../models/Test');
const Question = require('../models/Question');
const { protect } = require('../middleware/authMiddleware');


/**
 * @swagger
 * tags:
 * name: CBT Test Engine
 * description: Examination and Question Management for Lecturers
 */

/**
 * @swagger
 * /api/tests/settings:
 * post:
 * summary: Configure and schedule a test session
 * tags: [CBT Test Engine]
 * security:
 * - bearerAuth: []
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * required: [course, testTitle, testType, date, startTime, endTime, numberOfQuestions, marksPerQuestion]
 * properties:
 * course:
 * type: string
 * example: 65f123456789abcdef123456
 * testTitle:
 * type: string
 * example: Harmattan Semester Test 1
 * testType:
 * type: string
 * enum: [multiple-choice, theory]
 * date:
 * type: string
 * format: date
 * example: 2026-06-20
 * startTime:
 * type: string
 * example: "10:00 AM"
 * endTime:
 * type: string
 * example: "11:00 AM"
 * numberOfQuestions:
 * type: number
 * example: 20
 * marksPerQuestion:
 * type: number
 * example: 2
 * instructions:
 * type: string
 * example: "Answer all questions. Strict monitoring enabled."
 */

/**
 * @swagger
 * /api/tests/{testId}/questions:
 * post:
 * summary: Add a question to an existing test configuration
 * tags: [CBT Test Engine]
 * security:
 * - bearerAuth: []
 * parameters:
 * - in: path
 * name: testId
 * required: true
 * schema:
 * type: string
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * required: [questionText, correctAnswer]
 * properties:
 * questionText:
 * type: string
 * example: "What is the primary core module used for handling network events in Node.js?"
 * options:
 * type: array
 * items:
 * type: string
 * example: ["fs", "http", "crypto", "path"]
 * correctAnswer:
 * type: string
 * description: "The index value or plain text answer matching the option pattern"
 * example: "1"
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

// Edit a Question
router.patch('/questions/:questionId', protect, verifyLecturer, async (req, res) => {
  try {
    const { questionText, options, correctAnswer } = req.body;
    const updatedQuestion = await Question.findByIdAndUpdate(
      req.params.questionId,
      { $set: { questionText, options, correctAnswer } },
      { new: true, runValidators: true }
    );

    if (!updatedQuestion) return res.status(404).json({ error: "Question not found" });
    res.json({ success: true, message: "Question updated successfully", question: updatedQuestion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a Question
router.delete('/questions/:questionId', protect, verifyLecturer, async (req, res) => {
  try {
    const question = await Question.findByIdAndDelete(req.params.questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });
    res.json({ success: true, message: "Question deleted from test database" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;