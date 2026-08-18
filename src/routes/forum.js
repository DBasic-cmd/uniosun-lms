const express = require('express');
const router = express.Router();
const ForumPost = require('../models/ForumPost');
const ForumComment = require('../models/ForumComment');
const Course = require('../models/Course');
const { protect } = require('../middleware/authMiddleware');
const { Filter } = require('bad-words');

const filter = new Filter();

// Helper to check if a user is authorized to access a course discussion forum
const checkCourseAccess = (user, courseId) => {
  if (user.role === 'admin' || user.role === 'lecturer') return true;
  return user.enrolledCourses && user.enrolledCourses.some(id => id.toString() === courseId.toString());
};

/**
 * @swagger
 * tags:
 *   - name: Course Discussion Forum
 *     description: Discussion threads, announcements, Q&A support, comments, and likes
 */

// ==========================================
// THREADS / POSTS MANAGEMENT
// ==========================================

/**
 * @swagger
 * /api/forum/posts:
 *   post:
 *     summary: Create a new discussion post/thread
 *     tags: [Course Discussion Forum]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [courseId, title, content]
 *             properties:
 *               courseId:
 *                 type: string
 *                 example: 65f123456789abcdef123456
 *               title:
 *                 type: string
 *                 example: Understanding BST Deletion cases
 *               content:
 *                 type: string
 *                 example: Can someone explain how inorder successor works?
 *               postType:
 *                 type: string
 *                 enum: [question, announcement, general]
 *                 default: general
 *                 example: question
 *     responses:
 *       201:
 *         description: Post created successfully
 *       400:
 *         description: Missing fields or invalid postType constraint
 *       403:
 *         description: Access denied (must be enrolled, or student tried to post announcement)
 *       404:
 *         description: Course not found
 */
