---
noteId: "adb1c840cb7f11f0b18ec3c7e0bf0b94"
tags: []

---

# 图片缓存验证指南

本文档说明如何验证图片缓存是否正常工作。

## 缓存配置概览

### 1. S3 对象缓存策略

- **原图**：`max-age=31536000, public` (1年缓存，公开)
- **缩略图**：`max-age=31536000, public` (1年缓存，公开)
- **预览图**：`max-age=31536000, public` (1年缓存，公开)

### 2. 预签名 URL 有效期

- **有效期**：7天（604800秒）
- 预签名 URL 会自动传递 S3 对象的 Cache-Control 元数据

## 验证步骤

### 方法 1：使用浏览器开发者工具

1. **打开开发者工具**
   - 按 `F12` 或右键点击页面选择"检查"
   - 切换到"网络"（Network）标签

2. **清除缓存并加载页面**
   - 按 `Ctrl+Shift+R` (Windows/Linux) 或 `Cmd+Shift+R` (Mac) 强制刷新
   - 观察图片请求的状态码

3. **检查首次加载**
   - 状态码应该是 `200`
   - 查看响应头中的 `Cache-Control` 字段
   - 应该看到：`Cache-Control: max-age=31536000, public`

4. **检查缓存命中**
   - 正常刷新页面（`F5`）
   - 如果图片从缓存加载，状态码可能是：
     - `200 (from disk cache)` - 从磁盘缓存加载
     - `200 (from memory cache)` - 从内存缓存加载
     - `304 Not Modified` - 服务器确认未修改，使用缓存

5. **查看响应头详情**
   - 点击图片请求
   - 查看"响应头"（Response Headers）部分
   - 确认包含以下字段：
     - `Cache-Control: max-age=31536000, public`
     - `ETag` - 用于缓存验证
     - `Last-Modified` - 最后修改时间

### 方法 2：使用 curl 命令

```bash
# 获取图片的预签名 URL（从浏览器开发者工具中复制）
IMAGE_URL="your-presigned-url-here"

# 首次请求
curl -I "$IMAGE_URL"

# 应该看到响应头：
# Cache-Control: max-age=31536000, public
# ETag: "..."
# Last-Modified: ...

# 使用条件请求验证缓存
curl -I -H "If-None-Match: <ETag-value>" "$IMAGE_URL"
# 如果缓存有效，应该返回 304 Not Modified
```

### 方法 3：检查预签名 URL 的有效期

1. **查看 URL 参数**
   - 预签名 URL 包含 `X-Amz-Expires` 参数
   - 值应该是 `604800`（7天）

2. **验证 URL 未过期**
   - 检查 URL 中的 `X-Amz-Date` 参数
   - 确保当前时间在有效期范围内

## 常见问题排查

### 问题 1：图片没有缓存头

**可能原因**：
- 图片是在添加缓存配置之前上传的
- 上传时没有正确设置 Cache-Control 头

**解决方法**：
- 重新上传图片，或使用 AWS CLI 更新现有对象的元数据：
  ```bash
  aws s3 cp s3://bucket-name/image.jpg s3://bucket-name/image.jpg \
    --metadata-directive REPLACE \
    --cache-control "max-age=31536000,public"
  ```

### 问题 2：浏览器显示 200 而不是 304

**说明**：
- 这是正常的，浏览器可能使用强缓存（200 from cache）而不是条件请求（304）
- 只要看到 `(from disk cache)` 或 `(from memory cache)` 就说明缓存生效

### 问题 3：预签名 URL 过期

**说明**：
- 预签名 URL 有效期为 7 天
- 过期后需要重新生成 URL
- 前端会自动处理 URL 刷新

## 性能优化建议

1. **使用 CDN**：如果可能，在 S3 前面添加 CloudFront CDN，进一步优化缓存
2. **监控缓存命中率**：使用浏览器开发者工具监控缓存命中情况
3. **定期检查**：定期验证缓存配置是否仍然有效

## 技术细节

### 缓存策略说明

- `max-age=31536000`：浏览器可以缓存 1 年（31536000 秒）
- `public`：允许 CDN 和代理服务器缓存
- `ETag`：用于条件请求，验证资源是否已修改
- `Last-Modified`：最后修改时间，用于缓存验证

### 预签名 URL 缓存传递

AWS S3 的预签名 URL 会自动传递对象的元数据，包括：
- Cache-Control
- Content-Type
- ETag
- Last-Modified

因此，通过预签名 URL 访问的图片会保留原始的缓存策略。

