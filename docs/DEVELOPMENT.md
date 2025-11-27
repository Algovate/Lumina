---
noteId: "0db80b80cb4611f09d2ddd4524ff0a50"
tags: []

---

# 开发环境配置指南

本指南说明如何在本地开发环境中配置和运行 Lumina 应用。

## 后端配置

### 1. 配置环境变量

在 `backend/express/.env` 文件中配置以下变量：

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

### 2. 获取 Cognito 配置

#### 方式 A: 从已部署的 AWS 资源获取（推荐）

如果您已经使用 CLI 部署了应用，可以通过以下方式获取 Cognito 配置：

```bash
# 方法 1: 使用 AWS CLI 查询 User Pool
aws cognito-idp list-user-pools \
  --max-results 60 \
  --region us-east-1 \
  --query "UserPools[?Name=='lumina-user-pool-cli']"

# 方法 2: 查询 User Pool Client
# 先获取 User Pool ID，然后查询 Client
USER_POOL_ID=us-east-1_XXXXXXXXX
aws cognito-idp list-user-pool-clients \
  --user-pool-id $USER_POOL_ID \
  --region us-east-1
```

从输出中获取：
- User Pool ID → `COGNITO_USER_POOL_ID`
- Client ID → `COGNITO_CLIENT_ID`

#### 方式 B: 在 AWS 控制台创建

1. 登录 [AWS Cognito 控制台](https://console.aws.amazon.com/cognito/)
2. 创建用户池
3. 创建应用客户端
4. 复制用户池 ID 和客户端 ID

#### 方式 C: 使用部署脚本创建（推荐）

最简单的方式是直接运行部署脚本，它会自动创建所有资源：

```bash
./scripts/deploy-cli.sh
```

部署完成后，Cognito 配置会自动设置，您只需要在本地 `.env` 文件中配置相同的值即可。

### 3. 启动后端服务器

```bash
cd backend/express
npm install
npm run dev
```

服务器将在 `http://localhost:3000` 启动。

## 前端配置

### 1. 配置环境变量

在 `frontend/.env` 文件中配置（仅用于本地开发环境）：

```env
VITE_AWS_REGION=us-east-1
VITE_S3_BUCKET=your-bucket-name
VITE_AWS_ACCESS_KEY_ID=your-access-key
VITE_AWS_SECRET_ACCESS_KEY=your-secret-key
VITE_API_URL=http://localhost:3000/api

# Cognito 配置（必需）
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_COGNITO_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxx
```

> **提示**：生产环境中，这些值会在构建时通过环境变量注入到前端代码中，由部署脚本自动配置。

### 2. 启动前端开发服务器

```bash
cd frontend
npm install
npm run dev
```

前端将在 `http://localhost:5173` 启动。

## 常见问题

### 问题: API 返回 500/503 错误

**原因**: Cognito 配置未设置或无效

**解决方案**:
1. 检查 `backend/express/.env` 文件中的 `COGNITO_USER_POOL_ID` 和 `COGNITO_CLIENT_ID`
2. 确保值格式正确：
   - User Pool ID: `us-east-1_XXXXXXXXX`（包含下划线）
   - Client ID: 通常是字母数字字符串
3. 重启后端服务器

### 问题: 前端无法连接后端

**解决方案**:
1. 确保后端服务器正在运行（`http://localhost:3000`）
2. 检查 `VITE_API_URL` 是否正确设置为 `http://localhost:3000/api`
3. 检查浏览器控制台的 CORS 错误

### 问题: S3 操作失败

**解决方案**:
1. 检查 `S3_BUCKET` 环境变量是否正确
2. 确保 AWS 凭证有效
3. 检查 S3 Bucket 的 CORS 配置
4. 确保 IAM 用户/角色有 S3 访问权限

## 快速开始（最小配置）

如果您只想快速测试前端界面，可以：

1. **跳过 Cognito 配置**（但无法使用认证功能）
   - 前端会显示配置提示
   - API 调用会返回配置错误

2. **使用模拟数据**（需要修改代码）

3. **部署到 AWS 后测试**（推荐）
   - 使用 `./scripts/deploy-cli.sh` 部署完整应用
   - 所有配置会自动设置

## 下一步

配置完成后：
1. 创建测试用户：`./scripts/create-user.sh user@example.com password123`
   - 注意：由于 User Pool 使用邮箱作为用户名，邮箱将同时作为用户名
2. 使用创建的凭据登录（邮箱 + 密码）
3. 开始使用应用

