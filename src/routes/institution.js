const express = require('express');
const mongoose = require('mongoose');
const Institution = require('../models/Institution');
const User = require('../models/User');
const { protect, isPlatformAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @swagger
 * /api/institutions:
 *   get:
 *     summary: List active institutions for login
 *     tags: [Institutions]
 *     responses:
 *       200:
 *         description: Active institution names and login codes
 *   post:
 *     summary: Create an institution and its first administrator
 *     tags: [Institutions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code, adminName, adminEmail, adminIdentifier, adminPassword]
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *               adminName:
 *                 type: string
 *               adminEmail:
 *                 type: string
 *               adminIdentifier:
 *                 type: string
 *               adminPassword:
 *                 type: string
 *                 minLength: 12
 *               department:
 *                 type: string
 *     responses:
 *       201:
 *         description: Institution and first administrator created
 *       403:
 *         description: Platform administrator access required
 */
router.get('/', async (req, res) => {
  try {
    const institutions = await Institution.find({ status: 'active' })
      .select('name code')
      .sort({ name: 1 });
    res.json({ success: true, institutions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', protect, isPlatformAdmin, async (req, res) => {
  try {
    const {
      name,
      code,
      adminName,
      adminEmail,
      adminIdentifier,
      adminPassword,
      department,
    } = req.body;

    const normalizedCode = String(code || '').trim().toLowerCase();
    const normalizedEmail = String(adminEmail || '').trim().toLowerCase();
    if (!name?.trim() || !/^[a-z0-9-]+$/.test(normalizedCode) ||
      !adminName?.trim() || !normalizedEmail || !adminIdentifier?.trim() ||
      !adminPassword || String(adminPassword).length < 12) {
      return res.status(400).json({
        error: "Provide institution name/code and first admin details. Admin password must be at least 12 characters.",
      });
    }

    if (await Institution.findOne({ code: normalizedCode })) {
      return res.status(409).json({ error: "Institution code is already in use." });
    }

    const institution = await Institution.create({
      name: name.trim(),
      code: normalizedCode,
    });

    try {
      const admin = await User.create({
        name: adminName.trim(),
        email: normalizedEmail,
        identifier: adminIdentifier.trim(),
        password: adminPassword,
        role: 'admin',
        department: department?.trim() || undefined,
        institutionId: institution._id,
      });
      return res.status(201).json({
        success: true,
        institution,
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          identifier: admin.identifier,
          role: admin.role,
          institutionId: admin.institutionId,
        },
      });
    } catch (error) {
      await Institution.findByIdAndDelete(institution._id);
      throw error;
    }
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Institution code, admin email, or identifier is already in use." });
    }
    return res.status(500).json({ error: error.message });
  }
});

const ADMIN_FIELDS = 'name email identifier department status lastActive role institutionId';

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function validateAdminInput({ name, email, identifier, password }) {
  if (!String(name || '').trim() || !String(identifier || '').trim()) {
    return 'Administrator name and staff identifier are required.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) {
    return 'Enter a valid administrator email address.';
  }
  if (!password || String(password).length < 12) {
    return 'Administrator password must be at least 12 characters.';
  }
  return '';
}

function serializeAdmin(admin) {
  return {
    id: admin._id,
    name: admin.name,
    email: admin.email,
    identifier: admin.identifier,
    department: admin.department || '',
    status: admin.status,
    lastActive: admin.lastActive || null,
  };
}

/**
 * @swagger
 * /api/institutions/manage:
 *   get:
 *     summary: List every institution with user counts (platform administrators)
 *     tags: [Institutions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Institutions with admin, lecturer and student counts
 */
router.get('/manage', protect, isPlatformAdmin, async (req, res) => {
  try {
    const [institutions, counts] = await Promise.all([
      Institution.find().sort({ createdAt: -1 }).lean(),
      User.aggregate([
        { $match: { institutionId: { $type: 'objectId' } } },
        { $group: { _id: { institutionId: '$institutionId', role: '$role' }, count: { $sum: 1 } } },
      ]),
    ]);

    const countsByInstitution = {};
    counts.forEach(({ _id, count }) => {
      const key = String(_id.institutionId);
      countsByInstitution[key] = countsByInstitution[key] || { admin: 0, lecturer: 0, student: 0 };
      if (_id.role in countsByInstitution[key]) countsByInstitution[key][_id.role] = count;
    });

    res.json({
      success: true,
      institutions: institutions.map((institution) => ({
        ...institution,
        counts: countsByInstitution[String(institution._id)] || { admin: 0, lecturer: 0, student: 0 },
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/institutions/{id}:
 *   get:
 *     summary: Get an institution and its administrators (platform administrators)
 *     tags: [Institutions]
 *     security:
 *       - bearerAuth: []
 *   patch:
 *     summary: Rename an institution or change its status (platform administrators)
 *     tags: [Institutions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, suspended]
 */
router.get('/:id', protect, isPlatformAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Institution not found.' });
    const institution = await Institution.findById(req.params.id).lean();
    if (!institution) return res.status(404).json({ error: 'Institution not found.' });

    const [admins, lecturers, students] = await Promise.all([
      User.find({ institutionId: institution._id, role: 'admin' }).select(ADMIN_FIELDS).sort({ name: 1 }),
      User.countDocuments({ institutionId: institution._id, role: 'lecturer' }),
      User.countDocuments({ institutionId: institution._id, role: 'student' }),
    ]);

    res.json({
      success: true,
      institution: { ...institution, counts: { admin: admins.length, lecturer: lecturers, student: students } },
      admins: admins.map(serializeAdmin),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', protect, isPlatformAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Institution not found.' });
    const update = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: 'Institution name cannot be empty.' });
      update.name = name;
    }
    if (req.body.status !== undefined) {
      if (!['active', 'suspended'].includes(req.body.status)) {
        return res.status(400).json({ error: 'Status must be active or suspended.' });
      }
      update.status = req.body.status;
    }
    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    const institution = await Institution.findByIdAndUpdate(req.params.id, update, {
      returnDocument: 'after',
      runValidators: true,
    });
    if (!institution) return res.status(404).json({ error: 'Institution not found.' });
    res.json({ success: true, institution });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/institutions/{id}/admins:
 *   post:
 *     summary: Add an administrator to an institution (platform administrators)
 *     tags: [Institutions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, identifier, password]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               identifier:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 12
 *               department:
 *                 type: string
 */
router.post('/:id/admins', protect, isPlatformAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Institution not found.' });
    const institution = await Institution.findById(req.params.id);
    if (!institution) return res.status(404).json({ error: 'Institution not found.' });

    const validationError = validateAdminInput(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const email = String(req.body.email).trim().toLowerCase();
    const identifier = String(req.body.identifier).trim();
    const existing = await User.findOne({
      institutionId: institution._id,
      $or: [{ email }, { identifier }],
    });
    if (existing) {
      return res.status(409).json({ error: 'A user with this email or identifier already exists in this institution.' });
    }

    const admin = await User.create({
      name: String(req.body.name).trim(),
      email,
      identifier,
      password: req.body.password,
      role: 'admin',
      department: String(req.body.department || '').trim() || undefined,
      institutionId: institution._id,
    });
    res.status(201).json({ success: true, admin: serializeAdmin(admin) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A user with this email or identifier already exists in this institution.' });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/institutions/{id}/admins/{adminId}/status:
 *   patch:
 *     summary: Activate or suspend an institution administrator (platform administrators)
 *     tags: [Institutions]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id/admins/:adminId/status', protect, isPlatformAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.id) || !isValidId(req.params.adminId)) {
      return res.status(404).json({ error: 'Administrator not found.' });
    }
    if (!['active', 'suspended'].includes(req.body.status)) {
      return res.status(400).json({ error: 'Status must be active or suspended.' });
    }
    const admin = await User.findOneAndUpdate(
      { _id: req.params.adminId, institutionId: req.params.id, role: 'admin' },
      { status: req.body.status },
      { returnDocument: 'after' },
    ).select(ADMIN_FIELDS);
    if (!admin) return res.status(404).json({ error: 'Administrator not found.' });
    res.json({ success: true, admin: serializeAdmin(admin) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
