const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = require("../config/s3");

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET_NAME,
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
      // Organize by folders in S3: course-materials/filename
      const fileName = `course-materials/${Date.now()}-${file.originalname}`;
      cb(null, fileName);
    }
  })
});

module.exports = upload;
const MAX_PHOTO_BYTES = 200 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const photoUpload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      cb(null, `profile-photos/${req.params.id}-${Date.now()}`);
    },
  }),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
  fileFilter: function (req, file, cb) {
    if (!PHOTO_TYPES.includes(file.mimetype)) {
      const error = new Error("Profile photo must be a JPEG, PNG, WebP or GIF image.");
      error.status = 400;
      return cb(error);
    }
    cb(null, true);
  },
}).single("image");

// Uploads one profile photo (field "image"). Size and type are checked while
// streaming, so a rejected file is never stored. Errors come back as JSON.
function uploadProfilePhoto(req, res, next) {
  photoUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "Image must be less than 200KB" });
    }
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Profile photo upload failed:", err);
    return res.status(502).json({ error: "Could not store the photo. Please try again." });
  });
}

upload.uploadProfilePhoto = uploadProfilePhoto;
