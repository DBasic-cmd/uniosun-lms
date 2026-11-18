const { S3Client } = require("@aws-sdk/client-s3");

// Initialize the S3 Client with your credentials
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Uploads (profile photos, course materials) fail with unclear AWS errors when
// these are missing or still placeholders, so say so at startup.
const S3_SETTINGS = ["AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_BUCKET_NAME"];
const notConfigured = S3_SETTINGS.filter((name) => {
  const value = process.env[name];
  return !value || /mock|dummy|example|changeme|your[_-]/i.test(value);
});
if (notConfigured.length) {
  console.warn(
    `[S3] Not configured: ${notConfigured.join(", ")} missing or placeholder. ` +
      "File uploads will fail until real AWS values are set in .env."
  );
}

module.exports = s3;
