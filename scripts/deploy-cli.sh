#!/usr/bin/env bash
set -euo pipefail

########################################
# 配置区域（可通过环境变量覆盖）
########################################

AWS_REGION="${AWS_REGION:-us-east-1}"

# 资源命名（需全局唯一，建议改成你自己的后缀）
IMAGE_BUCKET="${IMAGE_BUCKET:-lumina-images-rodin}"
FRONTEND_BUCKET="${FRONTEND_BUCKET:-lumina-frontend-rodin}"
LAMBDA_FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-LuminaBackendCli}"
THUMBNAIL_LAMBDA_FUNCTION_NAME="${THUMBNAIL_LAMBDA_FUNCTION_NAME:-LuminaThumbnailGenerator}"
LAMBDA_ROLE_NAME="${LAMBDA_ROLE_NAME:-LuminaLambdaCliRole}"
COGNITO_USER_POOL_NAME="${COGNITO_USER_POOL_NAME:-lumina-user-pool-cli}"
DYNAMODB_TABLE_NAME="${DYNAMODB_TABLE_NAME:-lumina-images}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Lumina CLI 部署 ==="
echo "Region:                ${AWS_REGION}"
echo "Image bucket:          ${IMAGE_BUCKET}"
echo "Frontend bucket:       ${FRONTEND_BUCKET}"
echo "Lambda function:       ${LAMBDA_FUNCTION_NAME}"
echo "Thumbnail Lambda:      ${THUMBNAIL_LAMBDA_FUNCTION_NAME}"
echo "Lambda role:           ${LAMBDA_ROLE_NAME}"
echo "Cognito pool:          ${COGNITO_USER_POOL_NAME}"
echo "DynamoDB table:        ${DYNAMODB_TABLE_NAME}"
echo ""

########################################
# 0. 检查 AWS CLI 身份
########################################
echo "[0] 检查 AWS 身份..."
aws sts get-caller-identity --output json >/dev/null
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "Account ID: ${ACCOUNT_ID}"
echo ""

########################################
# 1. 构建后端并打包 zip
########################################
echo "[1] 构建后端并打包 Lambda zip..."

cd "${ROOT_DIR}/backend/express"

if [ ! -d node_modules ]; then
  echo "  安装后端依赖..."
  npm install
fi

echo "  编译 TypeScript..."
npm run build

ZIP_PATH="${ROOT_DIR}/backend/lumina-backend.zip"
echo "  打包为 ${ZIP_PATH} ..."
rm -f "${ZIP_PATH}"
zip -qr "${ZIP_PATH}" dist package.json node_modules

cd "${ROOT_DIR}"
echo "✅ 后端打包完成"
echo ""

########################################
# 1.5. 构建缩略图生成 Lambda 函数
########################################
echo "[1.5] 构建缩略图生成 Lambda 函数..."

cd "${ROOT_DIR}/backend/thumbnail-generator"

if [ ! -d node_modules ]; then
  echo "  安装缩略图 Lambda 依赖..."
  npm install
fi

echo "  编译 TypeScript..."
npm run build

THUMBNAIL_ZIP_PATH="${ROOT_DIR}/backend/thumbnail-generator.zip"
echo "  打包为 ${THUMBNAIL_ZIP_PATH} ..."
rm -f "${THUMBNAIL_ZIP_PATH}"
zip -qr "${THUMBNAIL_ZIP_PATH}" dist package.json node_modules

cd "${ROOT_DIR}"
echo "✅ 缩略图 Lambda 打包完成"
echo ""

########################################
# 2. 创建/确认图片 S3 Bucket
########################################
echo "[2] 创建/确认图片 bucket: ${IMAGE_BUCKET}"

if aws s3api head-bucket --bucket "${IMAGE_BUCKET}" 2>/dev/null; then
  echo "  bucket 已存在，跳过创建"
else
  if [ "${AWS_REGION}" = "us-east-1" ]; then
    aws s3api create-bucket \
      --bucket "${IMAGE_BUCKET}" \
      --region "${AWS_REGION}"
  else
    aws s3api create-bucket \
      --bucket "${IMAGE_BUCKET}" \
      --region "${AWS_REGION}" \
      --create-bucket-configuration LocationConstraint="${AWS_REGION}"
  fi
  echo "  已创建 bucket: ${IMAGE_BUCKET}"
fi

# 配置 S3 bucket CORS 策略，允许前端直接上传
FRONTEND_ORIGIN="http://${FRONTEND_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com"
CORS_CONFIG=$(cat <<EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "${FRONTEND_ORIGIN}",
        "http://localhost:5173"
      ],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "x-amz-server-side-encryption", "x-amz-request-id", "x-amz-id-2"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF
)

echo "  配置 S3 bucket CORS 策略..."
echo "${CORS_CONFIG}" > /tmp/s3-cors-config.json
aws s3api put-bucket-cors \
  --bucket "${IMAGE_BUCKET}" \
  --cors-configuration file:///tmp/s3-cors-config.json \
  --region "${AWS_REGION}" >/dev/null 2>&1
rm -f /tmp/s3-cors-config.json

echo "✅ 图片 bucket 就绪（CORS 已配置）"
echo ""

########################################
# 3. 创建/确认 Lambda 角色和权限
########################################
echo "[3] 创建/确认 Lambda 角色: ${LAMBDA_ROLE_NAME}"

TRUST_POLICY_FILE="${ROOT_DIR}/lambda-trust-policy.json"
cat > "${TRUST_POLICY_FILE}" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

if aws iam get-role --role-name "${LAMBDA_ROLE_NAME}" >/dev/null 2>&1; then
  echo "  角色已存在，跳过创建"
