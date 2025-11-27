#!/bin/bash
# 重置 Cognito 用户密码
# 使用方法: ./scripts/reset-password.sh [username] [new-password]
# 示例: ./scripts/reset-password.sh rodin NewPassword123

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
USERNAME="${1:-${USERNAME:-}}"
PASSWORD="${2:-${PASSWORD:-}}"

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

if [ -z "$USERNAME" ]; then
    echo "❌ 错误: 未指定用户名"
    echo ""
    echo "使用方法:"
    echo "  ./scripts/reset-password.sh <username> <new-password>"
    echo ""
    echo "或使用环境变量:"
    echo "  export USERNAME=rodin"
    echo "  export PASSWORD=NewPassword123"
    echo "  ./scripts/reset-password.sh"
    exit 1
fi

if [ -z "$PASSWORD" ]; then
    echo "❌ 错误: 未指定新密码"
    echo ""
    echo "使用方法:"
    echo "  ./scripts/reset-password.sh $USERNAME <new-password>"
    echo ""
    echo "或使用环境变量:"
    echo "  export PASSWORD=NewPassword123"
    echo "  ./scripts/reset-password.sh $USERNAME"
    exit 1
fi

# 验证密码复杂度要求
if [ ${#PASSWORD} -lt 8 ]; then
    echo "❌ 错误: 密码长度至少8位"
    exit 1
fi

echo "重置 Cognito 用户密码"
echo "用户池 ID: $USER_POOL_ID"
echo "区域: $REGION"
echo "用户名: $USERNAME"
echo ""

# 检查用户是否存在
echo "检查用户是否存在..."
if ! aws cognito-idp admin-get-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$USERNAME" \
    --region "$REGION" &>/dev/null; then
    echo "❌ 错误: 用户 '$USERNAME' 不存在"
    exit 1
fi

echo "✅ 用户存在"
echo ""
echo "正在重置密码..."

# 设置永久密码
aws cognito-idp admin-set-user-password \
    --user-pool-id "$USER_POOL_ID" \
    --username "$USERNAME" \
    --password "$PASSWORD" \
    --permanent \
    --region "$REGION"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 密码重置成功！"
    echo ""
    echo "用户信息:"
    echo "  用户名: $USERNAME"
    echo "  新密码: $PASSWORD"
    echo ""
    echo "现在可以使用新密码登录了。"
else
    echo "❌ 密码重置失败"
    exit 1
fi