router.post('/posts', protect, async (req, res) => {
  try {
    const { courseId, title, content, postType, targetType, targetLabel } = req.body;

    if (!courseId || !title || !content) {
      return res.status(400).json({ error: "courseId, title, and content are required." });
    }

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ error: "Course not found" });

    // Validate course access
    if (!checkCourseAccess(req.user, courseId)) {
      return res.status(403).json({ error: "Access denied. You are not enrolled in or teaching this course." });
    }

    const type = postType || 'general';

    // Enforce announcement restriction
    if (type === 'announcement' && req.user.role !== 'lecturer' && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. Only lecturers and admins can publish announcements." });
    }

    const cleanedTitle = filter.clean(title);
    const cleanedContent = filter.clean(content);

    const newPost = new ForumPost({
      course: courseId,
      author: req.user.id,
      title: cleanedTitle,
      content: cleanedContent,
      postType: type,
      targetType: targetType || 'course',
      targetLabel: targetLabel || 'Entire Course'
    });

    await newPost.save();

    // Lecturer notification simulation for questions
    if (type === 'question' && req.user.role === 'student') {
      console.log(`[NOTIFICATION] Course: ${course.courseCode} | Student ${req.user.name} submitted a new question: "${title}". Lecturer has been notified.`);
    }

    res.status(201).json({ success: true, message: "Discussion post published successfully", post: newPost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/forum/courses/{courseId}/posts:
 *   get:
 *     summary: Retrieve discussion threads for a specific course
 *     tags: [Course Discussion Forum]
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
 *         description: List of posts retrieved successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Course not found
 */
router.get('/courses/:courseId/posts', protect, async (req, res) => {
  try {
    const courseId = req.params.courseId;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ error: "Course not found" });

    // Validate course access
    if (!checkCourseAccess(req.user, courseId)) {
      return res.status(403).json({ error: "Access denied. You must be enrolled in or teaching this course." });
    }

    const posts = await ForumPost.find({ course: courseId })
      .populate('author', 'name role profileImage')
      .sort({ createdAt: -1 });

    const postsWithComments = await Promise.all(posts.map(async (post) => {
      const comments = await ForumComment.find({ post: post._id })
        .populate('author', 'name role profileImage')
        .sort({ createdAt: 1 });
      return {
        ...post.toObject(),
        comments
      };
    }));

    res.json({ success: true, posts: postsWithComments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/forum/posts/{postId}:
 *   get:
 *     summary: Fetch details of a single post and its replies/comments
 *     tags: [Course Discussion Forum]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Post details and comments list
 *       404:
 *         description: Post not found
 */
router.get('/posts/:postId', protect, async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.postId)
      .populate('author', 'name role profileImage')
      .populate({
        path: 'officialAnswer',
        populate: { path: 'author', select: 'name role profileImage' }
      });

    if (!post) return res.status(404).json({ error: "Discussion post not found" });

    // Validate course access
    if (!checkCourseAccess(req.user, post.course)) {
      return res.status(403).json({ error: "Access denied." });
    }

    const comments = await ForumComment.find({ post: req.params.postId })
      .populate('author', 'name role profileImage')
      .sort({ createdAt: 1 });

    res.json({ success: true, post, comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/forum/posts/{postId}/like:
 *   post:
 *     summary: Like or unlike a discussion post
 *     tags: [Course Discussion Forum]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Likes count updated successfully
 *       404:
 *         description: Post not found
 */
router.post('/posts/:postId/like', protect, async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: "Post not found" });

    // Validate course access
    if (!checkCourseAccess(req.user, post.course)) {
      return res.status(403).json({ error: "Access denied." });
    }

    const userId = req.user.id;
    const isLiked = post.likes.includes(userId);

    if (isLiked) {
      // Unlike: Remove user ID
      post.likes = post.likes.filter(id => id.toString() !== userId.toString());
    } else {
      // Like: Add user ID
      post.likes.push(userId);
    }

    await post.save();
    res.json({ success: true, liked: !isLiked, likesCount: post.likes.length, likes: post.likes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// COMMENTS / REPLIES MANAGEMENT
// ==========================================

/**
 * @swagger
 * /api/forum/posts/{postId}/comments:
 *   post:
 *     summary: Add a comment/reply to a discussion thread
 *     tags: [Course Discussion Forum]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *                 example: I think you replace it with inorder successor.
 *     responses:
 *       201:
 *         description: Reply comment posted successfully
 *       404:
 *         description: Thread not found
 */
router.post('/posts/:postId/comments', protect, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "Comment content is required." });

    const post = await ForumPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: "Discussion post not found" });

    // Validate course access
    if (!checkCourseAccess(req.user, post.course)) {
      return res.status(403).json({ error: "Access denied." });
    }

    const cleanedContent = filter.clean(content);

    const newComment = new ForumComment({
      post: req.params.postId,
      author: req.user.id,
      content: cleanedContent
    });

    await newComment.save();

    // Increment repliesCount
    post.repliesCount += 1;

    // Pin as official answer if post is a question, comment is by a lecturer/admin, and no official answer is set yet
    if (post.postType === 'question' && (req.user.role === 'lecturer' || req.user.role === 'admin') && !post.officialAnswer) {
      post.officialAnswer = newComment._id;
      post.isAnswered = true;
    }

    await post.save();

    res.status(201).json({ success: true, message: "Reply posted successfully", comment: newComment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/forum/posts/{postId}/resolve:
 *   post:
 *     summary: Set a specific comment as the official answer for a question thread (Lecturers only)
 *     tags: [Course Discussion Forum]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [commentId]
 *             properties:
 *               commentId:
 *                 type: string
 *                 example: 65f324123456789abcdef123
 *     responses:
 *       200:
 *         description: Thread resolved with official answer
 *       403:
 *         description: Access denied (must be lecturer/admin)
 *       404:
 *         description: Post or comment not found
 */
router.post('/posts/:postId/resolve', protect, async (req, res) => {
  try {
    const { commentId } = req.body;
    if (!commentId) return res.status(400).json({ error: "commentId is required." });

    const post = await ForumPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: "Post not found" });

    // Validate that only lecturers/admins can resolve/pin answer
    if (req.user.role !== 'lecturer' && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. Only lecturers and admins can resolve question threads." });
    }

    const comment = await ForumComment.findById(commentId);
    if (!comment || comment.post.toString() !== post._id.toString()) {
      return res.status(404).json({ error: "Associated comment not found." });
    }

    post.officialAnswer = comment._id;
    post.isAnswered = true;
    await post.save();

    res.json({ success: true, message: "Thread resolved with official answer successfully", post });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// MODERATION & DELETION
// ==========================================

/**
 * @swagger
 * /api/forum/posts/{postId}:
 *   delete:
 *     summary: Delete a discussion thread (Author, Lecturer, or Admin only)
 *     tags: [Course Discussion Forum]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Post deleted successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Post not found
 */
router.delete('/posts/:postId', protect, async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: "Discussion post not found" });

    // Allowed if author, lecturer, or admin
    if (post.author.toString() !== req.user.id && req.user.role !== 'lecturer' && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. You do not have permissions to delete this thread." });
    }

    // Delete comments under the post
    await ForumComment.deleteMany({ post: post._id });
    await ForumPost.findByIdAndDelete(post._id);

    res.json({ success: true, message: "Discussion thread and comments deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/forum/comments/{commentId}:
 *   delete:
 *     summary: Delete a comment (Author, Lecturer, or Admin only)
 *     tags: [Course Discussion Forum]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Comment deleted successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Comment not found
 */
router.delete('/comments/:commentId', protect, async (req, res) => {
  try {
    const comment = await ForumComment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    const post = await ForumPost.findById(comment.post);

    // Allowed if author of comment, lecturer, or admin
    if (comment.author.toString() !== req.user.id && req.user.role !== 'lecturer' && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. You do not have permissions to delete this comment." });
    }

    await ForumComment.findByIdAndDelete(comment._id);

    if (post) {
      post.repliesCount = Math.max(0, post.repliesCount - 1);
      
      // If deleted comment was the officialAnswer, clear it
      if (post.officialAnswer && post.officialAnswer.toString() === comment._id.toString()) {
        post.officialAnswer = null;
        post.isAnswered = false;
      }
      await post.save();
    }

    res.json({ success: true, message: "Comment deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