else
  aws iam create-role \
    --role-name "${LAMBDA_ROLE_NAME}" \
    --assume-role-policy-document file://"${TRUST_POLICY_FILE}"
  echo "  已创建角色: ${LAMBDA_ROLE_NAME}"
fi

# 附加基础执行策略
aws iam attach-role-policy \
  --role-name "${LAMBDA_ROLE_NAME}" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole || true

# 开发环境：直接给 S3 全访问（需要更细权限时可以改成自定义策略）
aws iam attach-role-policy \
  --role-name "${LAMBDA_ROLE_NAME}" \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess || true

# Attach DynamoDB full access policy (for image metadata table)
aws iam attach-role-policy \
  --role-name "${LAMBDA_ROLE_NAME}" \
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess || true

LAMBDA_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${LAMBDA_ROLE_NAME}"

echo "  角色 ARN: ${LAMBDA_ROLE_ARN}"
echo "✅ Lambda 角色就绪"
echo ""

########################################
# 3.5. 创建/确认 Cognito User Pool
########################################
echo "[3.5] 创建/确认 Cognito User Pool: ${COGNITO_USER_POOL_NAME}"

# 检查 User Pool 是否已存在
EXISTING_POOL_ID=$(aws cognito-idp list-user-pools \
  --max-results 60 \
  --region "${AWS_REGION}" \
  --query "UserPools[?Name=='${COGNITO_USER_POOL_NAME}'].Id" \
  --output text 2>/dev/null | head -1)

if [ -n "${EXISTING_POOL_ID}" ] && [ "${EXISTING_POOL_ID}" != "None" ]; then
  echo "  User Pool 已存在: ${EXISTING_POOL_ID}"
  COGNITO_USER_POOL_ID="${EXISTING_POOL_ID}"
else
  echo "  创建 User Pool..."
  COGNITO_USER_POOL_ID=$(aws cognito-idp create-user-pool \
    --pool-name "${COGNITO_USER_POOL_NAME}" \
    --policies "PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=false}" \
    --auto-verified-attributes email \
    --username-attributes email \
    --region "${AWS_REGION}" \
    --query 'UserPool.Id' \
    --output text)
  echo "  已创建 User Pool: ${COGNITO_USER_POOL_ID}"
fi

# 创建 User Pool Domain（用于 OAuth）
COGNITO_DOMAIN_PREFIX="lumina-${ACCOUNT_ID}"
echo "  检查/创建 User Pool Domain: ${COGNITO_DOMAIN_PREFIX}..."

if aws cognito-idp describe-user-pool-domain \
  --domain "${COGNITO_DOMAIN_PREFIX}" \
  --region "${AWS_REGION}" >/dev/null 2>&1; then
  echo "  Domain 已存在"
else
  aws cognito-idp create-user-pool-domain \
    --domain "${COGNITO_DOMAIN_PREFIX}" \
    --user-pool-id "${COGNITO_USER_POOL_ID}" \
    --region "${AWS_REGION}" >/dev/null
  echo "  已创建 Domain: ${COGNITO_DOMAIN_PREFIX}"
fi

COGNITO_DOMAIN="${COGNITO_DOMAIN_PREFIX}.auth.${AWS_REGION}.amazoncognito.com"

# 创建 User Pool Client
echo "  检查/创建 User Pool Client..."
EXISTING_CLIENT_ID=$(aws cognito-idp list-user-pool-clients \
  --user-pool-id "${COGNITO_USER_POOL_ID}" \
  --region "${AWS_REGION}" \
  --query 'UserPoolClients[0].ClientId' \
  --output text 2>/dev/null)

if [ -n "${EXISTING_CLIENT_ID}" ] && [ "${EXISTING_CLIENT_ID}" != "None" ]; then
  echo "  Client 已存在: ${EXISTING_CLIENT_ID}"
  COGNITO_CLIENT_ID="${EXISTING_CLIENT_ID}"
else
  # 注意：Cognito 要求 callback URLs 使用 HTTPS（除了 localhost）
  # S3 静态网站只提供 HTTP，所以暂时只设置 localhost
  # 如果后续部署 CloudFront（HTTPS），可以更新 callback URLs
  COGNITO_CLIENT_ID=$(aws cognito-idp create-user-pool-client \
    --user-pool-id "${COGNITO_USER_POOL_ID}" \
    --client-name "lumina-client-cli" \
    --no-generate-secret \
    --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
    --supported-identity-providers COGNITO \
    --callback-urls "http://localhost:5173/,http://localhost:5173/auth/callback" \
    --logout-urls "http://localhost:5173/,http://localhost:5173/logout" \
    --allowed-o-auth-flows code \
    --allowed-o-auth-scopes openid email profile \
    --allowed-o-auth-flows-user-pool-client \
    --region "${AWS_REGION}" \
    --query 'UserPoolClient.ClientId' \
    --output text)
  echo "  已创建 Client: ${COGNITO_CLIENT_ID}"
  echo "  注意: Callback URLs 暂时只包含 localhost（HTTP）"
  echo "  如需在生产环境使用 OAuth，请部署 CloudFront（HTTPS）后更新 callback URLs"
fi

echo "  User Pool ID:  ${COGNITO_USER_POOL_ID}"
echo "  Client ID:     ${COGNITO_CLIENT_ID}"
echo "  Domain:        ${COGNITO_DOMAIN}"
echo "✅ Cognito 就绪"
echo ""

########################################
# 3.5. 创建/确认 DynamoDB 表
########################################
echo "[3.5] 创建/确认 DynamoDB 表: ${DYNAMODB_TABLE_NAME}"

if aws dynamodb describe-table --table-name "${DYNAMODB_TABLE_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
  echo "  表已存在，跳过创建"
