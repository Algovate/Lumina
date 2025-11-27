#!/usr/bin/env bash
# 清理项目脚本
# 使用方法: ./scripts/clean.sh [选项]
# 选项:
#   --all: 清理所有内容（包括 node_modules）
#   --aws: 同时清理 AWS 资源（需要确认）
#   --help: 显示帮助信息

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CLEAN_NODE_MODULES=false
CLEAN_AWS=false

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --all)
            CLEAN_NODE_MODULES=true
            shift
            ;;
        --aws)
            CLEAN_AWS=true
            shift
            ;;
        --help)
            echo "清理项目脚本"
            echo ""
            echo "使用方法:"
            echo "  ./scripts/clean.sh [选项]"
            echo ""
            echo "选项:"
            echo "  --all    清理所有内容，包括 node_modules（默认只清理构建产物和临时文件）"
            echo "  --aws    同时清理 AWS 资源（Lambda、S3、Cognito 等，需要确认）"
            echo "  --help   显示此帮助信息"
            echo ""
            echo "示例:"
            echo "  ./scripts/clean.sh              # 清理构建产物和临时文件"
            echo "  ./scripts/clean.sh --all        # 同时清理 node_modules"
            echo "  ./scripts/clean.sh --aws        # 同时清理 AWS 资源"
            exit 0
            ;;
        *)
            echo "未知选项: $1"
            echo "使用 --help 查看帮助信息"
            exit 1
            ;;
    esac
done

cd "$PROJECT_ROOT"

echo "🧹 开始清理项目..."
echo ""

# 1. 清理构建产物
echo "📦 清理构建产物..."
rm -rf frontend/dist
rm -rf backend/express/dist
echo "  ✅ 已清理 dist/"
echo ""

# 2. 清理临时文件
echo "🗑️  清理临时文件..."
rm -f lambda-trust-policy.json
rm -f frontend-bucket-policy.json
rm -f lambda-cors-config.json
rm -f backend/lumina-backend.zip
rm -f frontend/.env.production.cli
echo "  ✅ 已清理临时 JSON 和配置文件"
echo ""

# 3. 清理日志文件
echo "📝 清理日志文件..."
find . -name "*.log" -type f -not -path "./node_modules/*" -not -path "./.git/*" -delete 2>/dev/null || true
echo "  ✅ 已清理日志文件"
echo ""

# 4. 清理缓存
echo "💾 清理缓存..."
rm -rf frontend/.vite
rm -rf .cache
rm -rf .parcel-cache
rm -rf .npm
rm -f .eslintcache
rm -f frontend/.eslintcache
rm -f backend/express/.eslintcache
echo "  ✅ 已清理缓存目录"
echo ""

# 5. 清理 TypeScript 构建信息
echo "🔨 清理 TypeScript 构建信息..."
find . -name "*.tsbuildinfo" -type f -not -path "./node_modules/*" -not -path "./.git/*" -delete 2>/dev/null || true
echo "  ✅ 已清理 TypeScript 构建信息"
echo ""

# 6. 清理打包文件
echo "📦 清理打包文件..."
find . -name "*.zip" -type f -not -path "./node_modules/*" -not -path "./.git/*" -delete 2>/dev/null || true
find . -name "*.tgz" -type f -not -path "./node_modules/*" -not -path "./.git/*" -delete 2>/dev/null || true
echo "  ✅ 已清理打包文件"
echo ""

# 7. 清理 node_modules（可选）
if [ "$CLEAN_NODE_MODULES" = true ]; then
    echo "📚 清理 node_modules..."
    rm -rf frontend/node_modules
    rm -rf backend/express/node_modules
    echo "  ✅ 已清理所有 node_modules/"
    echo ""
fi

