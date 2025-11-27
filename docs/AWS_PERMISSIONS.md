---
noteId: "0db83291cb4611f09d2ddd4524ff0a50"
tags: []

---

# AWS 权限配置指南

本指南说明如何使用 AWS CLI 检查和配置 CLI 部署所需的权限。

## ⚠️ 重要提示

**如果您看到 "AccessDenied: User is not authorized to perform: iam:AttachUserPolicy" 错误**：

这表示您**无法自己给自己添加权限**。您需要：
1. **联系 AWS 账户管理员**为您添加权限
2. **或使用其他有权限的 AWS 凭证**

请跳转到 ["如果没有 IAM 权限"](#如果没有-iam-权限常见情况) 部分查看详细说明。

## 快速开始

如果您**已经有 IAM 权限**，可以直接运行：

```bash
# 附加管理员权限（最简单）
aws iam attach-user-policy \
  --user-name rodin \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

如果没有权限，请继续阅读下面的详细说明。

## 检查当前权限

### 1. 检查当前用户身份

```bash
aws sts get-caller-identity
```

输出示例：
```json
{
    "UserId": "AIDAI...",
    "Account": "807172405305",
    "Arn": "arn:aws:iam::807172405305:user/rodin"
}
```

### 2. 检查已附加的策略

```bash
# 列出附加到当前用户的策略
aws iam list-attached-user-policies --user-name rodin

# 列出内联策略
aws iam list-user-policies --user-name rodin

# 列出用户所属的组（组的策略也会应用）
aws iam get-groups-for-user --user-name rodin
```

### 3. 测试 S3 和 Lambda 权限

```bash
# 测试 S3 权限
aws s3api list-buckets 2>&1 | head -5

# 测试 Lambda 权限
aws lambda list-functions --max-items 5 2>&1 | head -5
```

## 添加权限（如果有 IAM 权限）

### 方法 1: 附加 AWS 托管策略（最简单）

```bash
# 附加 AdministratorAccess 策略（开发环境推荐）
aws iam attach-user-policy \
  --user-name rodin \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

# 或者使用 PowerUserAccess（权限较少，但仍然足够）
aws iam attach-user-policy \
  --user-name rodin \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess
```

### 方法 2: 创建并附加自定义策略

#### 步骤 1: 创建策略文档

创建文件 `cli-deploy-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:*",
        "lambda:*",
        "iam:*",
        "cognito-idp:*",
        "sts:GetCallerIdentity",
        "logs:*"
      ],
      "Resource": "*"
    }
  ]
}
```

#### 步骤 2: 创建策略

```bash
aws iam create-policy \
  --policy-name CLIDeployPolicy \
  --policy-document file://cli-deploy-policy.json \
  --description "Policy for CLI deployment"
```

输出会包含策略 ARN，例如：
```
arn:aws:iam::807172405305:policy/CLIDeployPolicy
```

#### 步骤 3: 附加策略到用户

```bash
aws iam attach-user-policy \
  --user-name rodin \
  --policy-arn arn:aws:iam::807172405305:policy/CLIDeployPolicy
```

### 方法 3: 使用 IAM 组（推荐用于团队）

#### 步骤 1: 创建组

```bash
aws iam create-group --group-name CLIDeployers
```

#### 步骤 2: 附加策略到组

```bash
# 附加 AdministratorAccess
aws iam attach-group-policy \
  --group-name CLIDeployers \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

#### 步骤 3: 将用户添加到组

```bash
aws iam add-user-to-group \
  --group-name CLIDeployers \
  --user-name rodin
```

## 如果没有 IAM 权限（常见情况）

如果您看到以下错误：
```
AccessDenied: User is not authorized to perform: iam:AttachUserPolicy
```

这意味着您**无法自己给自己添加权限**。这是 AWS 的安全机制。

### 解决方案

#### 方案 1: 联系 AWS 账户管理员（推荐）

请账户管理员（拥有 IAM 权限的用户）为您执行以下命令：

```bash
# 管理员需要运行的命令
aws iam attach-user-policy \
  --user-name rodin \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

或者请管理员在 AWS 控制台中：
1. 登录 AWS Console
2. 进入 IAM → Users → `rodin`
3. 点击 "Add permissions" → "Attach policies directly"
4. 搜索并附加 `AdministratorAccess` 策略

#### 方案 2: 检查是否通过组获得权限

```bash
# 检查您属于哪些组
aws iam get-groups-for-user --user-name rodin

# 检查组有哪些策略（需要替换 GROUP_NAME）
aws iam list-attached-group-policies --group-name GROUP_NAME
aws iam list-group-policies --group-name GROUP_NAME
```

如果有管理员权限的组，请求加入该组。

#### 方案 3: 使用不同的 AWS 凭证

如果您有其他 AWS 凭证（用户或角色）拥有足够权限：

```bash
# 切换到有权限的用户
aws configure --profile admin-user

# 或使用环境变量
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."