else
  echo "  创建 DynamoDB 表..."
  aws dynamodb create-table \
    --table-name "${DYNAMODB_TABLE_NAME}" \
    --attribute-definitions \
      AttributeName=key,AttributeType=S \
      AttributeName=folder,AttributeType=S \
      AttributeName=name,AttributeType=S \
      AttributeName=lastModified,AttributeType=N \
      AttributeName=size,AttributeType=N \
      AttributeName=tagCount,AttributeType=N \
    --key-schema \
      AttributeName=key,KeyType=HASH \
    --global-secondary-indexes \
      "[
        {
          \"IndexName\": \"GSI-name\",
          \"KeySchema\": [
            {\"AttributeName\": \"folder\", \"KeyType\": \"HASH\"},
            {\"AttributeName\": \"name\", \"KeyType\": \"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\": \"ALL\"},
          \"ProvisionedThroughput\": {\"ReadCapacityUnits\": 5, \"WriteCapacityUnits\": 5}
        },
        {
          \"IndexName\": \"GSI-date\",
          \"KeySchema\": [
            {\"AttributeName\": \"folder\", \"KeyType\": \"HASH\"},
            {\"AttributeName\": \"lastModified\", \"KeyType\": \"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\": \"ALL\"},
          \"ProvisionedThroughput\": {\"ReadCapacityUnits\": 5, \"WriteCapacityUnits\": 5}
        },
        {
          \"IndexName\": \"GSI-size\",
          \"KeySchema\": [
            {\"AttributeName\": \"folder\", \"KeyType\": \"HASH\"},
            {\"AttributeName\": \"size\", \"KeyType\": \"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\": \"ALL\"},
          \"ProvisionedThroughput\": {\"ReadCapacityUnits\": 5, \"WriteCapacityUnits\": 5}
        },
        {
          \"IndexName\": \"GSI-tags\",
          \"KeySchema\": [
            {\"AttributeName\": \"folder\", \"KeyType\": \"HASH\"},
            {\"AttributeName\": \"tagCount\", \"KeyType\": \"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\": \"ALL\"},
          \"ProvisionedThroughput\": {\"ReadCapacityUnits\": 5, \"WriteCapacityUnits\": 5}
        }
      ]" \
    --billing-mode PROVISIONED \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region "${AWS_REGION}" >/dev/null

  echo "  等待表创建完成..."
  aws dynamodb wait table-exists \
    --table-name "${DYNAMODB_TABLE_NAME}" \
    --region "${AWS_REGION}"
  echo "✅ DynamoDB 表创建完成"
fi
echo ""

# 构建前端 URL（用于 Lambda CORS 配置）
FRONTEND_URL="http://${FRONTEND_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com"

########################################
# 4. 创建/更新 Lambda 函数 + Function URL
########################################
echo "[4] 创建/更新 Lambda 函数: ${LAMBDA_FUNCTION_NAME}"

if aws lambda get-function --function-name "${LAMBDA_FUNCTION_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
  echo "  函数已存在，更新代码..."
  aws lambda update-function-code \
    --function-name "${LAMBDA_FUNCTION_NAME}" \
    --zip-file fileb://"${ZIP_PATH}" \
    --region "${AWS_REGION}" >/dev/null

  echo "  等待函数更新完成..."
  aws lambda wait function-updated \
    --function-name "${LAMBDA_FUNCTION_NAME}" \
    --region "${AWS_REGION}"

  # Wait a bit more and check function state before updating configuration
  echo "  检查函数状态..."
  MAX_RETRIES=10
  RETRY_COUNT=0
  while [ ${RETRY_COUNT} -lt ${MAX_RETRIES} ]; do
    FUNCTION_STATE=$(aws lambda get-function \
      --function-name "${LAMBDA_FUNCTION_NAME}" \
      --region "${AWS_REGION}" \
      --query 'Configuration.State' \
      --output text 2>/dev/null)

    if [ "${FUNCTION_STATE}" = "Active" ]; then
      LAST_UPDATE_STATUS=$(aws lambda get-function \
        --function-name "${LAMBDA_FUNCTION_NAME}" \
        --region "${AWS_REGION}" \
        --query 'Configuration.LastUpdateStatus' \
        --output text 2>/dev/null)

      if [ "${LAST_UPDATE_STATUS}" = "Successful" ] || [ "${LAST_UPDATE_STATUS}" = "InProgress" ]; then
        # If still in progress, wait a bit more
        if [ "${LAST_UPDATE_STATUS}" = "InProgress" ]; then
          echo "    函数更新仍在进行中，等待 2 秒..."
          sleep 2
          RETRY_COUNT=$((RETRY_COUNT + 1))
          continue
        fi
        break
      fi
    fi

    echo "    等待函数就绪... (${RETRY_COUNT}/${MAX_RETRIES})"
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT + 1))
  done

  if [ ${RETRY_COUNT} -ge ${MAX_RETRIES} ]; then
    echo "  ⚠️  警告: 函数状态检查超时，但继续尝试更新配置..."
  fi

  echo "  更新函数配置..."
  # Retry configuration update with exponential backoff
  MAX_CONFIG_RETRIES=5
  CONFIG_RETRY_COUNT=0
  CONFIG_UPDATE_SUCCESS=false

  while [ ${CONFIG_RETRY_COUNT} -lt ${MAX_CONFIG_RETRIES} ]; do
    echo "    尝试更新配置... ($((CONFIG_RETRY_COUNT + 1))/${MAX_CONFIG_RETRIES})"
    # Use timeout to prevent hanging (macOS uses gtimeout if available, otherwise use timeout)
    if command -v gtimeout >/dev/null 2>&1; then
      UPDATE_OUTPUT=$(gtimeout 30 aws lambda update-function-configuration \
        --function-name "${LAMBDA_FUNCTION_NAME}" \
        --role "${LAMBDA_ROLE_ARN}" \
        --runtime nodejs20.x \
        --handler dist/lambda.handler \
        --timeout 30 \
        --memory-size 512 \
        --environment "Variables={S3_BUCKET=${IMAGE_BUCKET},COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID},COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID},FRONTEND_URL=${FRONTEND_URL},DYNAMODB_TABLE_NAME=${DYNAMODB_TABLE_NAME}}" \
        --region "${AWS_REGION}" 2>&1)
      UPDATE_EXIT_CODE=$?
    elif command -v timeout >/dev/null 2>&1; then
      UPDATE_OUTPUT=$(timeout 30 aws lambda update-function-configuration \
        --function-name "${LAMBDA_FUNCTION_NAME}" \
        --role "${LAMBDA_ROLE_ARN}" \
        --runtime nodejs20.x \
        --handler dist/lambda.handler \
        --timeout 30 \
        --memory-size 512 \
        --environment "Variables={S3_BUCKET=${IMAGE_BUCKET},COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID},COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID},FRONTEND_URL=${FRONTEND_URL},DYNAMODB_TABLE_NAME=${DYNAMODB_TABLE_NAME}}" \
        --region "${AWS_REGION}" 2>&1)
      UPDATE_EXIT_CODE=$?
    else
      # Fallback: run without timeout but with explicit error handling
      UPDATE_OUTPUT=$(aws lambda update-function-configuration \
        --function-name "${LAMBDA_FUNCTION_NAME}" \
        --role "${LAMBDA_ROLE_ARN}" \
        --runtime nodejs20.x \
        --handler dist/lambda.handler \
        --timeout 30 \
        --memory-size 512 \
        --environment "Variables={S3_BUCKET=${IMAGE_BUCKET},COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID},COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID},FRONTEND_URL=${FRONTEND_URL},DYNAMODB_TABLE_NAME=${DYNAMODB_TABLE_NAME}}" \
        --region "${AWS_REGION}" 2>&1)
      UPDATE_EXIT_CODE=$?
    fi

    if [ ${UPDATE_EXIT_CODE} -eq 0 ]; then
      echo "    ✅ 配置更新命令执行成功"
      CONFIG_UPDATE_SUCCESS=true
      break
    elif [ ${UPDATE_EXIT_CODE} -eq 124 ] || echo "${UPDATE_OUTPUT}" | grep -q "timeout\|timed out"; then
      echo "    ⚠️  配置更新命令超时，重试..."
      CONFIG_RETRY_COUNT=$((CONFIG_RETRY_COUNT + 1))
      sleep 2
      continue
    elif echo "${UPDATE_OUTPUT}" | grep -q "ResourceConflictException"; then
      if [ ${CONFIG_RETRY_COUNT} -lt $((MAX_CONFIG_RETRIES - 1)) ]; then
        WAIT_TIME=$((2 ** CONFIG_RETRY_COUNT))
        echo "    配置更新冲突，等待 ${WAIT_TIME} 秒后重试... ($((CONFIG_RETRY_COUNT + 1))/${MAX_CONFIG_RETRIES})"
        sleep ${WAIT_TIME}
        CONFIG_RETRY_COUNT=$((CONFIG_RETRY_COUNT + 1))
      else
        echo "  ⚠️  警告: 配置更新冲突，已达到最大重试次数，继续部署流程..."
        CONFIG_UPDATE_SUCCESS=false
        break
      fi
    else
      echo "  ❌ 错误: 配置更新失败: ${UPDATE_OUTPUT}"
      CONFIG_UPDATE_SUCCESS=false
      break
    fi
  done

  if [ "${CONFIG_UPDATE_SUCCESS}" = "true" ]; then
    echo "  等待配置更新完成..."
    # Poll function status with timeout instead of using wait command
    MAX_WAIT=60
    WAIT_COUNT=0
    while [ ${WAIT_COUNT} -lt ${MAX_WAIT} ]; do
      LAST_UPDATE_STATUS=$(aws lambda get-function \
        --function-name "${LAMBDA_FUNCTION_NAME}" \
        --region "${AWS_REGION}" \
        --query 'Configuration.LastUpdateStatus' \
        --output text 2>/dev/null || echo "Unknown")
      
      if [ "${LAST_UPDATE_STATUS}" = "Unknown" ]; then
        echo "    ⚠️  无法获取函数状态，继续等待..."
      fi
      
      if [ "${LAST_UPDATE_STATUS}" = "Successful" ]; then
        echo "  ✅ 函数配置更新成功"
        break
      elif [ "${LAST_UPDATE_STATUS}" = "Failed" ]; then
        echo "  ⚠️  警告: 函数配置更新失败，但继续部署流程..."
        break
      fi
      
      sleep 2
      WAIT_COUNT=$((WAIT_COUNT + 2))
      if [ $((WAIT_COUNT % 10)) -eq 0 ]; then
        echo "    等待中... (${WAIT_COUNT}/${MAX_WAIT}秒)"
      fi
    done
    
    if [ ${WAIT_COUNT} -ge ${MAX_WAIT} ]; then
      echo "  ⚠️  警告: 等待函数更新超时，但继续部署流程..."
    fi
  else
    echo "  ⚠️  警告: 配置更新未成功，但继续部署流程..."
  fi
else
  echo "  函数不存在，创建中..."
  aws lambda create-function \
    --function-name "${LAMBDA_FUNCTION_NAME}" \
    --runtime nodejs20.x \
    --role "${LAMBDA_ROLE_ARN}" \
    --handler dist/lambda.handler \
    --timeout 30 \
    --memory-size 512 \
    --zip-file fileb://"${ZIP_PATH}" \
    --environment "Variables={S3_BUCKET=${IMAGE_BUCKET},COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID},COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID},FRONTEND_URL=${FRONTEND_URL},DYNAMODB_TABLE_NAME=${DYNAMODB_TABLE_NAME}}" \
    --region "${AWS_REGION}" >/dev/null

  echo "  等待函数创建完成..."
  # Poll function state with timeout instead of using wait command
  MAX_WAIT=120
  WAIT_COUNT=0
  while [ ${WAIT_COUNT} -lt ${MAX_WAIT} ]; do
    FUNCTION_STATE=$(aws lambda get-function \
      --function-name "${LAMBDA_FUNCTION_NAME}" \
      --region "${AWS_REGION}" \
      --query 'Configuration.State' \
      --output text 2>/dev/null || echo "Unknown")
    
    if [ "${FUNCTION_STATE}" = "Active" ]; then
      echo "  ✅ 函数已激活"
      break
    elif [ "${FUNCTION_STATE}" = "Failed" ]; then
      echo "  ⚠️  警告: 函数创建失败，但继续部署流程..."
      break
    fi
    
    sleep 2
    WAIT_COUNT=$((WAIT_COUNT + 2))
    if [ $((WAIT_COUNT % 10)) -eq 0 ]; then
      echo "    等待中... (${WAIT_COUNT}/${MAX_WAIT}秒)"
    fi
  done
  
  if [ ${WAIT_COUNT} -ge ${MAX_WAIT} ]; then
    echo "  ⚠️  警告: 等待函数激活超时，但继续部署流程..."
  fi
fi

# 创建或更新 Function URL
# 注意：Lambda Function URL 需要在 URL 层面配置 CORS 来处理预检请求
# Express 的 CORS 中间件会处理实际请求的 CORS 头
FRONTEND_ORIGIN="http://${FRONTEND_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com"

if aws lambda get-function-url-config --function-name "${LAMBDA_FUNCTION_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
  echo "  更新函数 URL CORS 配置..."
  aws lambda update-function-url-config \
    --function-name "${LAMBDA_FUNCTION_NAME}" \
    --cors "{\"AllowOrigins\":[\"${FRONTEND_ORIGIN}\",\"http://localhost:5173\"],\"AllowMethods\":[\"*\"],\"AllowHeaders\":[\"*\"],\"ExposeHeaders\":[\"*\"],\"MaxAge\":86400}" \
    --region "${AWS_REGION}" >/dev/null
else
  echo "  创建函数 URL..."
  aws lambda create-function-url-config \
    --function-name "${LAMBDA_FUNCTION_NAME}" \
    --auth-type NONE \
    --cors "{\"AllowOrigins\":[\"${FRONTEND_ORIGIN}\",\"http://localhost:5173\"],\"AllowMethods\":[\"*\"],\"AllowHeaders\":[\"*\"],\"ExposeHeaders\":[\"*\"],\"MaxAge\":86400}" \
    --region "${AWS_REGION}" >/dev/null
fi

FUNCTION_URL="$(aws lambda get-function-url-config --function-name "${LAMBDA_FUNCTION_NAME}" --region "${AWS_REGION}" --query FunctionUrl --output text)"
API_URL="${FUNCTION_URL%/}/api"

echo "  Function URL: ${FUNCTION_URL}"
echo "  API URL:      ${API_URL}"
echo "✅ Lambda 就绪"
echo ""

########################################
# 4.5. 创建/更新缩略图生成 Lambda 函数
########################################
echo "[4.5] 创建/更新缩略图生成 Lambda 函数: ${THUMBNAIL_LAMBDA_FUNCTION_NAME}"

if aws lambda get-function --function-name "${THUMBNAIL_LAMBDA_FUNCTION_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
  echo "  函数已存在，更新代码..."
  aws lambda update-function-code \
    --function-name "${THUMBNAIL_LAMBDA_FUNCTION_NAME}" \
    --zip-file fileb://"${THUMBNAIL_ZIP_PATH}" \
    --region "${AWS_REGION}" >/dev/null

  echo "  等待函数更新完成..."
  aws lambda wait function-updated \
    --function-name "${THUMBNAIL_LAMBDA_FUNCTION_NAME}" \
    --region "${AWS_REGION}"

  echo "  更新函数配置..."
  aws lambda update-function-configuration \
    --function-name "${THUMBNAIL_LAMBDA_FUNCTION_NAME}" \
    --role "${LAMBDA_ROLE_ARN}" \
    --runtime nodejs20.x \
    --handler dist/handler.handler \
    --timeout 30 \
    --memory-size 512 \
    --environment "Variables={S3_BUCKET=${IMAGE_BUCKET}}" \
    --region "${AWS_REGION}" >/dev/null 2>&1 || true

  echo "  等待配置更新完成..."
  aws lambda wait function-updated \
    --function-name "${THUMBNAIL_LAMBDA_FUNCTION_NAME}" \
    --region "${AWS_REGION}" || true
else
  echo "  函数不存在，创建中..."
  aws lambda create-function \
    --function-name "${THUMBNAIL_LAMBDA_FUNCTION_NAME}" \
    --runtime nodejs20.x \
    --role "${LAMBDA_ROLE_ARN}" \
    --handler dist/handler.handler \
    --timeout 30 \
    --memory-size 512 \
    --zip-file fileb://"${THUMBNAIL_ZIP_PATH}" \
    --environment "Variables={S3_BUCKET=${IMAGE_BUCKET}}" \
    --region "${AWS_REGION}" >/dev/null

  echo "  等待函数创建完成..."
  aws lambda wait function-active \
    --function-name "${THUMBNAIL_LAMBDA_FUNCTION_NAME}" \
    --region "${AWS_REGION}"
fi

THUMBNAIL_LAMBDA_ARN="arn:aws:lambda:${AWS_REGION}:${ACCOUNT_ID}:function:${THUMBNAIL_LAMBDA_FUNCTION_NAME}"

echo "  函数 ARN: ${THUMBNAIL_LAMBDA_ARN}"
echo "✅ 缩略图 Lambda 就绪"
echo ""

########################################
# 4.6. 配置 S3 事件通知触发缩略图 Lambda
########################################
echo "[4.6] 配置 S3 事件通知..."

# 检查是否已存在事件通知配置
EXISTING_NOTIFICATION=$(aws s3api get-bucket-notification-configuration \
  --bucket "${IMAGE_BUCKET}" \
  --region "${AWS_REGION}" 2>/dev/null || echo "{}")

# 检查 Lambda 配置是否已存在
LAMBDA_CONFIG_EXISTS=$(echo "${EXISTING_NOTIFICATION}" | grep -q "${THUMBNAIL_LAMBDA_ARN}" && echo "true" || echo "false")

if [ "${LAMBDA_CONFIG_EXISTS}" = "true" ]; then
  echo "  S3 事件通知已配置，跳过"
else
  echo "  配置 S3 事件通知..."

  # 授予 S3 权限调用 Lambda
  echo "  授予 S3 权限调用 Lambda..."
  aws lambda add-permission \
    --function-name "${THUMBNAIL_LAMBDA_FUNCTION_NAME}" \
    --principal s3.amazonaws.com \
    --statement-id "s3-trigger-${IMAGE_BUCKET}" \
    --action "lambda:InvokeFunction" \
    --source-arn "arn:aws:s3:::${IMAGE_BUCKET}" \
    --source-account "${ACCOUNT_ID}" \
    --region "${AWS_REGION}" >/dev/null 2>&1 || echo "  权限可能已存在，继续..."

  # 配置 S3 事件通知
  # 注意：S3 事件通知的 Filter 不支持排除前缀，所以我们使用 Lambda 函数内部逻辑来处理
  # Lambda 函数会跳过 thumbnails/ 前缀的文件，避免递归触发
  # 我们为每种图片格式创建单独的配置，因为 S3 不支持 OR 条件

  NOTIFICATION_CONFIG=$(cat <<EOF
{
  "LambdaFunctionConfigurations": [
    {
      "Id": "ThumbnailGeneratorTriggerJpg",
      "LambdaFunctionArn": "${THUMBNAIL_LAMBDA_ARN}",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [
            {
              "Name": "Suffix",
              "Value": ".jpg"
            }
          ]
        }
      }
    },
    {
      "Id": "ThumbnailGeneratorTriggerJpeg",
      "LambdaFunctionArn": "${THUMBNAIL_LAMBDA_ARN}",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [
            {
              "Name": "Suffix",
              "Value": ".jpeg"
            }
          ]
        }
      }
    },
    {
      "Id": "ThumbnailGeneratorTriggerPng",
      "LambdaFunctionArn": "${THUMBNAIL_LAMBDA_ARN}",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [
            {
              "Name": "Suffix",
              "Value": ".png"
            }
          ]
        }
      }
    },
    {
      "Id": "ThumbnailGeneratorTriggerGif",
      "LambdaFunctionArn": "${THUMBNAIL_LAMBDA_ARN}",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [
            {
              "Name": "Suffix",
              "Value": ".gif"
            }
          ]
        }
      }
    },
    {
      "Id": "ThumbnailGeneratorTriggerWebp",
      "LambdaFunctionArn": "${THUMBNAIL_LAMBDA_ARN}",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [
            {
              "Name": "Suffix",
              "Value": ".webp"
            }
          ]
        }
      }
    }
  ]
}
EOF
)

  echo "${NOTIFICATION_CONFIG}" > /tmp/s3-notification-config.json
  aws s3api put-bucket-notification-configuration \
    --bucket "${IMAGE_BUCKET}" \
    --notification-configuration file:///tmp/s3-notification-config.json \
    --region "${AWS_REGION}" >/dev/null
  rm -f /tmp/s3-notification-config.json

  echo "✅ S3 事件通知配置完成"
