#!/bin/bash
# 创建 Cognito 用户
# 使用方法: ./scripts/create-user.sh [email] [password]
# 示例: ./scripts/create-user.sh user@example.com mypassword
# 注意: 由于 User Pool 配置了邮箱作为用户名，邮箱将同时作为用户名使用

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# 从环境变量获取配置，或从 AWS 查询
REGION="${REGION:-us-east-1}"
USER_POOL_NAME="${COGNITO_USER_POOL_NAME:-lumina-user-pool-cli}"

# 如果未设置 USER_POOL_ID，尝试从 AWS 查询
if [ -z "${USER_POOL_ID:-}" ]; then
    echo "正在查找 User Pool: ${USER_POOL_NAME}..."
    USER_POOL_ID=$(aws cognito-idp list-user-pools \
        --max-results 60 \
        --region "${REGION}" \
        --query "UserPools[?Name=='${USER_POOL_NAME}'].Id" \
        --output text 2>/dev/null | head -1)
    
    if [ -z "${USER_POOL_ID}" ] || [ "${USER_POOL_ID}" = "None" ]; then
        echo "⚠️  未找到 User Pool: ${USER_POOL_NAME}"
        echo "   请设置环境变量:"
        echo "   export USER_POOL_ID=us-east-1_XXXXXXXXX"
        echo "   export REGION=us-east-1"
        echo ""
        USER_POOL_ID=""
    fi
fi

# 从环境变量或参数获取值
# 注意：由于 User Pool 配置了 --username-attributes email，用户名必须是邮箱
# 参数格式: ./scripts/create-user.sh [email] [password]
EMAIL="${1:-${EMAIL:-rodin@example.com}}"
PASSWORD="${2:-${PASSWORD:-password}}"

# 使用邮箱作为用户名（因为 User Pool 配置了 --username-attributes email）
USERNAME="$EMAIL"

if [ -z "$USER_POOL_ID" ]; then
    echo "❌ 错误: 未设置 USER_POOL_ID"
    echo ""
    echo "请设置环境变量:"
    echo "  export USER_POOL_ID=us-east-1_XXXXXXXXX"
    echo "  export REGION=us-east-1"
    echo ""
    echo "或确保已通过 deploy-cli.sh 部署应用"
    exit 1
fi

echo "创建 Cognito 用户"
echo "用户池 ID: $USER_POOL_ID"
echo "区域: $REGION"
echo "邮箱/用户名: $EMAIL"
echo ""

# 创建用户（使用邮箱作为用户名）
echo "正在创建用户..."
aws cognito-idp admin-create-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$USERNAME" \
    --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
    --temporary-password "$PASSWORD" \
    --message-action SUPPRESS \
    --region "$REGION" 2>&1 | grep -v "An account with the given email already exists" || true

if [ ${PIPESTATUS[0]} -eq 0 ] || aws cognito-idp admin-get-user --user-pool-id "$USER_POOL_ID" --username "$USERNAME" --region "$REGION" &>/dev/null; then
    echo ""
    echo "设置永久密码..."
    
    # 设置永久密码
    aws cognito-idp admin-set-user-password \
        --user-pool-id "$USER_POOL_ID" \
        --username "$USERNAME" \
        --password "$PASSWORD" \
        --permanent \
        --region "$REGION"
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ 用户创建成功，密码已设置！"
        echo ""
        echo "登录凭据:"
        echo "  邮箱/用户名: $EMAIL"
        echo "  密码: $PASSWORD"
    else
        echo "❌ 设置密码失败"
        exit 1
    fi
else
    echo "❌ 用户创建失败"
    echo ""
    echo "如果用户已存在，可以直接设置密码："
    echo "aws cognito-idp admin-set-user-password \\"
    echo "    --user-pool-id $USER_POOL_ID \\"
    echo "    --username \"$EMAIL\" \\"
    echo "    --password \"$PASSWORD\" \\"
    echo "    --permanent \\"
    echo "    --region $REGION"
    exit 1
fi
