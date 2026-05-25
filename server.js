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
const { generateDownloadUrl } = require('./src/utils/s3Helpers');
const upload = require('./src/middleware/upload');

const app = express();
const authRoutes = require('./src/routes/auth');
const courseRoutes = require('./src/routes/course');
const statsRoutes = require('./src/routes/stats');

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
        url: 'http://localhost:5000',
        description: 'Development server',
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
  apis: ['./src/routes/*.js', './server.js'], // Paths to files containing OpenAPI definitions
};

const specs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/stats', statsRoutes);

// ⚠️ You had MONGO_URI here but logged MONGODB_URI — pick one and match your .env
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("UNIOSUN Database Connected!"))
  .catch(err => console.error("Database Connection Error:", err));

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
app.post('/api/courses/:courseCode/upload', upload.single('material'), async (req, res) => {
  try {
    const { courseCode } = req.params;
    const { title } = req.body;

    const course = await Course.findOneAndUpdate(
      { courseCode },
      { $push: { materials: { title, s3Key: req.file.key } } },
      { returnDocument: 'after', upsert: true }
    );

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`UNIOSUN LMS Backend running on port ${PORT}`));

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 profileImage:
 *                   type: string
 *       400:
 *         description: Invalid file or missing image
 *       403:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
app.put(
  '/upload-photo/:id',
  protect,
  upload.single('image'),
  async (req, res) => {
    try {

      const user = await User.findById(req.params.id);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // ownership check
      if (
        req.user.id !== user._id.toString() &&
        req.user.role !== 'admin'
      ) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No image uploaded" });
      }

      // enforce 200KB again (double safety)
      if (req.file.size > 200 * 1024) {
        return res.status(400).json({
          error: "Image must be less than 200KB"
        });
      }

      // create unique filename
      const fileName = `profile/${user._id}-${crypto.randomUUID()}`;

      // upload to S3
      const imageUrl = await uploadToS3(
        req.file.buffer,
        fileName,
        req.file.mimetype
      );

      user.profileImage = imageUrl;

      await user.save();

      res.json({
        message: "Profile photo updated",
        profileImage: imageUrl
      });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/auth/remove-photo/{id}:
 *   put:
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       403:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
app.put('/remove-photo/:id', protect, async (req, res) => {
  try {

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (
      req.user.id !== user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    user.profileImage = null;
    await user.save();

    res.json({ message: "Profile photo removed" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});