fi

echo ""

########################################
# 5. 构建前端并写入 API_URL（简单模式）
########################################
echo "[5] 构建前端..."

cd "${ROOT_DIR}/frontend"

if [ ! -d node_modules ]; then
  echo "  安装前端依赖..."
  npm install
fi

# 这里采用 .env 方式简单注入，必要时你可以改为写 config.js
ENV_FILE=".env.production.cli"
cat > "${ENV_FILE}" <<EOF
VITE_API_URL=${API_URL}
VITE_AWS_REGION=${AWS_REGION}
VITE_S3_BUCKET=${IMAGE_BUCKET}
VITE_COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID}
VITE_COGNITO_USER_POOL_CLIENT_ID=${COGNITO_CLIENT_ID}
VITE_COGNITO_DOMAIN=${COGNITO_DOMAIN}
EOF

echo "  使用 ${ENV_FILE} 作为构建环境变量"
VITE_API_URL="${API_URL}" \
VITE_AWS_REGION="${AWS_REGION}" \
VITE_S3_BUCKET="${IMAGE_BUCKET}" \
VITE_COGNITO_USER_POOL_ID="${COGNITO_USER_POOL_ID}" \
VITE_COGNITO_USER_POOL_CLIENT_ID="${COGNITO_CLIENT_ID}" \
VITE_COGNITO_DOMAIN="${COGNITO_DOMAIN}" \
npm run build

