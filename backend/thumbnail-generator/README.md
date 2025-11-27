---
noteId: "1bca9cf0cb7911f0b18ec3c7e0bf0b94"
tags: []

---

# 缩略图生成器

这个目录包含缩略图生成的 Lambda 函数和迁移脚本。

## 文件说明

- `handler.ts` - Lambda 函数处理程序，响应 S3 事件自动生成缩略图
- `thumbnailUtils.ts` - 共享的缩略图生成工具函数
- `generate-thumbnails.ts` - 迁移脚本，用于为已有图片批量生成缩略图

## 迁移已有图片

### 前置要求

1. 安装依赖：
```bash
cd backend/thumbnail-generator
npm install
```

2. 配置 AWS 凭证（使用以下方式之一）：
   - 环境变量：`AWS_ACCESS_KEY_ID` 和 `AWS_SECRET_ACCESS_KEY`
   - AWS CLI 配置：`aws configure`
   - IAM 角色（如果在 EC2/Lambda 上运行）

### 使用方法

#### 基本用法

为所有图片生成缩略图：
```bash
S3_BUCKET=your-bucket-name npm run migrate-thumbnails
```

#### 指定 bucket

```bash
npm run migrate-thumbnails -- --bucket your-bucket-name
```

#### 只处理特定文件夹

```bash
npm run migrate-thumbnails -- --prefix "folder1/"
```

#### 干运行（只列出需要处理的图片，不实际生成）

```bash
npm run migrate-thumbnails -- --dry-run
```

#### 限制处理数量（用于测试）

```bash
npm run migrate-thumbnails -- --limit 10
```

#### 组合使用

```bash
npm run migrate-thumbnails -- --bucket my-bucket --prefix "photos/" --limit 100
```

### 命令行参数

- `--bucket <name>` - S3 bucket 名称（如果未设置，使用 `S3_BUCKET` 环境变量）
- `--prefix <prefix>` - 只处理指定前缀的图片
- `--dry-run` - 只列出需要处理的图片，不实际生成缩略图
- `--limit <number>` - 限制处理的图片数量（用于测试）
- `--help, -h` - 显示帮助信息

### 环境变量

- `S3_BUCKET` - S3 bucket 名称（如果未使用 `--bucket` 参数）
- `AWS_REGION` - AWS 区域（默认：us-east-1）
- `AWS_ACCESS_KEY_ID` - AWS 访问密钥（可选，使用默认凭证）
- `AWS_SECRET_ACCESS_KEY` - AWS 密钥（可选，使用默认凭证）

### 输出示例

```
=== 缩略图迁移脚本 ===
Bucket: my-bucket
Region: us-east-1
Prefix: (all)
Mode: 生成缩略图

正在列出所有图片...
找到 150 张图片

正在检查哪些图片需要生成缩略图...
[████████████████████████████████] 100% (150/150) 检查: image.jpg

需要生成缩略图: 120
已有缩略图: 30

开始生成缩略图...
[████████████████████████████████] 100% (120/120) 处理: image.jpg


=== 处理完成 ===
成功: 118
失败: 2

失败的图片:
  - corrupted.jpg: Input buffer contains unsupported image format
  - huge-file.jpg: Image exceeds maximum dimensions
```

## Lambda 函数部署

Lambda 函数会在图片上传到 S3 时自动触发，无需手动运行迁移脚本。

部署脚本会自动配置 Lambda 函数和 S3 事件通知。详见项目根目录的 `scripts/deploy-cli.sh`。

