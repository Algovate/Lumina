import { S3Event, S3EventRecord, Context } from 'aws-lambda';
import { S3Client } from '@aws-sdk/client-s3';
import { generateThumbnail } from './thumbnailUtils';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.S3_BUCKET || '';

/**
 * 处理单个 S3 事件记录
 */
async function processS3Record(record: S3EventRecord): Promise<void> {
  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

  const result = await generateThumbnail(s3Client, bucket, key);
  
  if (result.success) {
    console.log(`Thumbnail created successfully: ${result.thumbnailKey}`);
  } else if (result.error === 'Thumbnail already exists') {
    console.log(`Thumbnail already exists: ${result.thumbnailKey}`);
  } else if (result.error === 'Skipping thumbnail file' || result.error === 'Not an image file') {
    console.log(`Skipping: ${key} (${result.error})`);
  } else {
    console.error(`Error processing ${key}: ${result.error}`);
    // 不抛出错误，避免影响原图上传
    // 错误会被记录到 CloudWatch Logs
  }
}

/**
 * Lambda 处理函数
 */
export const handler = async (event: S3Event, context: Context) => {
  console.log('Received S3 event:', JSON.stringify(event, null, 2));

  if (!BUCKET_NAME) {
    console.error('S3_BUCKET environment variable is not set');
    return;
  }

  // 处理所有记录
  const promises = event.Records.map(record => processS3Record(record));
  
  try {
    await Promise.all(promises);
    console.log(`Successfully processed ${event.Records.length} record(s)`);
  } catch (error) {
    console.error('Error processing S3 records:', error);
    // 即使部分失败，也返回成功，避免 Lambda 重试
    // 错误已记录到 CloudWatch Logs
  }
};

