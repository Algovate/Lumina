#!/usr/bin/env node

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { generateThumbnail, isImageFile, isThumbnailFile, THUMBNAIL_PREFIX, thumbnailExists } from './thumbnailUtils';

// 解析命令行参数
interface Args {
  bucket?: string;
  prefix?: string;
  dryRun: boolean;
  limit?: number;
  help: boolean;
}

function parseArgs(): Args {
  const args: Args = {
    dryRun: false,
    help: false,
  };

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--bucket':
        args.bucket = argv[++i];
        break;
      case '--prefix':
        args.prefix = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--limit':
        args.limit = parseInt(argv[++i], 10);
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        process.exit(1);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Usage: npm run migrate-thumbnails [options]

Options:
  --bucket <name>    S3 bucket name (default: from S3_BUCKET env var)
  --prefix <prefix>  Only process images with this prefix
  --dry-run          List images that need thumbnails without generating them
  --limit <number>   Limit the number of images to process (for testing)
  --help, -h         Show this help message

Environment variables:
  S3_BUCKET          S3 bucket name (required if --bucket not provided)
  AWS_REGION         AWS region (default: us-east-1)
  AWS_ACCESS_KEY_ID  AWS access key (optional, uses default credentials)
  AWS_SECRET_ACCESS_KEY AWS secret key (optional, uses default credentials)

Examples:
  npm run migrate-thumbnails
  npm run migrate-thumbnails -- --prefix "folder1/"
  npm run migrate-thumbnails -- --dry-run
  npm run migrate-thumbnails -- --limit 10
`);
}

async function listAllImages(
  s3Client: S3Client,
  bucketName: string,
  prefix: string = ''
): Promise<string[]> {
  const images: string[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });

    const response = await s3Client.send(command);

    if (response.Contents) {
      for (const object of response.Contents) {
        if (object.Key && !object.Key.endsWith('/')) {
          // 排除缩略图文件
          if (!isThumbnailFile(object.Key) && isImageFile(object.Key)) {
            images.push(object.Key);
          }
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return images;
}

function updateProgress(current: number, total: number, message: string = '') {
  const percentage = Math.round((current / total) * 100);
  const barLength = 30;
  const filledLength = Math.round((barLength * current) / total);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  
  process.stdout.write(`\r[${bar}] ${percentage}% (${current}/${total}) ${message}`);
  
  if (current === total) {
    process.stdout.write('\n');
  }
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const bucketName = args.bucket || process.env.S3_BUCKET;
  if (!bucketName) {
    console.error('Error: S3 bucket name is required. Use --bucket or set S3_BUCKET environment variable.');
    process.exit(1);
  }

  const region = process.env.AWS_REGION || 'us-east-1';
  const s3Client = new S3Client({ region });

  console.log('=== 缩略图迁移脚本 ===');
  console.log(`Bucket: ${bucketName}`);
  console.log(`Region: ${region}`);
  console.log(`Prefix: ${args.prefix || '(all)'}`);
  console.log(`Mode: ${args.dryRun ? 'DRY RUN (只列出，不生成)' : '生成缩略图'}`);
  if (args.limit) {
    console.log(`Limit: ${args.limit} images`);
  }
  console.log('');

  // 列出所有图片
  console.log('正在列出所有图片...');
  let allImages = await listAllImages(s3Client, bucketName, args.prefix);
  console.log(`找到 ${allImages.length} 张图片`);

  if (allImages.length === 0) {
    console.log('没有找到需要处理的图片。');
    process.exit(0);
  }

  // 限制处理数量（用于测试）
  if (args.limit && args.limit > 0) {
    allImages = allImages.slice(0, args.limit);
    console.log(`限制处理数量为: ${allImages.length}`);
  }

  console.log('');

  // 检查哪些图片需要生成缩略图
  console.log('正在检查哪些图片需要生成缩略图...');
  const imagesToProcess: string[] = [];
  const imagesWithThumbnails: string[] = [];
  const skippedImages: string[] = [];

  for (let i = 0; i < allImages.length; i++) {
    const imageKey = allImages[i];
    updateProgress(i + 1, allImages.length, `检查: ${imageKey}`);

    const thumbnailKey = `${THUMBNAIL_PREFIX}${imageKey}`;
    
    try {
      // 检查缩略图是否存在
      const exists = await thumbnailExists(s3Client, bucketName, thumbnailKey);
      
      if (exists) {
        imagesWithThumbnails.push(imageKey);
      } else {
        imagesToProcess.push(imageKey);
      }
    } catch (error) {
      skippedImages.push(imageKey);
      console.error(`\n检查 ${imageKey} 时出错:`, error);
    }
  }

  console.log('');
  console.log(`需要生成缩略图: ${imagesToProcess.length}`);
  console.log(`已有缩略图: ${imagesWithThumbnails.length}`);
  if (skippedImages.length > 0) {
    console.log(`跳过（错误）: ${skippedImages.length}`);
  }
  console.log('');

  if (imagesToProcess.length === 0) {
    console.log('所有图片都已生成缩略图！');
    process.exit(0);
  }

  if (args.dryRun) {
    console.log('以下图片需要生成缩略图:');
    imagesToProcess.forEach((key, index) => {
      console.log(`  ${index + 1}. ${key}`);
    });
    process.exit(0);
  }

  // 生成缩略图
  console.log('开始生成缩略图...');
  const results = {
    success: 0,
    failed: 0,
    errors: [] as Array<{ key: string; error: string }>,
  };

  for (let i = 0; i < imagesToProcess.length; i++) {
    const imageKey = imagesToProcess[i];
    updateProgress(i + 1, imagesToProcess.length, `处理: ${imageKey}`);

    const result = await generateThumbnail(s3Client, bucketName, imageKey);
    
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      results.errors.push({ key: imageKey, error: result.error || 'Unknown error' });
    }
  }

  console.log('');
  console.log('');
  console.log('=== 处理完成 ===');
  console.log(`成功: ${results.success}`);
  console.log(`失败: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log('');
    console.log('失败的图片:');
    results.errors.forEach(({ key, error }) => {
      console.log(`  - ${key}: ${error}`);
    });
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

// 运行主函数
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