# 生成运行时配置文件 config.js
echo "  生成运行时配置文件 config.js..."
CONFIG_JS_PATH="${ROOT_DIR}/frontend/dist/config.js"
cat > "${CONFIG_JS_PATH}" <<EOF
// 运行时配置文件
// 此文件在部署时自动生成
window.LUMINA_CONFIG = {
  VITE_API_URL: "${API_URL}",
  VITE_AWS_REGION: "${AWS_REGION}",
  VITE_S3_BUCKET: "${IMAGE_BUCKET}",
  VITE_COGNITO_USER_POOL_ID: "${COGNITO_USER_POOL_ID}",
  VITE_COGNITO_USER_POOL_CLIENT_ID: "${COGNITO_CLIENT_ID}",
  VITE_COGNITO_DOMAIN: "${COGNITO_DOMAIN}",
};
EOF

cd "${ROOT_DIR}"
echo "✅ 前端构建完成"
echo ""

########################################
# 6. 创建/配置前端静态网站 Bucket
########################################
echo "[6] 创建/配置前端 bucket: ${FRONTEND_BUCKET}"

if aws s3api head-bucket --bucket "${FRONTEND_BUCKET}" 2>/dev/null; then
  echo "  bucket 已存在，跳过创建"
else
  if [ "${AWS_REGION}" = "us-east-1" ]; then
    aws s3api create-bucket \
      --bucket "${FRONTEND_BUCKET}" \
      --region "${AWS_REGION}"
  else
    aws s3api create-bucket \
      --bucket "${FRONTEND_BUCKET}" \
      --region "${AWS_REGION}" \
      --create-bucket-configuration LocationConstraint="${AWS_REGION}"
  fi
  echo "  已创建 bucket: ${FRONTEND_BUCKET}"
