const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Need this to check current status
const Institution = require('../models/Institution');
const { tenantContext } = require('../models/tenantContext');

const protect = async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    let user;
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return res.status(401).json({ error: "User no longer exists" });
      }

      if (user.status === 'suspended') {
        return res.status(403).json({ 
          error: "Access denied. Your account has been suspended." 
        });
      }
    } catch (error) {
      console.error("Auth Middleware Error:", error);
      return res.status(401).json({ error: "Not authorized, token failed" });
    }

    req.user = user;
    if (user.role === 'platform_admin') {
      // Each institution-management route also applies isPlatformAdmin.
      const isInstitutionManagement = req.baseUrl === '/api/institutions';
      const isOwnAccount = req.baseUrl === '/api/auth' &&
        ['/logout', '/change-password'].includes(req.path);
      if (!isInstitutionManagement && !isOwnAccount) {
        return res.status(403).json({
          error: "Platform administrators can only access institution-management endpoints.",
        });
      }
      return tenantContext.run({ bypass: true }, next);
    }

    if (!user.institutionId) {
      return res.status(403).json({
        error: "This account has not been assigned to an institution. Contact your platform administrator.",
      });
    }

    try {
      const institution = await Institution.findById(user.institutionId).select('status');
      if (!institution || institution.status !== 'active') {
        return res.status(403).json({ error: "This institution is not active." });
      }
    } catch (error) {
      console.error("Institution lookup failed:", error);
      return res.status(500).json({ error: "Could not verify institution access." });
    }

    return tenantContext.run({ institutionId: user.institutionId }, next);
  }

  return res.status(401).json({ error: "Not authorized, no token" });
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: "Access denied. Admins only." });
  }
};

const isPlatformAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'platform_admin') {
    return next();
  }
  return res.status(403).json({ error: "Access denied. Platform administrators only." });
};

module.exports = { protect, isAdmin, isPlatformAdmin };