---
noteId: "0db83293cb4611f09d2ddd4524ff0a50"
tags: []

---

# 部署脚本说明

本目录包含用于自动化部署和管理 Lumina 应用的脚本。

## 部署脚本

### `deploy-cli.sh` - CLI 部署脚本

使用 AWS CLI 一键部署 Lumina 应用到 AWS（不使用 CDK）。

**使用方法:**
```bash
./scripts/deploy-cli.sh
```

**功能:**
- 构建前端和 Lambda 函数
- 创建/更新 S3 Buckets（图片存储和前端托管）
- 创建/更新 Lambda 函数和 Function URL
- 创建/更新 Cognito User Pool 和 Client
- 配置前端静态网站托管
- 自动注入环境变量到前端构建

**环境变量配置（可选）:**
```bash
# 自定义资源名称和区域
export AWS_REGION=us-east-1
export IMAGE_BUCKET=lumina-images-rodin
export FRONTEND_BUCKET=lumina-frontend-rodin
export LAMBDA_FUNCTION_NAME=LuminaBackendCli
export LAMBDA_ROLE_NAME=LuminaLambdaCliRole
export COGNITO_USER_POOL_NAME=lumina-user-pool-cli

./scripts/deploy-cli.sh
```

## 清理脚本

### `clean.sh` - 清理项目

清理构建产物、临时文件、缓存等。

**使用方法:**
```bash
# 清理构建产物和临时文件（默认）
./scripts/clean.sh

# 同时清理 node_modules
./scripts/clean.sh --all

# 同时清理 AWS 资源（需要确认）
./scripts/clean.sh --aws

# 组合使用
./scripts/clean.sh --all --aws
```

**功能:**
- 清理构建产物（`dist/`）
- 清理临时文件（JSON 配置文件、zip 文件等）
- 清理日志文件
- 清理缓存（`.vite`, `.cache`, `.npm` 等）
- 清理 TypeScript 构建信息
- 可选：清理 `node_modules/`
- 可选：清理 AWS 资源（Lambda、S3、Cognito、IAM Role）

**注意:** 
- 使用 `--aws` 选项会删除所有部署的 AWS 资源，请谨慎使用
- 清理 AWS 资源前会要求确认

## 管理脚本

### `create-user.sh` - 创建 Cognito 用户

创建新的 Cognito 用户账户。

**使用方法:**
```bash
# 使用默认值
./scripts/create-user.sh

# 指定邮箱、用户名和密码
./scripts/create-user.sh user@example.com myuser mypassword

# 使用环境变量
export USER_POOL_ID=us-east-1_XXXXXXXXX
export REGION=us-east-1
./scripts/create-user.sh user@example.com
```

**功能:**
- 自动从 AWS 查询 User Pool（通过名称 `lumina-user-pool-cli`）
- 或从环境变量读取 `USER_POOL_ID`
- 创建新用户并设置永久密码
- 支持环境变量配置

**注意:** 
- 脚本会自动查找名为 `lumina-user-pool-cli` 的 User Pool
- 如果找不到，需要手动设置 `USER_POOL_ID` 环境变量

### `reset-password.sh` - 重置 Cognito 用户密码

重置现有 Cognito 用户的密码。

**使用方法:**
```bash
# 指定用户名和新密码
./scripts/reset-password.sh rodin NewPassword123

# 使用环境变量
export USERNAME=rodin
export PASSWORD=NewPassword123
./scripts/reset-password.sh
```

**功能:**
- 自动从 AWS 查询 User Pool（通过名称 `lumina-user-pool-cli`）
- 或从环境变量读取 `USER_POOL_ID`
- 验证用户是否存在
- 重置密码并设置为永久密码
- 支持环境变量配置

**注意:** 
- 密码必须符合用户池的密码策略（至少8位，包含大小写字母和数字）
- 重置后用户可以使用新密码立即登录

## 完整部署流程

### 首次部署

1. **配置 AWS 凭证**
   ```bash
   aws configure
   ```

2. **部署应用**
   ```bash
   ./scripts/deploy-cli.sh
   ```

3. **创建用户**（可选）
   ```bash
   ./scripts/create-user.sh user@example.com myuser mypassword
   ```

### 更新部署

只需重新运行部署脚本：

```bash
./scripts/deploy-cli.sh
```

脚本会自动检测已存在的资源并更新，不会重复创建。

## 环境变量配置

前端配置在构建时通过环境变量注入，包含：

- `VITE_S3_BUCKET`: S3 存储桶名称
- `VITE_AWS_REGION`: AWS 区域
- `VITE_COGNITO_USER_POOL_ID`: Cognito 用户池 ID
- `VITE_COGNITO_USER_POOL_CLIENT_ID`: Cognito 客户端 ID
- `VITE_COGNITO_DOMAIN`: Cognito Domain URL
- `VITE_API_URL`: API URL（Lambda Function URL）

这些配置在部署时自动生成，无需手动配置。

## 故障排查

### 问题: Lambda 函数部署失败

**解决方案:**
- 检查 AWS 凭证: `aws sts get-caller-identity`
- 确保账户有足够权限（IAM、Lambda、S3、Cognito）
- 检查区域设置
- 查看 CloudWatch Logs

### 问题: 前端无法加载配置

**解决方案:**
- 检查前端构建是否成功
- 检查浏览器控制台错误
- 确认环境变量是否正确注入

### 问题: Cognito 登录失败

**解决方案:**
- 确认 User Pool 和 Client 已创建
- 检查前端配置中的 Cognito 信息是否正确
- 查看浏览器控制台的错误信息
- 注意：OAuth 登录需要 HTTPS，S3 静态网站只支持 HTTP

## 相关文档

- [README.md](../README.md) - 项目说明
- [DEVELOPMENT.md](../docs/DEVELOPMENT.md) - 开发环境配置