fi

# 关闭 Block Public Access（允许设置公开策略）
echo "  关闭 Block Public Access..."
aws s3api put-public-access-block \
  --bucket "${FRONTEND_BUCKET}" \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# 启用静态网站
echo "  启用静态网站托管..."
aws s3 website "s3://${FRONTEND_BUCKET}" \
  --index-document index.html \
  --error-document index.html

# 配置只读公开策略
echo "  设置公开读取策略..."
FRONTEND_POLICY_FILE="${ROOT_DIR}/frontend-bucket-policy.json"
cat > "${FRONTEND_POLICY_FILE}" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPublicReadForStaticWebsite",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${FRONTEND_BUCKET}/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy \
  --bucket "${FRONTEND_BUCKET}" \
  --policy file://"${FRONTEND_POLICY_FILE}"

echo "✅ 前端 bucket 就绪"
echo ""

########################################
# 7. 上传前端静态文件
########################################
echo "[7] 同步前端静态文件到 S3..."

aws s3 sync "${ROOT_DIR}/frontend/dist/" "s3://${FRONTEND_BUCKET}/" --delete

SITE_URL="http://${FRONTEND_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com"

echo "✅ 前端 bucket 就绪"
echo ""

########################################
# 7. 创建/确认 CloudFront Distribution (HTTPS)
########################################
echo "[7] 创建/确认 CloudFront Distribution (HTTPS)..."

