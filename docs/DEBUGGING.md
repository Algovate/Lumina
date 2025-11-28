# 调试指南

本指南说明如何调试和排查 Lumina 应用的问题。

## 查看 Lambda 函数日志

### 方法 1: 使用 AWS CLI（推荐）

#### 查看最新的日志流

```bash
# 获取最新的日志流名称
aws logs describe-log-streams \
  --log-group-name /aws/lambda/LuminaBackendCli \
  --order-by LastEventTime \
  --descending \
  --max-items 1 \
  --region us-east-1 \
  --query 'logStreams[0].logStreamName' \
  --output text

# 查看最新的日志事件（最后 50 条）
aws logs tail /aws/lambda/LuminaBackendCli \
  --follow \
  --region us-east-1
```

#### 查看最近的日志（最后 100 条）

```bash
aws logs tail /aws/lambda/LuminaBackendCli \
  --since 1h \
  --region us-east-1
```

#### 查看特定时间段的日志

```bash
# 查看过去 1 小时的日志
aws logs tail /aws/lambda/LuminaBackendCli \
  --since 1h \
  --region us-east-1

# 查看过去 24 小时的日志
aws logs tail /aws/lambda/LuminaBackendCli \
  --since 24h \
  --region us-east-1

# 查看指定时间范围的日志
aws logs tail /aws/lambda/LuminaBackendCli \
  --since "2024-01-01T00:00:00" \
  --until "2024-01-01T23:59:59" \
  --region us-east-1
```

#### 实时跟踪日志（类似 tail -f）

```bash
aws logs tail /aws/lambda/LuminaBackendCli \
  --follow \
  --region us-east-1
```

#### 过滤错误日志

```bash
# 只显示包含 "ERROR" 或 "error" 的日志
aws logs tail /aws/lambda/LuminaBackendCli \
  --since 1h \
  --filter-pattern "ERROR error Error" \
  --region us-east-1
```

### 方法 2: 使用 AWS Console

1. **登录 AWS Console**
   - 访问 https://console.aws.amazon.com/
   - 选择正确的区域（如 `us-east-1`）

2. **打开 CloudWatch Logs**
   - 在搜索栏输入 "CloudWatch"
   - 点击 "CloudWatch" 服务
   - 在左侧菜单选择 "Logs" > "Log groups"

3. **查找 Lambda 函数的日志组**
   - 搜索 `/aws/lambda/LuminaBackendCli`
   - 点击日志组名称

4. **查看日志流**
   - 点击最新的日志流（按时间排序）
   - 查看日志事件

5. **使用过滤器**
   - 在搜索框输入关键词（如 "ERROR"）
   - 使用时间选择器过滤特定时间段

### 方法 3: 使用 AWS CLI 查看所有日志组

```bash
# 列出所有 Lambda 相关的日志组
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/Lumina" \
  --region us-east-1

# 输出示例：
# /aws/lambda/LuminaBackendCli
# /aws/lambda/LuminaThumbnailGenerator
```

### 方法 4: 查看缩略图生成 Lambda 的日志

```bash
aws logs tail /aws/lambda/LuminaThumbnailGenerator \
  --follow \
  --region us-east-1
```

## 常见问题排查

### 1. Lambda 函数执行失败

**查看错误日志：**
```bash
aws logs tail /aws/lambda/LuminaBackendCli \
  --since 1h \
  --filter-pattern "ERROR" \
  --region us-east-1
```

**检查函数配置：**
```bash
aws lambda get-function \
  --function-name LuminaBackendCli \
  --region us-east-1 \
  --query 'Configuration.[Runtime,Handler,Timeout,MemorySize,Environment]'
```

### 2. 权限问题

**检查 IAM 角色权限：**
```bash
aws iam get-role-policy \
  --role-name LuminaLambdaCliRole \
  --policy-name LuminaLambdaPolicy \
  --region us-east-1
```

### 3. 环境变量问题

**查看 Lambda 环境变量：**
```bash
aws lambda get-function-configuration \
  --function-name LuminaBackendCli \
  --region us-east-1 \
  --query 'Environment.Variables'
```

### 4. 函数超时

**检查函数执行时间：**
```bash
# 查看最近的执行报告（包含执行时间）
aws logs tail /aws/lambda/LuminaBackendCli \
  --since 1h \
  --filter-pattern "REPORT" \
  --region us-east-1
```

### 5. DynamoDB 连接问题

**查看 DynamoDB 相关错误：**
```bash
aws logs tail /aws/lambda/LuminaBackendCli \
  --since 1h \
  --filter-pattern "DynamoDB dynamodb" \
  --region us-east-1
```

## 有用的 AWS CLI 命令

### 测试 Lambda 函数

```bash
# 调用 Lambda 函数（通过 Function URL）
curl -X GET "https://qssqdktyddyc4dyqrwgxo7rnoa0lcpai.lambda-url.us-east-1.on.aws/api/health"

# 直接调用 Lambda 函数（需要权限）
aws lambda invoke \
  --function-name LuminaBackendCli \
  --region us-east-1 \
  --payload '{"httpMethod":"GET","path":"/api/health"}' \
  response.json
cat response.json
```

### 查看函数指标

```bash
# 查看函数调用次数
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=LuminaBackendCli \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region us-east-1

# 查看错误率
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=LuminaBackendCli \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region us-east-1
```

### 查看函数配置

```bash
# 查看完整函数配置
aws lambda get-function-configuration \
  --function-name LuminaBackendCli \
  --region us-east-1

# 查看函数代码位置
aws lambda get-function \
  --function-name LuminaBackendCli \
  --region us-east-1 \
  --query 'Code.Location'
```

## 日志格式说明

Lambda 函数的日志通常包含以下信息：

1. **START RequestId**: 请求开始
2. **执行日志**: 应用程序输出的日志（console.log, logger.info 等）
3. **REPORT RequestId**: 请求结束，包含：
   - Duration: 执行时间（毫秒）
   - Billed Duration: 计费时间
   - Memory Size: 分配的内存
   - Max Memory Used: 实际使用的最大内存
4. **END RequestId**: 请求结束标记
5. **错误信息**: 如果执行失败，会显示错误堆栈

## 快速调试脚本

创建一个便捷的调试脚本：

```bash
#!/bin/bash
# debug-lambda.sh

FUNCTION_NAME="${1:-LuminaBackendCli}"
REGION="${2:-us-east-1}"
SINCE="${3:-1h}"

echo "查看 Lambda 函数日志: ${FUNCTION_NAME}"
echo "区域: ${REGION}"
echo "时间范围: ${SINCE}"
echo "---"

aws logs tail "/aws/lambda/${FUNCTION_NAME}" \
  --since "${SINCE}" \
  --region "${REGION}" \
  --format short
```

使用方法：
```bash
chmod +x debug-lambda.sh
./debug-lambda.sh LuminaBackendCli us-east-1 1h
```

## 相关资源

- [AWS CloudWatch Logs 文档](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/WhatIsCloudWatchLogs.html)
- [AWS Lambda 监控文档](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs.html)
- [AWS CLI logs tail 命令文档](https://awscli.amazonaws.com/v2/documentation/api/latest/reference/logs/tail.html)

