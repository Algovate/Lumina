# 部署指南

本指南详细说明如何将 Lumina 部署到 AWS。

## 架构

- **前端**: S3 Bucket 静态网站托管（HTTP）
- **后端**: Lambda Function (Express.js) + Function URL
- **存储**: S3 Bucket (图片存储)
- **索引**: DynamoDB (图片元数据，用于排序)
- **认证**: Cognito User Pool
- **注意**: 当前使用 S3 静态网站（HTTP），如需 HTTPS 和 CDN，可后续添加 CloudFront

## 前置要求

1. **AWS 账户** - 拥有适当的权限（IAM、Lambda、S3、Cognito、DynamoDB）
2. **Node.js 18+** 和 npm
3. **AWS CLI** - 已配置凭证

### 配置 AWS 凭证

```bash
aws configure
```

验证配置：
```bash
aws sts get-caller-identity
```

## 快速部署

### 1. 一键部署

```bash
./scripts/deploy-cli.sh
```

此脚本会自动：
- 构建前端和 Lambda 函数
- 创建/更新 S3 Buckets（图片存储和前端托管）
- 创建/更新 Lambda 函数和 Function URL
- 创建/更新 Cognito User Pool 和 Client
- 创建/更新 DynamoDB 表（用于图片排序）
- 配置前端静态网站托管
- 自动注入环境变量到前端构建

### 2. 获取部署信息

部署完成后，脚本会输出：
- 前端 S3 静态网站 URL（例如：`http://lumina-frontend-rodin.s3-website-us-east-1.amazonaws.com`）
- Lambda Function URL（API 地址）
- Cognito User Pool ID 和 Client ID

### 3. 迁移现有数据到 DynamoDB

部署完成后，如果已有图片数据，需要运行迁移脚本将数据导入 DynamoDB 以启用排序功能：

```bash
cd backend/express
npm run migrate
```

详细说明请参考 [数据迁移指南](DATA_MIGRATION.md)。

### 4. 创建用户（可选）

```bash
./scripts/create-user.sh user@example.com password123
```

## 自定义配置

可以通过环境变量自定义资源名称：

```bash
export AWS_REGION=us-east-1
export IMAGE_BUCKET=lumina-images-yourname
export FRONTEND_BUCKET=lumina-frontend-yourname
export LAMBDA_FUNCTION_NAME=LuminaBackendYourName
export THUMBNAIL_LAMBDA_FUNCTION_NAME=LuminaThumbnailGeneratorYourName
export LAMBDA_ROLE_NAME=LuminaLambdaYourNameRole
export COGNITO_USER_POOL_NAME=lumina-user-pool-yourname
export DYNAMODB_TABLE_NAME=lumina-images-yourname

./scripts/deploy-cli.sh
```

## 费用说明

AWS 提供免费额度：

- **Lambda**: 每月 100 万次请求免费
- **S3**: 5 GB 存储 + 20,000 GET 请求免费
- **CloudFront**: 1 TB 数据传输免费
- **Cognito**: 50,000 MAU（月度活跃用户）免费
- **DynamoDB**: 25 GB 存储 + 25 个写入容量单位 + 25 个读取容量单位免费

对于小型项目，免费额度通常足够使用。

## 常见问题

### 前端无法连接到后端 API

- 检查前端构建时的环境变量是否正确注入
- 确认 Lambda Function URL 已创建并可用
- 检查 Express 应用的 CORS 配置
- 查看浏览器控制台的网络请求错误
- 参考 [调试指南](DEBUGGING.md) 查看日志

### 图片上传失败

- 检查 S3 Bucket CORS 配置
- 确认 Lambda 函数执行角色有 S3 访问权限
- 查看 CloudWatch Logs 中的详细错误信息
- 参考 [AWS 权限配置](AWS_PERMISSIONS.md)

### 认证失败

- 确认 Cognito User Pool ID 和 Client ID 正确
- 检查前端配置中的 Cognito 信息是否正确
- 注意：OAuth 登录需要 HTTPS，S3 静态网站只支持 HTTP（用户名/密码登录可用）

### 排序功能不工作

- 确认 DynamoDB 表已创建
- 运行数据迁移脚本：`cd backend/express && npm run migrate`
- 检查 Lambda 函数环境变量中是否包含 `DYNAMODB_TABLE_NAME`
- 参考 [数据迁移指南](DATA_MIGRATION.md)

## 详细脚本说明

完整的部署脚本说明请参考 [scripts/README.md](../scripts/README.md)。

## 相关文档

- [开发环境配置](DEVELOPMENT.md)
- [数据迁移指南](DATA_MIGRATION.md)
- [调试指南](DEBUGGING.md)
- [AWS 权限配置](AWS_PERMISSIONS.md)