# 8. 清理 AWS 资源（可选，需要确认）
if [ "$CLEAN_AWS" = true ]; then
    echo "☁️  清理 AWS 资源..."
    echo ""
    echo "⚠️  警告: 这将删除以下 AWS 资源:"
    echo "  - Lambda 函数: LuminaBackendCli"
    echo "  - S3 Buckets: lumina-images-rodin, lumina-frontend-rodin"
    echo "  - Cognito User Pool: lumina-user-pool-cli"
    echo "  - IAM Role: LuminaLambdaCliRole"
    echo ""
    read -p "确认删除这些资源? (输入 'yes' 确认): " -r
    echo
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        echo "已取消清理 AWS 资源"
    else
        AWS_REGION="${AWS_REGION:-us-east-1}"
        
        # 删除 Lambda 函数
        echo "  删除 Lambda 函数..."
        if aws lambda get-function --function-name LuminaBackendCli --region "${AWS_REGION}" >/dev/null 2>&1; then
            # 先删除 Function URL
            if aws lambda get-function-url-config --function-name LuminaBackendCli --region "${AWS_REGION}" >/dev/null 2>&1; then
                aws lambda delete-function-url-config --function-name LuminaBackendCli --region "${AWS_REGION}" >/dev/null 2>&1 || true
            fi
            aws lambda delete-function --function-name LuminaBackendCli --region "${AWS_REGION}" >/dev/null 2>&1 || true
            echo "    ✅ Lambda 函数已删除"
        else
            echo "    ⚠️  Lambda 函数不存在，跳过"
        fi
        
        # 删除 S3 Buckets
        echo "  删除 S3 Buckets..."
        for BUCKET in lumina-images-rodin lumina-frontend-rodin; do
            if aws s3api head-bucket --bucket "${BUCKET}" 2>/dev/null; then
                echo "    清空并删除 ${BUCKET}..."
                aws s3 rm "s3://${BUCKET}/" --recursive --region "${AWS_REGION}" >/dev/null 2>&1 || true
                aws s3api delete-bucket --bucket "${BUCKET}" --region "${AWS_REGION}" >/dev/null 2>&1 || true
                echo "    ✅ ${BUCKET} 已删除"
            else
                echo "    ⚠️  ${BUCKET} 不存在，跳过"
            fi
        done
        
        # 删除 Cognito User Pool
        echo "  删除 Cognito User Pool..."
        POOL_ID=$(aws cognito-idp list-user-pools \
            --max-results 60 \
            --region "${AWS_REGION}" \
            --query "UserPools[?Name=='lumina-user-pool-cli'].Id" \
            --output text 2>/dev/null | head -1)
        
        if [ -n "${POOL_ID}" ] && [ "${POOL_ID}" != "None" ]; then
            aws cognito-idp delete-user-pool --user-pool-id "${POOL_ID}" --region "${AWS_REGION}" >/dev/null 2>&1 || true
            echo "    ✅ Cognito User Pool 已删除"
        else
            echo "    ⚠️  Cognito User Pool 不存在，跳过"
        fi
        
        # 删除 IAM Role（需要先分离策略）
        echo "  删除 IAM Role..."
        if aws iam get-role --role-name LuminaLambdaCliRole >/dev/null 2>&1; then
            # 分离托管策略
            for POLICY_ARN in \
                "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" \
                "arn:aws:iam::aws:policy/AmazonS3FullAccess"; do
                aws iam detach-role-policy \
                    --role-name LuminaLambdaCliRole \
                    --policy-arn "${POLICY_ARN}" >/dev/null 2>&1 || true
            done
            # 删除角色
            aws iam delete-role --role-name LuminaLambdaCliRole >/dev/null 2>&1 || true
            echo "    ✅ IAM Role 已删除"
        else
            echo "    ⚠️  IAM Role 不存在，跳过"
        fi
        
        echo ""
        echo "  ✅ AWS 资源清理完成"
        echo ""
    fi
fi

echo "✨ 清理完成！"
echo ""
if [ "$CLEAN_NODE_MODULES" != true ]; then
    echo "提示: 使用 --all 选项可以同时清理 node_modules"
fi
if [ "$CLEAN_AWS" != true ]; then
    echo "提示: 使用 --aws 选项可以同时清理 AWS 资源"
fi

