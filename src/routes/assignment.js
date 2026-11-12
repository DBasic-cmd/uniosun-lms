const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Assignment = require('../models/Assignment');
const Course = require('../models/Course');
const Group = require('../models/Group');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

// Helper middleware to verify lecturer role
const verifyLecturer = (req, res, next) => {
  if (req.user.role !== 'lecturer' && req.user.role !== 'admin') {
    return res.status(403).json({ error: "Access denied. Lecturers only." });
  }
  next();
};

// Helper function to generate a readable 6-character uppercase alphanumeric code
const generateGroupCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes confusing characters: O, 0, I, 1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * @swagger
 * tags:
 *   - name: Assignments & Collaboration
 *     description: Assignment distribution, group formation, and submission management
 */

// ==========================================
// LECTURER ROUTES
// ==========================================

/**
 * @swagger
 * /api/assignments:
 *   post:
 *     summary: Create a new assignment
 *     tags: [Assignments & Collaboration]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [course, title, dueDate]
 *             properties:
 *               course:
 *                 type: string
 *                 example: 65f123456789abcdef123456
 *               title:
 *                 type: string
 *                 example: Data Structures Assignment 1
 *               description:
 *                 type: string
 *                 example: Implement a binary search tree in C++.
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-06-30T23:59:00.000Z
 *               attachmentUrl:
 *                 type: string
 *                 example: https://s3.amazonaws.com/uniosun-lms/course-materials/template.pdf
 *               isGroupAssignment:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Assignment created successfully
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.post('/', protect, verifyLecturer, async (req, res) => {
  try {
    const rawCourse = req.body.course || req.body.courseId;
    if (!rawCourse) {
      return res.status(400).json({ error: "Course or courseId is required." });
    }

    let courseDoc = null;
    if (mongoose.Types.ObjectId.isValid(rawCourse)) {
      courseDoc = await Course.findById(rawCourse);
    }
    if (!courseDoc && rawCourse) {
      courseDoc = await Course.findOne({
        courseCode: String(rawCourse).toUpperCase().replace(/\s+/g, '')
      });
    }

    const courseId = courseDoc ? courseDoc._id : rawCourse;
    const courseCode = courseDoc ? courseDoc.courseCode : (req.body.courseCode || "");

    let parsedDueDate;
    if (req.body.dueDate) {
      if (req.body.dueTime && typeof req.body.dueDate === 'string' && !req.body.dueDate.includes('T')) {
        parsedDueDate = new Date(`${req.body.dueDate}T${req.body.dueTime || '23:59'}:00`);
      } else {
        parsedDueDate = new Date(req.body.dueDate);
      }
    } else {
      parsedDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const isGroup = req.body.isGroupAssignment === true || req.body.type === 'grouped' || req.body.type === 'group';

    const newAssignment = new Assignment({
      ...req.body,
      course: courseId,
      courseCode,
      title: req.body.title,
      description: req.body.description,
      dueDate: parsedDueDate,
      dueTime: req.body.dueTime || '23:59',
      isGroupAssignment: isGroup,
      type: isGroup ? 'grouped' : 'individual',
      groupMethod: req.body.groupMethod || 'student_choose',
      groupSize: Number(req.body.groupSize) || 4,
      submissionType: req.body.submissionType || 'File Upload',
      totalMarks: Number(req.body.totalMarks) || 20,
      status: req.body.status || 'Published',
      createdBy: req.user.id
    });
    await newAssignment.save();

    // Automatic Group Partitioning Logic
    if (newAssignment.isGroupAssignment && newAssignment.groupMethod !== 'student_choose') {
      const groupSize = newAssignment.groupSize || 4;

      // Find all students enrolled in this course
      const students = await User.find({ role: 'student', enrolledCourses: courseId });

      if (students.length > 0) {
        let groupChunks = [];

        if (newAssignment.groupMethod === 'system_auto') {
          // Shuffle randomly
          const shuffled = [...students].sort(() => Math.random() - 0.5);
          // Partition into chunks
          for (let i = 0; i < shuffled.length; i += groupSize) {
            groupChunks.push(shuffled.slice(i, i + groupSize));
          }
        } else if (newAssignment.groupMethod === 'matric_last_digit') {
          // Group by the last digit of the student matric number (identifier)
          const digitGroups = {};
          students.forEach(student => {
            const matric = student.identifier || "";
            const match = matric.match(/(\d)$/);
            const digit = match ? match[1] : "0";
            if (!digitGroups[digit]) digitGroups[digit] = [];
            digitGroups[digit].push(student);
          });
          groupChunks = Object.values(digitGroups);
        }

        // Save generated groups to database
        for (let i = 0; i < groupChunks.length; i++) {
          const chunk = groupChunks[i];
          const memberIds = chunk.map(s => s._id);
          const leaderId = memberIds[0]; // Set the first student as the group leader

          // Generate a unique 6-character uppercase code
          let code;
          let codeExists = true;
          while (codeExists) {
            code = generateGroupCode();
            const duplicate = await Group.findOne({ code });
            if (!duplicate) codeExists = false;
          }

          const newGroup = new Group({
            assignment: newAssignment._id,
            leader: leaderId,
            members: memberIds,
            code
          });
          await newGroup.save();
        }
      }
    }

    res.status(201).json({ success: true, message: "Assignment published successfully", assignment: newAssignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/assignments/{assignmentId}/submissions:
 *   get:
 *     summary: Fetch all submissions for a specific assignment
 *     tags: [Assignments & Collaboration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Submissions retrieved successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Assignment not found
 */
