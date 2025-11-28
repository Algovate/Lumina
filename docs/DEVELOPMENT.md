# 开发环境配置指南

本指南说明如何在本地开发环境中配置和运行 Lumina 应用。

## 前置要求

- Node.js 18+
- npm 或 yarn
- AWS S3 Bucket 及访问凭证
- AWS Cognito User Pool（用于认证功能）

## 环境配置

### 1. 安装依赖

```bash
# 安装后端依赖
cd backend/express
npm install

# 安装前端依赖
cd ../../frontend
npm install
```

### 2. 配置后端环境变量

在 `backend/express/.env` 文件中配置：

```env
PORT=3000
AWS_REGION=us-east-1
S3_BUCKET=your-bucket-name
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Cognito 配置（必需，用于用户认证）
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxx

# 前端 URL（用于 CORS 配置）
FRONTEND_URL=http://localhost:5173
```

### 3. 配置前端环境变量

在 `frontend/.env` 文件中配置：

```env
VITE_AWS_REGION=us-east-1
VITE_S3_BUCKET=your-bucket-name
VITE_AWS_ACCESS_KEY_ID=your-access-key
VITE_AWS_SECRET_ACCESS_KEY=your-secret-key
VITE_API_URL=http://localhost:3000/api

# Cognito 配置（必需，用于用户认证）
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxx
VITE_COGNITO_DOMAIN=lumina-xxxxxxxxxx.auth.us-east-1.amazoncognito.com
```

### 4. 获取 Cognito 配置

#### 方式 A: 从已部署的 AWS 资源获取（推荐）

如果您已经使用 CLI 部署了应用，可以通过以下方式获取 Cognito 配置：

```bash
# 查询 User Pool
aws cognito-idp list-user-pools \
  --max-results 60 \
  --region us-east-1 \
  --query "UserPools[?Name=='lumina-user-pool-cli']"

# 查询 User Pool Client（需要先获取 User Pool ID）
USER_POOL_ID=us-east-1_XXXXXXXXX
aws cognito-idp list-user-pool-clients \
  --user-pool-id $USER_POOL_ID \
  --region us-east-1

# 查询 User Pool Domain
aws cognito-idp describe-user-pool-domain \
  --domain lumina-xxxxxxxxxx \
  --region us-east-1
```

#### 方式 B: 手动创建 Cognito User Pool

1. 登录 AWS Console
2. 进入 Cognito 服务
3. 创建 User Pool
4. 创建 App Client
5. 配置 Domain

详细步骤请参考 AWS Cognito 文档。

## 运行应用

### 启动后端服务

```bash
cd backend/express
npm run dev
```

后端服务将运行在 `http://localhost:3000`

### 启动前端服务

```bash
cd frontend
npm run dev
```

前端应用将运行在 `http://localhost:5173`

## S3 CORS 配置

确保 S3 Bucket 已配置 CORS 以允许前端访问：

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:5173",
      "http://localhost:3000"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## 常见问题

### 问题：API 返回 503 错误

**原因**: Cognito 配置缺失或错误

**解决**:
- 检查 `.env` 文件中的 Cognito 配置是否正确
- 确认 User Pool ID 和 Client ID 有效
- 检查 Cognito User Pool 是否已启用

### 问题：CORS 错误

**原因**: S3 Bucket 或后端 CORS 配置不正确

**解决**:
- 检查 S3 Bucket CORS 配置
- 确认后端 `FRONTEND_URL` 环境变量正确
- 检查浏览器控制台的详细错误信息

### 问题：图片上传失败

**原因**: S3 权限或配置问题

**解决**:
- 检查 AWS 凭证是否正确
- 确认 S3 Bucket 名称正确
- 检查 IAM 用户是否有 S3 访问权限
- 参考 [AWS 权限配置](AWS_PERMISSIONS.md)

### 问题：认证失败

**原因**: Cognito 配置错误

**解决**:
- 确认 Cognito User Pool ID 和 Client ID 正确
- 检查 Cognito Domain 配置
- 确认用户已创建（参考部署指南中的用户创建步骤）

## 开发工具

### 后端脚本

```bash
# 开发模式（自动重启）
npm run dev

# 构建
npm run build

# 运行构建后的代码
npm start

# 数据迁移（需要配置 AWS 凭证）
npm run migrate
```

### 前端脚本

```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

## 相关文档

- [部署指南](DEPLOYMENT.md) - AWS 部署说明
- [数据迁移指南](DATA_MIGRATION.md) - 数据迁移步骤
- [调试指南](DEBUGGING.md) - 调试和日志查看
- [AWS 权限配置](AWS_PERMISSIONS.md) - IAM 权限说明
