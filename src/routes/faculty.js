const express = require('express');
const mongoose = require('mongoose');
const Faculty = require('../models/Faculty');
const Department = require('../models/Department');
const User = require('../models/User');
const Course = require('../models/Course');
const { protect, isAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Faculties
 *     description: An institution's faculties and departments, managed by its administrators
 */

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// Case-insensitive exact match, so "computer science" finds "Computer Science".
function sameName(name) {
  return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
}

// How many users and courses use each department name.
async function departmentUsage() {
  const [users, courses] = await Promise.all([
    User.aggregate([
      { $match: { department: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
    ]),
    Course.aggregate([
      { $match: { department: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
    ]),
  ]);
  const usage = new Map();
  const add = (rows, key) => rows.forEach(({ _id, count }) => {
    const name = cleanName(_id).toLowerCase();
    const entry = usage.get(name) || { name: cleanName(_id), users: 0, courses: 0 };
    entry[key] += count;
    usage.set(name, entry);
  });
  add(users, 'users');
  add(courses, 'courses');
  return usage;
}

function duplicateError(res, error, what) {
  if (error.code === 11000) {
    return res.status(409).json({ error: `A ${what} with this name already exists.` });
  }
  return res.status(500).json({ error: error.message });
}

/**
 * @swagger
 * /api/faculties:
 *   get:
 *     summary: Faculties with their departments, plus department names in use that are not set up yet
 *     tags: [Faculties]
 *     security:
 *       - bearerAuth: []
 *   post:
 *     summary: Create a faculty (institution administrators)
 *     tags: [Faculties]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 */
router.get('/', protect, async (req, res) => {
  try {
    const [faculties, departments, usage] = await Promise.all([
      Faculty.find().sort({ name: 1 }).lean(),
      Department.find().sort({ name: 1 }).lean(),
      departmentUsage(),
    ]);

    const known = new Set(departments.map((d) => d.name.toLowerCase()));
    const unassigned = [...usage.values()]
      .filter((entry) => !known.has(entry.name.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      faculties: faculties.map((faculty) => ({
        _id: faculty._id,
        name: faculty.name,
        departments: departments
          .filter((d) => String(d.faculty) === String(faculty._id))
          .map((d) => ({
            _id: d._id,
            name: d.name,
            users: usage.get(d.name.toLowerCase())?.users || 0,
            courses: usage.get(d.name.toLowerCase())?.courses || 0,
          })),
      })),
      unassigned,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', protect, isAdmin, async (req, res) => {
  try {
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Faculty name is required.' });
    const faculty = await Faculty.create({ name });
    res.status(201).json({ success: true, faculty });
  } catch (error) {
    duplicateError(res, error, 'faculty');
  }
});

/**
 * @swagger
 * /api/faculties/departments/{departmentId}:
 *   patch:
 *     summary: Rename a department or move it to another faculty (institution administrators)
 *     description: Renaming also updates every user and course that uses the old name.
 *     tags: [Faculties]
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     summary: Delete a department that no user or course uses (institution administrators)
 *     tags: [Faculties]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/departments/:departmentId', protect, isAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.departmentId)) return res.status(404).json({ error: 'Department not found.' });
    const department = await Department.findById(req.params.departmentId);
    if (!department) return res.status(404).json({ error: 'Department not found.' });

    const oldName = department.name;
    if (req.body.name !== undefined) {
      const name = cleanName(req.body.name);
      if (!name) return res.status(400).json({ error: 'Department name is required.' });
      department.name = name;
    }
    if (req.body.facultyId !== undefined) {
      if (!isValidId(req.body.facultyId) || !(await Faculty.exists({ _id: req.body.facultyId }))) {
        return res.status(404).json({ error: 'Faculty not found.' });
      }
      department.faculty = req.body.facultyId;
    }
    await department.save();

    // Users and courses store the department by name; keep them in step.
    if (department.name !== oldName) {
      await Promise.all([
        User.updateMany({ department: sameName(oldName) }, { department: department.name }),
        Course.updateMany({ department: sameName(oldName) }, { department: department.name }),
      ]);
    }
    res.json({ success: true, department });
  } catch (error) {
    duplicateError(res, error, 'department');
  }
});

router.delete('/departments/:departmentId', protect, isAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.departmentId)) return res.status(404).json({ error: 'Department not found.' });
    const department = await Department.findById(req.params.departmentId);
    if (!department) return res.status(404).json({ error: 'Department not found.' });

    const [users, courses] = await Promise.all([
      User.countDocuments({ department: sameName(department.name) }),
      Course.countDocuments({ department: sameName(department.name) }),
    ]);
    if (users || courses) {
      return res.status(409).json({
        error: `${department.name} is used by ${users} user(s) and ${courses} course(s). Move them to another department first.`,
      });
    }
    await Department.deleteOne({ _id: department._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/faculties/{id}:
 *   patch:
 *     summary: Rename a faculty (institution administrators)
 *     tags: [Faculties]
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     summary: Delete a faculty that has no departments (institution administrators)
 *     tags: [Faculties]
 *     security:
 *       - bearerAuth: []
 * /api/faculties/{id}/departments:
 *   post:
 *     summary: Add a department to a faculty (institution administrators)
 *     tags: [Faculties]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id', protect, isAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Faculty not found.' });
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Faculty name is required.' });
    const faculty = await Faculty.findByIdAndUpdate(req.params.id, { name }, { returnDocument: 'after', runValidators: true });
    if (!faculty) return res.status(404).json({ error: 'Faculty not found.' });
    res.json({ success: true, faculty });
  } catch (error) {
    duplicateError(res, error, 'faculty');
  }
});

router.delete('/:id', protect, isAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Faculty not found.' });
    const faculty = await Faculty.findById(req.params.id);
    if (!faculty) return res.status(404).json({ error: 'Faculty not found.' });
    const departments = await Department.countDocuments({ faculty: faculty._id });
    if (departments) {
      return res.status(409).json({
        error: `${faculty.name} still has ${departments} department(s). Delete or move them first.`,
      });
    }
    await Faculty.deleteOne({ _id: faculty._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/departments', protect, isAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Faculty not found.' });
    if (!(await Faculty.exists({ _id: req.params.id }))) return res.status(404).json({ error: 'Faculty not found.' });
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Department name is required.' });
    const department = await Department.create({ name, faculty: req.params.id });
    res.status(201).json({ success: true, department });
  } catch (error) {
    duplicateError(res, error, 'department');
  }
});

module.exports = router;
