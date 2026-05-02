import dotenv from 'dotenv';
import status from 'http-status';
import AppError from '../errorHelpers/AppError';

dotenv.config();

interface EnvConfig {
    NODE_ENV: string;
    PORT: string;
    DATABASE_URL: string;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    ACCESS_TOKEN_SECRET: string;
    REFRESH_TOKEN_SECRET: string;
    ACCESS_TOKEN_EXPIRES_IN: string;
    REFRESH_TOKEN_EXPIRES_IN: string;
    BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN: string;
    BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE: string;
    EMAIL_SENDER:{
        SMTP_USER: string;
        SMTP_PASS: string;
        SMTP_HOST: string;
        SMTP_PORT: string;
        SMTP_FROM: string;
    }
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GOOGLE_CALLBACK_URL: string;
    FRONTEND_URL: string;
    CLOUDINARY:{
        CLOUDINARY_CLOUD_NAME: string;
        CLOUDINARY_API_KEY: string;
        CLOUDINARY_API_SECRET: string;
    },
    STRIPE:{
        STRIPE_SECRET_KEY: string;
        STRIPE_WEBHOOK_SECRET: string;
    },
    SUPER_ADMIN_EMAIL: string;
    SUPER_ADMIN_PASSWORD: string;
}


const loadEnvVariables = (): EnvConfig => {

    // Only these variables are strictly required to start the server
    const requiredEnvVariables = [
        'DATABASE_URL',
        'BETTER_AUTH_SECRET',
        'BETTER_AUTH_URL',
    ]

    // These are optional — the app will use fallback defaults if they are missing
    const optionalEnvVariables = [
        'NODE_ENV',
        'PORT',
        'ACCESS_TOKEN_SECRET',
        'REFRESH_TOKEN_SECRET',
        'ACCESS_TOKEN_EXPIRES_IN',
        'REFRESH_TOKEN_EXPIRES_IN',
        'BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN',
        'BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE',
        'EMAIL_SENDER_SMTP_USER',
        'EMAIL_SENDER_SMTP_PASS',
        'EMAIL_SENDER_SMTP_HOST',
        'EMAIL_SENDER_SMTP_PORT',
        'EMAIL_SENDER_SMTP_FROM',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_CALLBACK_URL',
        'FRONTEND_URL',
        'CLOUDINARY_CLOUD_NAME',
        'CLOUDINARY_API_KEY',
        'CLOUDINARY_API_SECRET',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'SUPER_ADMIN_EMAIL',
        'SUPER_ADMIN_PASSWORD',
    ]

    // Validate required variables
    const missingRequired: string[] = [];
    requiredEnvVariables.forEach((variable) => {
        if (!process.env[variable]) {
            missingRequired.push(variable);
        }
    })

    if (missingRequired.length > 0) {
        throw new AppError(
            status.INTERNAL_SERVER_ERROR,
            `Missing required environment variables: ${missingRequired.join(', ')}. Please set them in your .env file.`
        );
    }

    // Warn about missing optional variables (non-fatal)
    const missingOptional: string[] = [];
    optionalEnvVariables.forEach((variable) => {
        if (!process.env[variable]) {
            missingOptional.push(variable);
        }
    })

    if (missingOptional.length > 0) {
        console.warn(
            `⚠️  Missing optional environment variables (using defaults): ${missingOptional.join(', ')}`
        );
    }

    return {
        NODE_ENV: process.env.NODE_ENV ?? 'development',
        PORT: process.env.PORT ?? '5000',
        DATABASE_URL: process.env.DATABASE_URL as string,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET as string,
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL as string,
        ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET ?? 'default_access_token_secret_change_me',
        REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET ?? 'default_refresh_token_secret_change_me',
        ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN ?? '1d',
        REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN ?? '7d',
        BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN: process.env.BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN ?? '604800',
        BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE: process.env.BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE ?? '86400',
        EMAIL_SENDER: {
            SMTP_USER: process.env.EMAIL_SENDER_SMTP_USER ?? '',
            SMTP_PASS: process.env.EMAIL_SENDER_SMTP_PASS ?? '',
            SMTP_HOST: process.env.EMAIL_SENDER_SMTP_HOST ?? '',
            SMTP_PORT: process.env.EMAIL_SENDER_SMTP_PORT ?? '587',
            SMTP_FROM: process.env.EMAIL_SENDER_SMTP_FROM ?? '',
        },
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
        GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL ?? '',
        FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3000',
        CLOUDINARY: {
            CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? '',
            CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ?? '',
            CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ?? '',
        },
        STRIPE: {
            STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? '',
            STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? '',
        },
        SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL ?? '',
        SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD ?? '',
    }
}

export const envVars = loadEnvVariables();