# 验证新凭证
aws sts get-caller-identity
```

#### 方案 4: 使用临时凭证（如果有 AssumeRole 权限）

如果您有 AssumeRole 权限（即使没有 IAM 权限），可以假设一个角色：

```bash
# 假设角色（需要替换 ROLE_ARN）
aws sts assume-role \
  --role-arn arn:aws:iam::807172405305:role/CLIDeployRole \
  --role-session-name cli-deploy-session
```

这会返回临时凭证，将其设置为环境变量：
```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_SESSION_TOKEN="..."
```

#### 方案 5: 检查根账户或账户管理员联系方式

如果您是账户所有者，可以使用根账户登录 AWS Console 直接修改权限。

### 使用临时凭证（如果有 AssumeRole 权限）

```bash
# 假设一个角色
aws sts assume-role \
  --role-arn arn:aws:iam::807172405305:role/CLIDeployRole \
  --role-session-name cli-deploy-session

# 输出会包含临时凭证，将其设置为环境变量
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_SESSION_TOKEN="..."
```

### 使用配置文件切换角色

编辑 `~/.aws/config`:

```ini
[profile cli-deploy]
role_arn = arn:aws:iam::807172405305:role/CLIDeployRole
source_profile = default
```

然后使用：
```bash
export AWS_PROFILE=cli-deploy
```

## 验证权限已生效

### 1. 等待权限传播（通常 1-5 分钟）

```bash
# 检查权限是否生效
aws iam get-user --user-name rodin
```

### 2. 测试 S3 访问

```bash
# 测试列出 Buckets
aws s3api list-buckets

# 如果没有错误，说明权限已生效
```

### 3. 测试 Lambda 访问

```bash
# 测试列出 Lambda 函数
aws lambda list-functions --max-items 5

# 如果成功，权限配置正确
```

## 最小权限策略（生产环境推荐）

如果不想使用 AdministratorAccess，可以使用以下最小权限策略：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:GetBucketLocation",
        "s3:GetBucketPolicy",
        "s3:PutBucketPolicy",
        "s3:PutBucketWebsite",
        "s3:PutPublicAccessBlock",
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:HeadObject",
        "lambda:CreateFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:GetFunction",
        "lambda:DeleteFunction",
        "lambda:CreateFunctionUrlConfig",
        "lambda:UpdateFunctionUrlConfig",
        "lambda:GetFunctionUrlConfig",
        "lambda:DeleteFunctionUrlConfig",
        "lambda:ListFunctions",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:PassRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:ListAttachedRolePolicies",
        "cognito-idp:CreateUserPool",
        "cognito-idp:DeleteUserPool",
        "cognito-idp:DescribeUserPool",
        "cognito-idp:ListUserPools",
        "cognito-idp:CreateUserPoolClient",
        "cognito-idp:UpdateUserPoolClient",
        "cognito-idp:DeleteUserPoolClient",
        "cognito-idp:ListUserPoolClients",
        "cognito-idp:CreateUserPoolDomain",
        "cognito-idp:DescribeUserPoolDomain",
        "cognito-idp:DeleteUserPoolDomain",
        "sts:GetCallerIdentity",
        "logs:CreateLogGroup",
        "logs:DescribeLogGroups",
        "logs:DeleteLogGroup"
      ],
      "Resource": "*"
    }
  ]
}
```

## 完整工作流程示例

```bash
# 1. 检查当前身份
aws sts get-caller-identity

# 2. 检查当前权限
aws iam list-attached-user-policies --user-name rodin

# 3. 如果没有权限，附加 AdministratorAccess（需要 IAM 权限）
aws iam attach-user-policy \
  --user-name rodin \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

# 4. 等待几分钟让权限生效

# 5. 验证权限
aws s3api list-buckets 2>&1

# 6. 如果成功，继续部署
./scripts/deploy-cli.sh
```

## 常见问题

### Q: 提示 "User is not authorized to perform: iam:AttachUserPolicy"

**A**: 您没有 IAM 权限来修改用户权限。需要：
- 联系 AWS 账户管理员
- 或使用有 IAM 权限的其他用户

### Q: 附加策略后仍然提示权限不足

**A**: 
1. 等待 1-5 分钟让权限传播
2. 检查是否附加到正确的用户：`aws iam list-attached-user-policies --user-name rodin`
3. 检查策略 ARN 是否正确

### Q: 如何查看策略的具体权限

```bash
# 获取策略文档
aws iam get-policy-version \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess \
  --version-id v1

# 查看用户的所有有效权限（包括组）
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::807172405305:user/rodin \
  --action-names cloudformation:DescribeStacks \
  --resource-arns "*"
```

## 相关文档

- [AWS IAM 文档](https://docs.aws.amazon.com/iam/)
- [AWS Lambda 权限](https://docs.aws.amazon.com/lambda/latest/dg/access-control-identity-based.html)
- [AWS S3 权限](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-overview.html)

