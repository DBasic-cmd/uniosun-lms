const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const { protect } = require('../middleware/authMiddleware');


/**
 * @swagger
 * tags:
 * name: Events
 * description: Calendar and Schedule management for Lecturers and Students
 */

/**
 * @swagger
 * /api/events/create:
 * post:
 * summary: Create a new calendar event
 * tags: [Events]
 * security:
 * - bearerAuth: []
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * required:
 * - title
 * - course
 * - locationType
 * - locationDetails
 * - date
 * - startTime
 * - endTime
 * properties:
 * title:
 * type: string
 * example: CSC 201 Mid-Semester Test
 * course:
 * type: string
 * description: MongoDB Object ID of the course
 * example: 65f123456789abcdef123456
 * frequency:
 * type: string
 * enum: [once, weekly, monthly]
 * example: once
 * locationType:
 * type: string
 * enum: [online, physical]
 * example: physical
 * locationDetails:
 * type: string
 * description: Classroom hall name or meeting link
 * example: ETF Hall Room 2
 * instruction:
 * type: string
 * example: Bring your ID cards and scientific calculators.
 * date:
 * type: string
 * format: date
 * example: 2026-06-15
 * startTime:
 * type: string
 * example: 09:00 AM
 * endTime:
 * type: string
 * example: 11:00 AM
 * responses:
 * 201:
 * description: Event added to calendar successfully
 * 400:
 * description: Missing required fields
 * 403:
 * description: Access denied. Lecturers and Admins only.
 * 500:
 * description: Server error
 */

/**
 * @swagger
 * /api/events:
 * get:
 * summary: Get calendar events
 * description: Admins/Lecturers see all events. Students see a filtered view if implemented.
 * tags: [Events]
 * security:
 * - bearerAuth: []
 * responses:
 * 200:
 * description: List of events retrieved successfully
 * 500:
 * description: Server error
 */

// @route   POST /api/events/create
// @desc    Create a calendar event (Lecturers & Admins only)

router.post('/create', protect, async (req, res) => {
  try {
    // Restrict to lecturers and admins
    if (req.user.role !== 'lecturer' && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. Only lecturers can add events." });
    }

    const { title, course, frequency, locationType, locationDetails, instruction, date, startTime, endTime } = req.body;

    // Basic validation
    if (!title || !course || !locationType || !locationDetails || !date || !startTime || !endTime) {
      return res.status(400).json({ error: "Please fill all required fields." });
    }

    const newEvent = new Event({
      title,
      course,
      lecturer: req.user.id, // Pulled dynamically from the JWT token
      frequency,
      locationType,
      locationDetails,
      instruction,
      date,
      startTime,
      endTime
    });

    await newEvent.save();

    res.status(201).json({
      success: true,
      message: "Event added to calendar successfully!",
      event: newEvent
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/events
// @desc    Get calendar events (Filtered by student registration or lecturer identity)
router.get('/', protect, async (req, res) => {
  try {
    let query = {};

    // If the user is a student, only find events for courses they are registered for
    if (req.user.role === 'student') {
      // req.user.enrolledCourses is available because our protect middleware fetches the fresh user object from DB
      query = { course: { $in: req.user.enrolledCourses } };
    } 
    
    // Optional: If the user is a lecturer, you could also filter to show only their created events
    // else if (req.user.role === 'lecturer') {
    //   query = { lecturer: req.user.id };
    // }

    const events = await Event.find(query)
      .populate('course', 'courseCode title')
      .populate('lecturer', 'name')
      .sort({ date: 1, startTime: 1 });

    res.status(200).json({
      success: true,
      count: events.length,
      events
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;