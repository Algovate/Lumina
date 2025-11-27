import serverlessExpress from '@vendia/serverless-express';
import app from './server';

// 导出 Lambda 处理函数
// @ts-ignore - serverless-express types may not match exactly
export const handler = serverlessExpress({ app });

