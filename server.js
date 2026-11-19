const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { protect, isAdmin } = require('./src/middleware/authMiddleware');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const Course = require('./src/models/Course');
const User = require('./src/models/User'); // Added missing User model import for photo routes
const { generateDownloadUrl } = require('./src/utils/s3Helpers');
const upload = require('./src/middleware/upload');
const crypto = require('crypto'); // Added missing crypto module import

const app = express();

// Route Imports
const authRoutes = require('./src/routes/auth');
const courseRoutes = require('./src/routes/course');
const statsRoutes = require('./src/routes/stats');
const eventRoutes = require('./src/routes/event');
const testRoutes = require('./src/routes/test');
const broadcastRoutes = require('./src/routes/broadcast');
const notificationRoutes = require('./src/routes/notification');
const assignmentRoutes = require('./src/routes/assignment');
const forumRoutes = require('./src/routes/forum');
const institutionRoutes = require('./src/routes/institution');
const facultyRoutes = require('./src/routes/faculty');

// Swagger definition
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'UNIOSUN LMS Backend API',
      version: '1.0.0',
      description: 'API documentation for UNIOSUN Learning Management System Backend',
    },
    servers: [
      {
        url: 'http://localhost:5050',
        description: 'Development server',
      },
      {
        url: 'https://uniosun-lms.onrender.com',
        description: 'Render Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/*.js', './server.js'],
};

const specs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// Global Middlewares
app.use(cors());
app.use(express.json());

// Main App Router Mounting
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/events', eventRoutes); // MOUNTED: Calendar/Events Router
app.use('/api/tests', testRoutes);   // MOUNTED: CBT Test Engine Router
app.use('/api/broadcasts', broadcastRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/forum', forumRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api/faculties', facultyRoutes);

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("UNIOSUN Database Connected!"))
  .catch(err => console.error("Database Connection Error:", err));

// ==========================================
// COURSE UPLOAD ROUTE
// ==========================================

/**
 * @swagger
 * /api/courses/{courseCode}/upload:
 *   post:
 *     summary: Upload material to a course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseCode
 *         required: true
 *         schema:
 *           type: string
 *         description: Course code
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               material:
 *                 type: string
 *                 format: binary
 *               title:
 *                 type: string
 *     responses:
 *       200:
 *         description: Material uploaded successfully
 *       500:
 *         description: Server error
 */
app.post('/api/courses/:courseCode/upload', protect, upload.single('material'), async (req, res) => {
  try {
    if (req.user.role !== 'lecturer' && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only lecturers or institution administrators can upload course materials." });
    }
    const { courseCode } = req.params;
    const {
      title,
      description,
      category,
      week,
      size,
      allowDownload,
      fileName,
      mimeType,
      duration
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "A course material file is required." });
    }

    const course = await Course.findOneAndUpdate(
      { courseCode },
      {
        $push: {
          materials: {
            title,
            s3Key: req.file.key,
            description,
            category,
            week: Number(week || 10),
            size,
            allowDownload: allowDownload === 'true' || allowDownload === true,
            fileName: fileName || req.file.originalname,
            mimeType: mimeType || req.file.mimetype,
            duration
          }
        }
      },
      { returnDocument: "after" }
    );
    if (!course) {
      return res.status(404).json({ error: "Course not found in this institution." });
    }

    const tempUrl = await generateDownloadUrl(req.file.key);

    res.json({
      message: `Material added to ${courseCode}`,
      viewableUrl: tempUrl,
      course
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET presigned download URL for course materials
app.get('/api/courses/material/download', protect, async (req, res) => {
  try {
    const { key, download } = req.query;
    if (!key) {
      return res.status(400).json({ error: "S3 Key is required" });
    }
    const material = await Course.findOne({ 'materials.s3Key': key }).select('_id');
    if (!material) {
      return res.status(404).json({ error: "Course material not found in this institution." });
    }
    const isDownload = download === 'true';
    const downloadUrl = await generateDownloadUrl(key, isDownload);
    res.json({ downloadUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PROFILE IMAGE MANAGEMENT ROUTES
// ==========================================

/**
 * @swagger
 * /api/auth/upload-photo/{id}:
 *   put:
 *     summary: Upload or update user profile photo
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Profile image file (max 200KB)
 *     responses:
 *       200:
 *         description: Profile photo updated successfully
 *       400:
 *         description: Invalid file or missing image
 *       403:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
// Prefixed with /api/auth to match your Swagger specification
// Check who is uploading before anything is sent to S3.
async function canChangePhoto(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: "User not found" });
    }
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (req.user.id !== user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Unauthorized" });
    }
    req.photoOwner = user;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

app.put(
  '/api/auth/upload-photo/:id',
  protect,
  canChangePhoto,
  upload.uploadProfilePhoto,
  async (req, res) => {
    try {
      const user = req.photoOwner;

      if (!req.file) {
        return res.status(400).json({ error: "No image uploaded" });
      }

      user.profileImage = req.file.key;
      await user.save();

      const tempUrl = await generateDownloadUrl(req.file.key);

      res.json({
        message: "Profile photo updated",
        profileImage: tempUrl
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/auth/remove-photo/{id}:
 *   delete:
 *     summary: Remove user profile photo
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Profile photo removed successfully
 *       403:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
// Prefixed with /api/auth to match your Swagger specification
app.delete('/api/auth/remove-photo/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (req.user.id !== user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Unauthorized" });
    }

    user.profileImage = null;
    await user.save();

    res.json({ message: "Profile photo removed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`UNIOSUN LMS Backend running on port ${PORT}`));