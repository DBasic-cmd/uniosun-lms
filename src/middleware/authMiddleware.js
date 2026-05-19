const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Need this to check current status

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // 1. Get token from header
      token = req.headers.authorization.split(' ')[1];

      // 2. Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 3. Fetch user from database to check their current status
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return res.status(401).json({ error: "User no longer exists" });
      }

      // 4. THE CRITICAL CHECK: Block if suspended
      if (user.status === 'suspended') {
        return res.status(403).json({ 
          error: "Access denied. Your account has been suspended." 
        });
      }

      // 5. Attach user to the request object
      req.user = user;
      next();
    } catch (error) {
      console.error("Auth Middleware Error:", error);
      res.status(401).json({ error: "Not authorized, token failed" });
    }
  }

  if (!token) {
    res.status(401).json({ error: "Not authorized, no token" });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: "Access denied. Admins only." });
  }
};

module.exports = { protect, isAdmin };