router.put('/:assignmentId', protect, verifyLecturer, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.assignmentId);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });
    if (assignment.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. You can only edit your own assignments." });
    }

    const updateData = { ...req.body };
    if (req.body.dueDate) {
      if (req.body.dueTime && typeof req.body.dueDate === 'string' && !req.body.dueDate.includes('T')) {
        updateData.dueDate = new Date(`${req.body.dueDate}T${req.body.dueTime || '23:59'}:00`);
      } else {
        updateData.dueDate = new Date(req.body.dueDate);
      }
    }

    const updated = await Assignment.findByIdAndUpdate(req.params.assignmentId, updateData, { new: true });
    res.json({ success: true, assignment: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:assignmentId', protect, verifyLecturer, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.assignmentId);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });
    if (assignment.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. You can only delete your own assignments." });
    }

    await Assignment.findByIdAndDelete(req.params.assignmentId);
    res.json({ success: true, message: "Assignment deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:assignmentId/submissions', protect, verifyLecturer, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.assignmentId);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    // Optional ownership validation
    if (assignment.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. You can only view submissions for your own assignments." });
    }

    const submissions = await AssignmentSubmission.find({ assignment: req.params.assignmentId })
      .populate('student', 'name identifier email')
      .populate({
        path: 'group',
        populate: [
          { path: 'leader', select: 'name identifier email' },
          { path: 'members', select: 'name identifier email' }
        ]
      });

    res.json({ success: true, submissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/assignments/submissions/{submissionId}/grade:
 *   post:
 *     summary: Grade a student or group assignment submission
 *     tags: [Assignments & Collaboration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: submissionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [score]
 *             properties:
 *               score:
 *                 type: number
 *                 example: 85
 *               feedback:
 *                 type: string
 *                 example: Excellent work, but document naming could be improved.
 *     responses:
 *       200:
 *         description: Submission graded successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Submission not found
 */
router.post('/submissions/:submissionId/grade', protect, verifyLecturer, async (req, res) => {
  try {
    const { score, feedback } = req.body;

    const submission = await AssignmentSubmission.findById(req.params.submissionId);
    if (!submission) return res.status(404).json({ error: "Submission not found" });

    // Verify assignment exists and lecturer has access
    const assignment = await Assignment.findById(submission.assignment);
    if (!assignment) return res.status(404).json({ error: "Associated assignment not found" });

    if (assignment.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. You can only grade submissions for your own assignments." });
    }

    submission.score = score;
    submission.feedback = feedback;
    await submission.save();

    res.json({ success: true, message: "Submission graded successfully", submission });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// STUDENT ROUTES - COLLABORATION & SUBMISSIONS
// ==========================================

/**
 * @swagger
 * /api/assignments/{assignmentId}/groups:
 *   post:
 *     summary: Create a student group for a group assignment (generates join code)
 *     tags: [Assignments & Collaboration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Group created successfully
 *       400:
 *         description: Already in a group or not a group assignment
 */
router.post('/:assignmentId/groups', protect, async (req, res) => {
  try {
    const assignmentId = req.params.assignmentId;
    const studentId = req.user.id;

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    if (!assignment.isGroupAssignment) {
      return res.status(400).json({ error: "This assignment is not configured as a group assignment." });
    }

    // Check if student is already in a group for this assignment
    const existingGroup = await Group.findOne({ assignment: assignmentId, members: studentId });
    if (existingGroup) {
      return res.status(400).json({ error: "You are already a member of a group for this assignment." });
    }

    // Generate unique group code
    let code;
    let codeExists = true;
    while (codeExists) {
      code = generateGroupCode();
      const duplicate = await Group.findOne({ code });
      if (!duplicate) codeExists = false;
    }

    const newGroup = new Group({
      assignment: assignmentId,
      leader: studentId,
      members: [studentId],
      code
    });

    await newGroup.save();

    res.status(201).json({
      success: true,
      message: "Group created successfully. Share the code with team members to join.",
      group: newGroup
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/assignments/{assignmentId}/groups/join:
 *   post:
 *     summary: Join an existing group using its alphanumeric code
 *     tags: [Assignments & Collaboration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *                 example: GP7X2K
 *     responses:
 *       200:
 *         description: Successfully joined the group
 *       400:
 *         description: Invalid code, already in a group, or not a group assignment
 */
router.post('/:assignmentId/groups/join', protect, async (req, res) => {
  try {
    const { code } = req.body;
    const assignmentId = req.params.assignmentId;
    const studentId = req.user.id;

    if (!code) return res.status(400).json({ error: "Group code is required." });

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    if (!assignment.isGroupAssignment) {
      return res.status(400).json({ error: "This assignment is not configured as a group assignment." });
    }

    // Check if student is already in a group for this assignment
    const existingGroup = await Group.findOne({ assignment: assignmentId, members: studentId });
    if (existingGroup) {
      return res.status(400).json({ error: "You are already a member of a group for this assignment." });
    }

    // Find the group with the corresponding code and assignment
    const group = await Group.findOne({ code: code.toUpperCase().trim(), assignment: assignmentId });
    if (!group) {
      return res.status(400).json({ error: "Invalid group code for this assignment." });
    }

    // Add student to members list
    group.members.push(studentId);
    await group.save();

    res.json({
      success: true,
      message: "Successfully joined the group.",
      group
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/assignments/{assignmentId}/groups/my-group:
 *   get:
 *     summary: Retrieve active group details for the logged-in student
 *     tags: [Assignments & Collaboration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Group details retrieved
 *       404:
 *         description: Group not found
 */
router.get('/:assignmentId/groups/my-group', protect, async (req, res) => {
  try {
    const group = await Group.findOne({
      assignment: req.params.assignmentId,
      members: req.user.id
    })
    .populate('leader', 'name identifier email')
    .populate('members', 'name identifier email');

    if (!group) {
      return res.status(404).json({ error: "You are not in a group for this assignment." });
    }

    res.json({ success: true, group });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/assignments/{assignmentId}/submit:
 *   post:
 *     summary: Submit assignment file (Only group leader can submit group assignments)
 *     tags: [Assignments & Collaboration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Assignment submitted successfully
 *       400:
 *         description: Overdue deadline, already submitted, or group setup issues
 *       403:
 *         description: Submitting user is not the group leader
 */
router.post('/:assignmentId/submit', protect, upload.single('file'), async (req, res) => {
  try {
    const assignmentId = req.params.assignmentId;
    const studentId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ error: "Please upload an assignment document." });
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    // Validate deadline
    if (new Date() > new Date(assignment.dueDate)) {
      return res.status(400).json({ error: "The deadline for this assignment has passed." });
    }

    let submissionPayload = {
      assignment: assignmentId,
      fileUrl: req.file.location, // S3 URL returned by Multer-S3 middleware
      submittedBy: studentId
    };

    if (assignment.isGroupAssignment) {
      // Find group
      const group = await Group.findOne({ assignment: assignmentId, members: studentId });
      if (!group) {
        return res.status(400).json({ error: "You must join or create a group before submitting this assignment." });
      }

      // Enforce: ONLY the group leader is allowed to submit the assignment
      if (group.leader.toString() !== studentId) {
        return res.status(403).json({ error: "Access denied. Only the group leader is allowed to submit the assignment." });
      }

      // Check if group already submitted
      const existingSubmission = await AssignmentSubmission.findOne({ assignment: assignmentId, group: group._id });
      if (existingSubmission) {
        return res.status(400).json({ error: "Your group has already submitted this assignment." });
      }

      submissionPayload.group = group._id;
    } else {
      // Check if student already submitted individually
      const existingSubmission = await AssignmentSubmission.findOne({ assignment: assignmentId, student: studentId });
      if (existingSubmission) {
        return res.status(400).json({ error: "You have already submitted this assignment." });
      }

      submissionPayload.student = studentId;
    }

    const submission = new AssignmentSubmission(submissionPayload);
    await submission.save();

    res.status(201).json({
      success: true,
      message: "Assignment submitted successfully.",
      submission
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/assignments/courses/{courseId}:
 *   get:
 *     summary: Retrieve all assignments for a course
 *     tags: [Assignments & Collaboration]
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
 *         description: List of assignments retrieved successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Course not found
 */
router.get('/courses/:courseId', protect, async (req, res) => {
  try {
    const rawCourseId = req.params.courseId;

    let courseDoc = null;
    if (mongoose.Types.ObjectId.isValid(rawCourseId)) {
      courseDoc = await Course.findById(rawCourseId);
    }
    if (!courseDoc && rawCourseId) {
      courseDoc = await Course.findOne({
        courseCode: String(rawCourseId).toUpperCase().replace(/\s+/g, '')
      });
    }

    const targetCourseId = courseDoc ? courseDoc._id : rawCourseId;

    // Check course access: admin, lecturer, or student enrolled
    let isEnrolled = req.user.role === 'admin' || req.user.role === 'lecturer';
    if (!isEnrolled && Array.isArray(req.user.enrolledCourses)) {
      isEnrolled = req.user.enrolledCourses.some(
        id => id.toString() === targetCourseId.toString() || (rawCourseId && id.toString() === rawCourseId.toString())
      );
    }

    if (!isEnrolled) {
      return res.status(403).json({ error: "Access denied. You are not enrolled in this course." });
    }

    const query = {
      $or: [
        { course: targetCourseId },
        ...(courseDoc ? [{ courseCode: courseDoc.courseCode }] : [])
      ]
    };
    if (mongoose.Types.ObjectId.isValid(rawCourseId)) {
      query.$or.push({ course: rawCourseId });
    }

    const assignments = await Assignment.find(query).sort({ dueDate: 1 });
    res.json({ success: true, assignments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
