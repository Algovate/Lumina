# Lumina

**让回忆在云端发光**

Lumina 是一个基于 AWS S3 的现代化相册管理应用，提供流畅的图片上传、浏览和管理体验。

## ✨ 功能特性

- **📸 图片浏览**: 支持网格视图、大图预览和键盘导航
- **☁️ 高效上传**: 支持拖拽上传、批量上传和实时进度显示
- **📁 文件夹管理**: 轻松创建和管理多级文件夹结构
- **🔍 快速搜索**: 实时过滤和查找图片
- **🏷️ 标签管理**: 为图片添加标签，方便分类和检索
- **📊 多种排序**: 按名称、日期、大小、标签数量排序
- **🎨 现代 UI**: 基于 Tailwind CSS 的响应式设计，适配各种设备

## 🛠 技术栈

- **前端**: React 19, TypeScript, Vite, Tailwind CSS, Zustand
- **后端**: Express.js, AWS SDK v3
- **存储**: AWS S3, DynamoDB
- **认证**: AWS Cognito
- **部署**: AWS Lambda, S3 Static Website

## 🚀 快速开始

### 本地开发

```bash
# 1. 安装依赖
cd backend/express && npm install
cd ../../frontend && npm install

# 2. 配置环境变量（参考 docs/DEVELOPMENT.md）
# 创建 frontend/.env 和 backend/express/.env

# 3. 启动服务
# 终端 1: 后端
cd backend/express && npm run dev

# 终端 2: 前端
cd frontend && npm run dev
```

详细开发配置请参考 [开发环境配置](docs/DEVELOPMENT.md)。

### 部署到 AWS

```bash
# 1. 配置 AWS 凭证
aws configure

# 2. 一键部署
./scripts/deploy-cli.sh

# 3. 迁移现有数据（可选）
cd backend/express && npm run migrate
```

详细部署说明请参考 [部署指南](docs/DEPLOYMENT.md)。

## 📚 文档

- [开发环境配置](docs/DEVELOPMENT.md) - 本地开发环境设置
- [部署指南](docs/DEPLOYMENT.md) - AWS 部署详细说明
- [数据迁移指南](docs/DATA_MIGRATION.md) - 将现有数据迁移到 DynamoDB
- [调试指南](docs/DEBUGGING.md) - 查看日志和排查问题
- [AWS 权限配置](docs/AWS_PERMISSIONS.md) - IAM 权限说明

## 📂 项目结构

```
Lumina/
├── docs/               # 文档
├── frontend/           # React 前端应用
├── backend/            # 后端服务
│   └── express/        # Express 服务器
└── scripts/            # 部署和管理脚本
```

## 🆘 故障排查

遇到问题？请查看：
- [调试指南](docs/DEBUGGING.md) - 查看日志和常见问题
- [部署指南](docs/DEPLOYMENT.md) - 部署相关问题
- [开发环境配置](docs/DEVELOPMENT.md) - 本地开发问题

## 📄 许可证

MIT
