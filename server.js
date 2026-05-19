const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
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