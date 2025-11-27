# Lumina

**让回忆在云端发光**

Lumina 是一个基于 AWS S3 的现代化相册管理应用，提供流畅的图片上传、浏览和管理体验。

## ✨ 功能特性

- **📸 图片浏览**: 支持网格视图、大图预览和键盘导航。
- **☁️ 高效上传**: 支持拖拽上传、批量上传和实时进度显示。
- **📁 文件夹管理**: 轻松创建和管理多级文件夹结构。
- **🔍 快速搜索**: 实时过滤和查找图片。
- **🎨 现代 UI**: 基于 Tailwind CSS 的响应式设计，适配各种设备。

## 🛠 技术栈

- **前端**: React 18, TypeScript, Vite, Tailwind CSS, Zustand
- **后端**: Express.js, AWS SDK v3
- **存储**: AWS S3

## 🚀 快速开始

### 1. 环境准备

确保已安装 Node.js 18+，并拥有一个 AWS S3 Bucket 及对应的访问凭证 (Access Key ID & Secret Access Key)。

### 2. 配置环境变量（本地开发）

请在 `frontend` 和 `backend/express` 目录下分别复制 `.env.example` 或新建 `.env` 文件，仅用于本地开发环境：

**frontend/.env**

```env
VITE_AWS_REGION=us-east-1
VITE_S3_BUCKET=your-bucket-name
VITE_AWS_ACCESS_KEY_ID=your-access-key
VITE_AWS_SECRET_ACCESS_KEY=your-secret-key
VITE_API_URL=http://localhost:3000/api
```

**backend/express/.env**

```env
PORT=3000
AWS_REGION=us-east-1
S3_BUCKET=your-bucket-name
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Cognito 配置（用于用户认证）
# 部署到 AWS 后，这些值会从 AWS 资源中获取
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxx

# 前端 URL（用于 CORS 配置）
FRONTEND_URL=http://localhost:5173
```

> **注意**: 
> - 开发环境：需要配置 Cognito 凭证才能使用认证功能
> - 生产环境：包括 Cognito 在内的所有 AWS 资源配置均由部署脚本自动设置，并通过环境变量在构建时注入前端
> - 如果未配置 Cognito，API 会返回配置错误（503 状态码）

> **注意**: 请确保 S3 Bucket 已配置 CORS 以允许前端域名访问（开发环境通常为 `http://localhost:5173`）。

### 3. 安装与运行

建议在两个终端窗口中分别启动前后端服务：

```bash
# --- 终端 1: 后端 ---
cd backend/express
npm install
npm run dev
# 服务将运行在 http://localhost:3000

# --- 终端 2: 前端 ---
cd frontend
npm install
npm run dev
# 应用将运行在 http://localhost:5173
```

## 📂 项目结构

```
Lumina/
├── docs/               # 文档
│   ├── DEVELOPMENT.md     # 开发环境配置
│   └── AWS_PERMISSIONS.md # AWS 权限配置
├── frontend/           # React 前端应用
│   ├── src/
│   │   ├── components/ # UI 组件
│   │   ├── services/   # S3 与 API 服务逻辑
│   │   └── hooks/      # 自定义 Hooks
├── backend/            # 后端服务
│   └── express/        # Express 服务器 (生成预签名 URL)
└── scripts/            # 部署和管理脚本
```

## 🚀 部署到 AWS

Lumina 使用 AWS CLI 进行部署，通过脚本自动化创建和管理所有 AWS 资源。

### 架构

- **前端**: S3 Bucket 静态网站托管（HTTP）
- **后端**: Lambda Function (Express.js) + Function URL
- **存储**: S3 Bucket (图片存储)
- **认证**: Cognito User Pool
- **注意**: 当前使用 S3 静态网站（HTTP），如需 HTTPS 和 CDN，可后续添加 CloudFront

### 前置要求

1. **AWS 账户** - 拥有适当的权限（IAM、Lambda、S3、Cognito）
2. **Node.js 18+** 和 npm
3. **AWS CLI** - 已配置凭证

### 快速部署

#### 1. 配置 AWS 凭证

```bash
aws configure
```

验证配置：
```bash
aws sts get-caller-identity
```

#### 2. 部署应用

```bash
# 一键部署
./scripts/deploy-cli.sh
```

此脚本会自动：
- 构建前端和 Lambda 函数
- 创建/更新 S3 Buckets（图片存储和前端托管）
- 创建/更新 Lambda 函数和 Function URL
- 创建/更新 Cognito User Pool 和 Client
- 配置前端静态网站托管
- 自动注入环境变量到前端构建

#### 3. 获取部署信息

部署完成后，脚本会输出：
- 前端 S3 静态网站 URL（例如：`http://lumina-frontend-rodin.s3-website-us-east-1.amazonaws.com`）
- Lambda Function URL（API 地址）
- Cognito User Pool ID 和 Client ID

#### 4. 创建用户（可选）

```bash
./scripts/create-user.sh user@example.com password123
```

### 自定义配置

可以通过环境变量自定义资源名称：

```bash
export AWS_REGION=us-east-1
export IMAGE_BUCKET=lumina-images-yourname
export FRONTEND_BUCKET=lumina-frontend-yourname
export LAMBDA_FUNCTION_NAME=LuminaBackendYourName
export COGNITO_USER_POOL_NAME=lumina-user-pool-yourname

./scripts/deploy-cli.sh
```

### 详细部署说明

完整的部署指南和脚本说明请参考 [scripts/README.md](./scripts/README.md)。

### 费用说明

AWS 提供免费额度：

- **Lambda**: 每月 100 万次请求免费
- **S3**: 5 GB 存储 + 20,000 GET 请求免费
- **CloudFront**: 1 TB 数据传输免费
- **Cognito**: 50,000 MAU（月度活跃用户）免费

对于小型项目，免费额度通常足够使用。

### 故障排查

**问题**: 前端无法连接到后端 API

- 检查前端构建时的环境变量是否正确注入
- 确认 Lambda Function URL 已创建并可用
- 检查 Express 应用的 CORS 配置
- 查看浏览器控制台的网络请求错误

**问题**: 图片上传失败

- 检查 S3 Bucket CORS 配置
- 确认 Lambda 函数执行角色有 S3 访问权限
- 查看 CloudWatch Logs 中的详细错误信息

**问题**: 认证失败

- 确认 Cognito User Pool ID 和 Client ID 正确
- 检查前端配置中的 Cognito 信息是否正确
- 注意：OAuth 登录需要 HTTPS，S3 静态网站只支持 HTTP（用户名/密码登录可用）

更多故障排查信息请参考 [scripts/README.md](./scripts/README.md) 和 [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)。

## 📄 许可证

MIT
