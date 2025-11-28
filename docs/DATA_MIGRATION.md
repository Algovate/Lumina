# 数据迁移指南

本指南说明如何将现有的 S3 图片数据迁移到 DynamoDB，以启用高性能排序功能。

## 前置条件

1. **DynamoDB 表已创建**
   - 运行部署脚本 `./scripts/deploy-cli.sh` 会自动创建表
   - 或手动创建表（参考部署脚本中的 DynamoDB 表创建部分）

2. **环境变量配置**
   - 确保 `backend/express/.env` 文件包含以下配置：
     ```env
     AWS_REGION=us-east-1
     S3_BUCKET=your-bucket-name
     AWS_ACCESS_KEY_ID=your-access-key
     AWS_SECRET_ACCESS_KEY=your-secret-key
     DYNAMODB_TABLE_NAME=lumina-images
     ```

3. **AWS 凭证配置**
   - 确保 AWS CLI 已配置正确的凭证
   - 或通过环境变量设置 `AWS_ACCESS_KEY_ID` 和 `AWS_SECRET_ACCESS_KEY`
   - 需要以下权限：
     - S3: `ListBucket`, `GetObject`, `HeadObject`
     - DynamoDB: `PutItem`, `BatchWriteItem`

## 迁移步骤

### 方法 1: 使用 npm 脚本（推荐）

```bash
cd backend/express

# 迁移所有图片（根目录）
npm run migrate

# 迁移特定文件夹的图片
npm run migrate "folder-name/"

# 迁移嵌套文件夹
npm run migrate "parent/child/"
```

### 方法 2: 直接使用 ts-node

```bash
cd backend/express

# 迁移所有图片
npx ts-node scripts/migrate-to-dynamodb.ts

# 迁移特定文件夹
npx ts-node scripts/migrate-to-dynamodb.ts "folder-name/"
```

### 方法 3: 编译后运行

```bash
cd backend/express

# 编译 TypeScript
npm run build

# 运行编译后的脚本
node dist/scripts/migrate-to-dynamodb.js [prefix]
```

## 迁移过程说明

迁移脚本会：

1. **扫描 S3 对象**
   - 使用 `ListObjectsV2` API 分页扫描所有图片
   - 跳过缩略图和预览图（`thumbnails/` 和 `previews/` 前缀）
   - 跳过文件夹（以 `/` 结尾的对象）

2. **提取元数据**
   - 从 S3 对象元数据中读取标签
   - 获取文件大小和修改时间
   - 检查是否存在缩略图和预览图

3. **批量写入 DynamoDB**
   - 每批最多 25 条记录（DynamoDB 限制）
   - 自动处理批处理逻辑
   - 显示迁移进度

4. **输出统计信息**
   - 处理的对象总数
   - 成功迁移的图片数量

## 示例输出

```
Starting migration for prefix: (root)
Processing batch of 100 objects...
Migrated 95 images (Total: 95)
Processing batch of 100 objects...
Migrated 98 images (Total: 193)
...
Migration completed. Processed: 500, Migrated: 485
Migration script finished
```

## 注意事项

### 1. 增量迁移

- 迁移脚本会**覆盖**已存在的记录（基于 `key` 主键）
- 可以安全地多次运行脚本，不会产生重复数据
- 如果图片已存在于 DynamoDB，会更新其元数据

### 2. 性能考虑

- **大量数据**：如果图片数量很多（>10,000），迁移可能需要较长时间
- **速率限制**：DynamoDB 有写入速率限制，脚本会自动批处理
- **建议**：对于大量数据，可以分批次迁移不同文件夹

### 3. 错误处理

- 如果某个图片处理失败，脚本会记录错误但继续处理其他图片
- 检查日志输出以了解哪些图片迁移失败
- 可以重新运行脚本，只会更新失败的记录

### 4. 文件夹迁移

如果需要迁移特定文件夹：

```bash
# 迁移根目录下的 "photos" 文件夹
npm run migrate "photos/"

# 迁移嵌套文件夹
npm run migrate "2024/vacation/"
```

### 5. 验证迁移结果

迁移完成后，可以通过以下方式验证：

```bash
# 使用 AWS CLI 查询 DynamoDB
aws dynamodb scan \
  --table-name lumina-images \
  --select COUNT \
  --region us-east-1

# 查询特定文件夹的图片
aws dynamodb query \
  --table-name lumina-images \
  --index-name GSI-date \
  --key-condition-expression "folder = :folder" \
  --expression-attribute-values '{":folder":{"S":""}}' \
  --region us-east-1
```

## 自动同步

迁移完成后，新上传、删除或更新的图片会自动同步到 DynamoDB：

- **上传**：新图片会自动写入 DynamoDB
- **删除**：删除图片时会同时删除 DynamoDB 记录
- **标签更新**：更新标签时会同步更新 DynamoDB

## 故障排除

### 问题 1: "S3_BUCKET not configured"

**解决方案**：确保 `.env` 文件中设置了 `S3_BUCKET` 环境变量

### 问题 2: "Table not found"

**解决方案**：
- 确保 DynamoDB 表已创建
- 检查 `DYNAMODB_TABLE_NAME` 环境变量是否正确
- 运行部署脚本创建表：`./scripts/deploy-cli.sh`

### 问题 3: "Access Denied"

**解决方案**：
- 检查 AWS 凭证是否正确配置
- 确保有 S3 和 DynamoDB 的访问权限
- 参考 `docs/AWS_PERMISSIONS.md` 配置权限

### 问题 4: 迁移速度慢

**解决方案**：
- 这是正常的，特别是对于大量数据
- 可以考虑增加 DynamoDB 表的写入容量（注意成本）
- 或分批次迁移不同文件夹

### 问题 5: 部分图片迁移失败

**解决方案**：
- 检查日志中的错误信息
- 重新运行脚本，失败的记录会被重试
- 确保 S3 对象可访问且元数据格式正确

## 回滚方案

如果需要回滚迁移（删除 DynamoDB 数据）：

```bash
# 警告：这会删除所有 DynamoDB 数据
aws dynamodb delete-table \
  --table-name lumina-images \
  --region us-east-1

# 然后重新创建表（通过部署脚本）
./scripts/deploy-cli.sh
```

**注意**：删除表后，需要重新运行迁移脚本。

## 最佳实践

1. **首次部署**：在部署新版本后立即运行迁移脚本
2. **定期同步**：如果直接操作了 S3（未通过 API），可以定期运行迁移脚本同步
3. **监控成本**：DynamoDB 按使用量计费，监控写入操作数量
4. **备份**：重要数据建议定期备份 DynamoDB 表

## 相关文档

- [AWS DynamoDB 文档](https://docs.aws.amazon.com/dynamodb/)
- [AWS S3 文档](https://docs.aws.amazon.com/s3/)
- [部署指南](../README.md#部署到-aws)