# 检查是否已存在针对该 Bucket 的 Distribution
# 注意：这里简单通过 Origin Domain Name 来查找
S3_ORIGIN_DOMAIN="${FRONTEND_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com"

EXISTING_DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Origins.Items[0].DomainName=='${S3_ORIGIN_DOMAIN}'].Id" \
  --output text 2>/dev/null | head -1)

if [ -n "${EXISTING_DIST_ID}" ] && [ "${EXISTING_DIST_ID}" != "None" ]; then
  echo "  Distribution 已存在: ${EXISTING_DIST_ID}"
  CLOUDFRONT_DIST_ID="${EXISTING_DIST_ID}"
else
  echo "  创建 CloudFront Distribution (这可能需要几分钟)..."
  # 创建 Distribution 配置
  # 注意：这里使用 S3 Website Endpoint 作为 Origin，而不是 S3 Bucket Endpoint
  # 这样可以利用 S3 Website 的路由规则（如 index.html, error.html）
  
  CLOUDFRONT_DIST_ID=$(aws cloudfront create-distribution \
    --distribution-config "{
      \"CallerReference\": \"$(date +%s)\",
      \"Aliases\": {\"Quantity\": 0},
      \"DefaultRootObject\": \"index.html\",
      \"Origins\": {
        \"Quantity\": 1,
        \"Items\": [
          {
            \"Id\": \"S3-${FRONTEND_BUCKET}\",
            \"DomainName\": \"${S3_ORIGIN_DOMAIN}\",
            \"OriginPath\": \"\",
            \"CustomHeaders\": {\"Quantity\": 0},
            \"CustomOriginConfig\": {
              \"HTTPPort\": 80,
              \"HTTPSPort\": 443,
              \"OriginProtocolPolicy\": \"http-only\",
              \"OriginSslProtocols\": {
                \"Quantity\": 3,
                \"Items\": [\"TLSv1\", \"TLSv1.1\", \"TLSv1.2\"]
              },
              \"OriginReadTimeout\": 30,
              \"OriginKeepaliveTimeout\": 5
            }
          }
        ]
      },
      \"OriginGroups\": {\"Quantity\": 0},
      \"DefaultCacheBehavior\": {
        \"TargetOriginId\": \"S3-${FRONTEND_BUCKET}\",
        \"ForwardedValues\": {
          \"QueryString\": false,
          \"Cookies\": {\"Forward\": \"none\"},
          \"Headers\": {\"Quantity\": 0},
          \"QueryStringCacheKeys\": {\"Quantity\": 0}
        },
        \"TrustedSigners\": {\"Enabled\": false, \"Quantity\": 0},
        \"ViewerProtocolPolicy\": \"redirect-to-https\",
        \"MinTTL\": 0,
        \"AllowedMethods\": {
          \"Quantity\": 2,
          \"Items\": [\"GET\", \"HEAD\"],
          \"CachedMethods\": {
            \"Quantity\": 2,
            \"Items\": [\"GET\", \"HEAD\"]
          }
        },
        \"SmoothStreaming\": false,
        \"DefaultTTL\": 86400,
        \"MaxTTL\": 31536000,
        \"Compress\": true,
        \"LambdaFunctionAssociations\": {\"Quantity\": 0},
        \"FieldLevelEncryptionId\": \"\"
      },
      \"CacheBehaviors\": {\"Quantity\": 0},
      \"CustomErrorResponses\": {
        \"Quantity\": 2,
        \"Items\": [
          {
            \"ErrorCode\": 403,
            \"ResponsePagePath\": \"/index.html\",
            \"ResponseCode\": \"200\",
            \"ErrorCachingMinTTL\": 300
          },
          {
            \"ErrorCode\": 404,
            \"ResponsePagePath\": \"/index.html\",
            \"ResponseCode\": \"200\",
            \"ErrorCachingMinTTL\": 300
          }
        ]
      },
      \"Comment\": \"Lumina Frontend (${FRONTEND_BUCKET})\",
      \"Logging\": {
        \"Enabled\": false,
        \"IncludeCookies\": false,
        \"Bucket\": \"\",
        \"Prefix\": \"\"
      },
      \"PriceClass\": \"PriceClass_All\",
      \"Enabled\": true
    }" \
    --query 'Distribution.Id' \
    --output text)
    
  echo "  已创建 Distribution: ${CLOUDFRONT_DIST_ID}"
