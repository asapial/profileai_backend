/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from "express";
import status from "http-status";
import z from "zod";

import { envVars } from "../config/env";
import AppError from "../errorHelpers/AppError";
import { handleZodError } from "../errorHelpers/handleZodError";
import { TErrorResponse, TErrorSources } from "../interfaces/error.interface";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const globalErrorHandler = async (err: any, req: Request, res: Response, next: NextFunction) => {
    if (envVars.NODE_ENV === 'development') {
        console.error("Error from Global Error Handler:", err);
    }

    let errorSources: TErrorSources[] = [];
    let statusCode: number = status.INTERNAL_SERVER_ERROR;
    let message: string = 'Internal Server Error';
    let stack: string | undefined = undefined;
    let code: string | undefined = undefined;

    if (err instanceof z.ZodError) {
        const simplifiedError = handleZodError(err);
        statusCode = simplifiedError.statusCode as number;
        message = simplifiedError.message;
        errorSources = [...simplifiedError.errorSources];
        stack = err.stack;

    } else if (err instanceof AppError) {
        statusCode = err.statusCode;
        message = err.message;
        code = err.code;
        stack = err.stack;
        errorSources = [{ path: '', message: err.message }];

    } else if (err instanceof Error) {
        statusCode = status.INTERNAL_SERVER_ERROR;
        message = err.message;
        stack = err.stack;
        errorSources = [{ path: '', message: err.message }];
    }

    const errorResponse: TErrorResponse & { code?: string } = {
        success: false,
        message,
        errorSources,
        error: envVars.NODE_ENV === 'development' ? err : undefined,
        ...(code !== undefined ? { code } : {}),
        ...(envVars.NODE_ENV === 'development' && stack !== undefined ? { stack } : {}),
    };

    res.status(statusCode).json(errorResponse);
};