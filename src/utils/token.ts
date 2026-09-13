import { JwtPayload, SignOptions } from "jsonwebtoken";
import { jwtUtils } from "./jwt";
import { envVars } from "../config/env";
import { cookieUtils } from "./cookie";
import { Response } from "express";

type DeviceRecoveryClaims = {
    userId: string;
    purpose: "device-recovery";
    jti: string;
    twoFactorVerified: boolean;
};

const isProd = envVars.NODE_ENV === "production";
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const createAccessToken = (payload: JwtPayload) => {

    const accessToken = jwtUtils.createToken(
        payload,
        envVars.ACCESS_TOKEN_SECRET,
        {
            expiresIn: envVars.ACCESS_TOKEN_EXPIRES_IN
        } as SignOptions
    )
    return accessToken;
}



const createRefreshToken = (payload: JwtPayload) => {

    const refreshToken = jwtUtils.createToken(
        payload,
        envVars.REFRESH_TOKEN_SECRET,
        {
            expiresIn: envVars.REFRESH_TOKEN_EXPIRES_IN
        } as SignOptions
    )
    return refreshToken;
}

const createDeviceRecoveryToken = (payload: Omit<DeviceRecoveryClaims, "purpose">) => {
    return jwtUtils.createToken(
        { ...payload, purpose: "device-recovery" },
        envVars.REFRESH_TOKEN_SECRET,
        { expiresIn: "5m" } as SignOptions
    );
};

const verifyDeviceRecoveryToken = (token: string): DeviceRecoveryClaims | null => {
    const verified = jwtUtils.vefifyToken(token, envVars.REFRESH_TOKEN_SECRET);
    if (!verified.success || !verified.data || typeof verified.data !== "object") return null;

    const claims = verified.data as JwtPayload;
    if (
        claims.purpose !== "device-recovery" ||
        typeof claims.userId !== "string" ||
        typeof claims.jti !== "string" ||
        typeof claims.twoFactorVerified !== "boolean"
    ) {
        return null;
    }

    return {
        userId: claims.userId,
        purpose: "device-recovery",
        jti: claims.jti,
        twoFactorVerified: claims.twoFactorVerified,
    };
};

const setAccessTokenCookie = (res: Response, token: string) => {
    cookieUtils.setCookie(res, 'accessToken', token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        path: '/',
        maxAge: SESSION_MAX_AGE_MS,
    });
}

const setRefreshTokenCookie = (res: Response, token: string) => {
    cookieUtils.setCookie(res, 'refreshToken', token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        path: '/',
        maxAge: SESSION_MAX_AGE_MS,
    });
}

const setBetterAuthSessionCookie = (res: Response, token: string) => {
    cookieUtils.setCookie(res, cookieUtils.betterAuthSessionCookieName, token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        path: '/',
        maxAge: SESSION_MAX_AGE_MS,
    });
}

export const tokenUtils={
    createAccessToken,
    createRefreshToken,
    createDeviceRecoveryToken,
    verifyDeviceRecoveryToken,
    setAccessTokenCookie,
    setRefreshTokenCookie,
    setBetterAuthSessionCookie
}
