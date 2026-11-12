const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const { protect } = require('../middleware/authMiddleware');

function timeToMinutes(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (period) {
    if (hours < 1 || hours > 12) return null;
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

function isValidEventTimeRange(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return start !== null && end !== null && end > start;
}


/**
 * @swagger
 * tags:
 *   - name: Events
 *     description: Calendar and Schedule management for Lecturers and Students
 */

/**
 * @swagger
 * /api/events/create:
 *   post:
 *     summary: Create a new calendar event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - course
 *               - locationType
 *               - locationDetails
 *               - date
 *               - startTime
 *               - endTime
 *             properties:
 *               title:
 *                 type: string
 *                 example: CSC 201 Mid-Semester Test
 *               course:
 *                 type: string
 *                 description: MongoDB Object ID of the course
 *                 example: 65f123456789abcdef123456
 *               frequency:
 *                 type: string
 *                 enum: [once, weekly, monthly]
 *                 example: once
 *               recurrenceEndDate:
 *                 type: string
 *                 format: date
 *                 description: Required for weekly or monthly events; the final date on which the event occurs.
 *                 example: 2026-12-15
 *               locationType:
 *                 type: string
 *                 enum: [online, physical]
 *                 example: physical
 *               locationDetails:
 *                 type: string
 *                 description: Classroom hall name or meeting link
 *                 example: ETF Hall Room 2
 *               instruction:
 *                 type: string
 *                 example: Bring your ID cards and scientific calculators.
 *               date:
 *                 type: string
 *                 format: date
 *                 example: 2026-06-15
 *               startTime:
 *                 type: string
 *                 example: 09:00 AM
 *               endTime:
 *                 type: string
 *                 example: 11:00 AM
 *     responses:
 *       201:
 *         description: Event added to calendar successfully
 *       400:
 *         description: Missing required fields
 *       403:
 *         description: Access denied. Lecturers and Admins only.
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: Get calendar events
 *     description: Admins/Lecturers see all events. Students see a filtered view if implemented.
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of events retrieved successfully
 *       500:
 *         description: Server error
 */

// @route   POST /api/events/create
// @desc    Create a calendar event (Lecturers & Admins only)

router.post('/create', protect, async (req, res) => {
  try {
    // Restrict to lecturers and admins
    if (req.user.role !== 'lecturer' && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. Only lecturers can add events." });
    }

    const {
      title,
      course,
      frequency = 'once',
      recurrenceEndDate,
      locationType,
      locationDetails,
      instruction,
      date,
      startTime,
      endTime
    } = req.body;

    // Basic validation
    if (!title || !course || !locationType || !locationDetails || !date || !startTime || !endTime) {
      return res.status(400).json({ error: "Please fill all required fields." });
    }

    if (Number.isNaN(new Date(date).getTime()) || !isValidEventTimeRange(startTime, endTime)) {
      return res.status(400).json({ error: "Provide a valid event date and an end time after the start time." });
    }

    if (!['once', 'weekly', 'monthly'].includes(frequency)) {
      return res.status(400).json({ error: "Frequency must be once, weekly, or monthly." });
    }

    if (frequency !== 'once' &&
      (!recurrenceEndDate ||
        Number.isNaN(new Date(recurrenceEndDate).getTime()) ||
        new Date(recurrenceEndDate) < new Date(date))) {
      return res.status(400).json({ error: "Recurring events require an end date on or after the event date." });
    }

    const newEvent = new Event({
      title,
      course,
      lecturer: req.user.id, // Pulled dynamically from the JWT token
      frequency,
      recurrenceEndDate: frequency === 'once' ? undefined : recurrenceEndDate,
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

// @route   PUT /api/events/:id
// @desc    Update a calendar event (Lecturers & Admins only)
router.put('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'lecturer' && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. Only lecturers can update events." });
    }
    const { title, course, frequency, recurrenceEndDate, locationType, locationDetails, instruction, date, startTime, endTime } = req.body;
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }
    
    if (title) event.title = title;
    if (course) event.course = course;
    if (frequency) {
      if (!['once', 'weekly', 'monthly'].includes(frequency)) {
        return res.status(400).json({ error: "Frequency must be once, weekly, or monthly." });
      }
      event.frequency = frequency;
    }
    if (event.frequency === 'once') {
      event.recurrenceEndDate = undefined;
    } else if (recurrenceEndDate) {
      if (Number.isNaN(new Date(recurrenceEndDate).getTime())) {
        return res.status(400).json({ error: "Provide a valid recurrence end date." });
      }
      event.recurrenceEndDate = recurrenceEndDate;
    }
    if (locationType) event.locationType = locationType;
    if (locationDetails) event.locationDetails = locationDetails;
    if (instruction) event.instruction = instruction;
    if (date) event.date = date;
    if (startTime) event.startTime = startTime;
    if (endTime) event.endTime = endTime;

    if (Number.isNaN(new Date(event.date).getTime()) ||
      !isValidEventTimeRange(event.startTime, event.endTime)) {
      return res.status(400).json({ error: "Provide a valid event date and an end time after the start time." });
    }

    if (event.frequency !== 'once' &&
      (!event.recurrenceEndDate ||
        Number.isNaN(new Date(event.recurrenceEndDate).getTime()) ||
        new Date(event.recurrenceEndDate) < new Date(event.date))) {
      return res.status(400).json({ error: "Recurring events require an end date on or after the event date." });
    }

    await event.save();
    res.status(200).json({ success: true, message: "Event updated successfully!", event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   DELETE /api/events/:id
// @desc    Delete a calendar event (Lecturers & Admins only)
router.delete('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'lecturer' && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. Only lecturers can delete events." });
    }
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }
    res.status(200).json({ success: true, message: "Event deleted successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;