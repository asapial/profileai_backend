class AppError extends Error {
    public statusCode: number;
    public code?: string;

    constructor(statusCode: number, message: string, code?: string) {
        super(message);
        this.statusCode = statusCode;
        if (code !== undefined) {
            this.code = code;
        }
        if (typeof (Error as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
            (Error as unknown as { captureStackTrace: (target: object, ctor: Function) => void }).captureStackTrace(this, this.constructor);
        }
    }
}

export default AppError;