# Lumina 文档

本目录包含 Lumina 项目的详细文档。

## 📚 文档目录

### [开发环境配置](DEVELOPMENT.md)
本地开发环境设置指南，包括：
- 环境变量配置
- Cognito 配置
- 运行应用
- 常见问题

### [部署指南](DEPLOYMENT.md)
AWS 部署详细说明，包括：
- 架构说明
- 部署步骤
- 自定义配置
- 费用说明
- 常见问题

### [数据迁移指南](DATA_MIGRATION.md)
将现有 S3 数据迁移到 DynamoDB，包括：
- 迁移步骤
- 验证方法
- 故障排除

### [调试指南](DEBUGGING.md)
查看日志和排查问题，包括：
- CloudWatch Logs 查看
- 常见问题排查
- 调试工具

### [AWS 权限配置](AWS_PERMISSIONS.md)
IAM 权限配置说明，包括：
- 权限检查
- 权限问题诊断
- 修复步骤

## 🔗 相关资源

- [项目 README](../README.md) - 项目概览和快速开始
- [脚本说明](../scripts/README.md) - 部署和管理脚本详细说明

## 📝 文档结构

```
docs/
├── README.md              # 本文档（文档索引）
├── DEVELOPMENT.md         # 开发环境配置
├── DEPLOYMENT.md          # 部署指南
├── DATA_MIGRATION.md      # 数据迁移指南
├── DEBUGGING.md           # 调试指南
└── AWS_PERMISSIONS.md     # AWS 权限配置
```

