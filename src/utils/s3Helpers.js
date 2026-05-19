const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const s3 = require("../config/s3");

const generateDownloadUrl = async (fileKey) => {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: fileKey,
  });

  // URL expires in 3600 seconds (1 hour)
  return await getSignedUrl(s3, command, { expiresIn: 3600 });
};

module.exports = { generateDownloadUrl };