fi

# 获取 CloudFront 域名
if [ -n "${CLOUDFRONT_DIST_ID}" ] && [ "${CLOUDFRONT_DIST_ID}" != "None" ]; then
  CLOUDFRONT_DOMAIN=$(aws cloudfront get-distribution \
    --id "${CLOUDFRONT_DIST_ID}" \
    --query 'Distribution.DomainName' \
    --output text 2>/dev/null)
  
  if [ -n "${CLOUDFRONT_DOMAIN}" ]; then
    HTTPS_SITE_URL="https://${CLOUDFRONT_DOMAIN}"
    echo "  CloudFront 域名: ${HTTPS_SITE_URL}"
    echo "✅ CloudFront 就绪"
  else
    echo "  ⚠️  警告: 无法获取 CloudFront 域名，跳过 HTTPS 配置"
    HTTPS_SITE_URL=""
  fi
else
  echo "  ⚠️  警告: CloudFront Distribution 未创建，跳过 HTTPS 配置"
  HTTPS_SITE_URL=""
fi
echo ""

########################################
# 8. 更新 Cognito 和 CORS 配置以支持 HTTPS（如果 CloudFront 已创建）
########################################
if [ -n "${HTTPS_SITE_URL}" ]; then
  echo "[8] 更新配置以支持 HTTPS..."
  
  # 更新 Cognito Callback URLs
  echo "  更新 Cognito Callback URLs..."
  aws cognito-idp update-user-pool-client \
    --user-pool-id "${COGNITO_USER_POOL_ID}" \
    --client-id "${COGNITO_CLIENT_ID}" \
    --callback-urls "http://localhost:5173/,http://localhost:5173/auth/callback,${HTTPS_SITE_URL}/,${HTTPS_SITE_URL}/auth/callback" \
    --logout-urls "http://localhost:5173/,http://localhost:5173/logout,${HTTPS_SITE_URL}/,${HTTPS_SITE_URL}/logout" \
    --region "${AWS_REGION}" >/dev/null
  
  # 更新 Lambda CORS 配置
  echo "  更新 Lambda CORS 配置..."
  aws lambda update-function-url-config \
    --function-name "${LAMBDA_FUNCTION_NAME}" \
    --cors "{\"AllowOrigins\":[\"${FRONTEND_ORIGIN}\",\"${HTTPS_SITE_URL}\",\"http://localhost:5173\"],\"AllowMethods\":[\"*\"],\"AllowHeaders\":[\"*\"],\"ExposeHeaders\":[\"*\"],\"MaxAge\":86400}" \
    --region "${AWS_REGION}" >/dev/null
  
  # 更新 S3 CORS 配置
  echo "  更新 S3 CORS 配置..."
  CORS_CONFIG=$(cat <<EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "${FRONTEND_ORIGIN}",
        "${HTTPS_SITE_URL}",
        "http://localhost:5173"
      ],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "x-amz-server-side-encryption", "x-amz-request-id", "x-amz-id-2"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF
)
echo "${CORS_CONFIG}" > /tmp/s3-cors-config.json
aws s3api put-bucket-cors \
  --bucket "${IMAGE_BUCKET}" \
  --cors-configuration file:///tmp/s3-cors-config.json \
  --region "${AWS_REGION}" >/dev/null 2>&1
rm -f /tmp/s3-cors-config.json
  
  echo "✅ HTTPS 配置完成"
  echo ""
  echo "注意: CloudFront 分发可能需要 5-15 分钟才能完全生效。"
else
  echo "[8] 跳过 HTTPS 配置（CloudFront 未创建或未就绪）"
fi
echo ""

########################################
# 9. 上传前端静态文件
########################################
echo "[9] 同步前端静态文件到 S3..."

aws s3 sync "${ROOT_DIR}/frontend/dist/" "s3://${FRONTEND_BUCKET}/" --delete

echo ""
echo "✅ 部署完成！"
echo "前端地址 (HTTP):  ${FRONTEND_ORIGIN}"
if [ -n "${HTTPS_SITE_URL}" ]; then
  echo "前端地址 (HTTPS): ${HTTPS_SITE_URL}"
fi
echo "API URL:          ${API_URL}"