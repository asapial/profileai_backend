var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/dotenv/lib/main.js
var require_main = __commonJS({
  "node_modules/dotenv/lib/main.js"(exports, module) {
    "use strict";
    var fs = __require("fs");
    var path2 = __require("path");
    var os = __require("os");
    var crypto2 = __require("crypto");
    var TIPS = [
      "\u25C8 encrypted .env [www.dotenvx.com]",
      "\u25C8 secrets for agents [www.dotenvx.com]",
      "\u2301 auth for agents [www.vestauth.com]",
      "\u2318 custom filepath { path: '/custom/path/.env' }",
      "\u2318 enable debugging { debug: true }",
      "\u2318 override existing { override: true }",
      "\u2318 suppress logs { quiet: true }",
      "\u2318 multiple files { path: ['.env.local', '.env'] }"
    ];
    function _getRandomTip() {
      return TIPS[Math.floor(Math.random() * TIPS.length)];
    }
    function parseBoolean(value) {
      if (typeof value === "string") {
        return !["false", "0", "no", "off", ""].includes(value.toLowerCase());
      }
      return Boolean(value);
    }
    function supportsAnsi() {
      return process.stdout.isTTY;
    }
    function dim(text) {
      return supportsAnsi() ? `\x1B[2m${text}\x1B[0m` : text;
    }
    var LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
    function parse(src) {
      const obj = {};
      let lines = src.toString();
      lines = lines.replace(/\r\n?/mg, "\n");
      let match;
      while ((match = LINE.exec(lines)) != null) {
        const key = match[1];
        let value = match[2] || "";
        value = value.trim();
        const maybeQuote = value[0];
        value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
        if (maybeQuote === '"') {
          value = value.replace(/\\n/g, "\n");
          value = value.replace(/\\r/g, "\r");
        }
        obj[key] = value;
      }
      return obj;
    }
    function _parseVault(options) {
      options = options || {};
      const vaultPath = _vaultPath(options);
      options.path = vaultPath;
      const result = DotenvModule.configDotenv(options);
      if (!result.parsed) {
        const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
        err.code = "MISSING_DATA";
        throw err;
      }
      const keys = _dotenvKey(options).split(",");
      const length = keys.length;
      let decrypted;
      for (let i = 0; i < length; i++) {
        try {
          const key = keys[i].trim();
          const attrs = _instructions(result, key);
          decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
          break;
        } catch (error) {
          if (i + 1 >= length) {
            throw error;
          }
        }
      }
      return DotenvModule.parse(decrypted);
    }
    function _warn(message) {
      console.error(`\u26A0 ${message}`);
    }
    function _debug(message) {
      console.log(`\u2506 ${message}`);
    }
    function _log(message) {
      console.log(`\u25C7 ${message}`);
    }
    function _dotenvKey(options) {
      if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
        return options.DOTENV_KEY;
      }
      if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
        return process.env.DOTENV_KEY;
      }
      return "";
    }
    function _instructions(result, dotenvKey) {
      let uri;
      try {
        uri = new URL(dotenvKey);
      } catch (error) {
        if (error.code === "ERR_INVALID_URL") {
          const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        }
        throw error;
      }
      const key = uri.password;
      if (!key) {
        const err = new Error("INVALID_DOTENV_KEY: Missing key part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environment = uri.searchParams.get("environment");
      if (!environment) {
        const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
      const ciphertext = result.parsed[environmentKey];
      if (!ciphertext) {
        const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
        err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
        throw err;
      }
      return { ciphertext, key };
    }
    function _vaultPath(options) {
      let possibleVaultPath = null;
      if (options && options.path && options.path.length > 0) {
        if (Array.isArray(options.path)) {
          for (const filepath of options.path) {
            if (fs.existsSync(filepath)) {
              possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
            }
          }
        } else {
          possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
        }
      } else {
        possibleVaultPath = path2.resolve(process.cwd(), ".env.vault");
      }
      if (fs.existsSync(possibleVaultPath)) {
        return possibleVaultPath;
      }
      return null;
    }
    function _resolveHome(envPath) {
      return envPath[0] === "~" ? path2.join(os.homedir(), envPath.slice(1)) : envPath;
    }
    function _configVault(options) {
      const debug = parseBoolean(process.env.DOTENV_CONFIG_DEBUG || options && options.debug);
      const quiet = parseBoolean(process.env.DOTENV_CONFIG_QUIET || options && options.quiet);
      if (debug || !quiet) {
        _log("loading env from encrypted .env.vault");
      }
      const parsed = DotenvModule._parseVault(options);
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsed, options);
      return { parsed };
    }
    function configDotenv(options) {
      const dotenvPath = path2.resolve(process.cwd(), ".env");
      let encoding = "utf8";
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      let debug = parseBoolean(processEnv.DOTENV_CONFIG_DEBUG || options && options.debug);
      let quiet = parseBoolean(processEnv.DOTENV_CONFIG_QUIET || options && options.quiet);
      if (options && options.encoding) {
        encoding = options.encoding;
      } else {
        if (debug) {
          _debug("no encoding is specified (UTF-8 is used by default)");
        }
      }
      let optionPaths = [dotenvPath];
      if (options && options.path) {
        if (!Array.isArray(options.path)) {
          optionPaths = [_resolveHome(options.path)];
        } else {
          optionPaths = [];
          for (const filepath of options.path) {
            optionPaths.push(_resolveHome(filepath));
          }
        }
      }
      let lastError;
      const parsedAll = {};
      for (const path3 of optionPaths) {
        try {
          const parsed = DotenvModule.parse(fs.readFileSync(path3, { encoding }));
          DotenvModule.populate(parsedAll, parsed, options);
        } catch (e) {
          if (debug) {
            _debug(`failed to load ${path3} ${e.message}`);
          }
          lastError = e;
        }
      }
      const populated = DotenvModule.populate(processEnv, parsedAll, options);
      debug = parseBoolean(processEnv.DOTENV_CONFIG_DEBUG || debug);
      quiet = parseBoolean(processEnv.DOTENV_CONFIG_QUIET || quiet);
      if (debug || !quiet) {
        const keysCount = Object.keys(populated).length;
        const shortPaths = [];
        for (const filePath of optionPaths) {
          try {
            const relative = path2.relative(process.cwd(), filePath);
            shortPaths.push(relative);
          } catch (e) {
            if (debug) {
              _debug(`failed to load ${filePath} ${e.message}`);
            }
            lastError = e;
          }
        }
        _log(`injected env (${keysCount}) from ${shortPaths.join(",")} ${dim(`// tip: ${_getRandomTip()}`)}`);
      }
      if (lastError) {
        return { parsed: parsedAll, error: lastError };
      } else {
        return { parsed: parsedAll };
      }
    }
    function config2(options) {
      if (_dotenvKey(options).length === 0) {
        return DotenvModule.configDotenv(options);
      }
      const vaultPath = _vaultPath(options);
      if (!vaultPath) {
        _warn(`you set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}`);
        return DotenvModule.configDotenv(options);
      }
      return DotenvModule._configVault(options);
    }
    function decrypt(encrypted, keyStr) {
      const key = Buffer.from(keyStr.slice(-64), "hex");
      let ciphertext = Buffer.from(encrypted, "base64");
      const nonce = ciphertext.subarray(0, 12);
      const authTag = ciphertext.subarray(-16);
      ciphertext = ciphertext.subarray(12, -16);
      try {
        const aesgcm = crypto2.createDecipheriv("aes-256-gcm", key, nonce);
        aesgcm.setAuthTag(authTag);
        return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
      } catch (error) {
        const isRange = error instanceof RangeError;
        const invalidKeyLength = error.message === "Invalid key length";
        const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
        if (isRange || invalidKeyLength) {
          const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        } else if (decryptionFailed) {
          const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
          err.code = "DECRYPTION_FAILED";
          throw err;
        } else {
          throw error;
        }
      }
    }
    function populate(processEnv, parsed, options = {}) {
      const debug = Boolean(options && options.debug);
      const override = Boolean(options && options.override);
      const populated = {};
      if (typeof parsed !== "object") {
        const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
        err.code = "OBJECT_REQUIRED";
        throw err;
      }
      for (const key of Object.keys(parsed)) {
        if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
          if (override === true) {
            processEnv[key] = parsed[key];
            populated[key] = parsed[key];
          }
          if (debug) {
            if (override === true) {
              _debug(`"${key}" is already defined and WAS overwritten`);
            } else {
              _debug(`"${key}" is already defined and was NOT overwritten`);
            }
          }
        } else {
          processEnv[key] = parsed[key];
          populated[key] = parsed[key];
        }
      }
      return populated;
    }
    var DotenvModule = {
      configDotenv,
      _configVault,
      _parseVault,
      config: config2,
      decrypt,
      parse,
      populate
    };
    module.exports.configDotenv = DotenvModule.configDotenv;
    module.exports._configVault = DotenvModule._configVault;
    module.exports._parseVault = DotenvModule._parseVault;
    module.exports.config = DotenvModule.config;
    module.exports.decrypt = DotenvModule.decrypt;
    module.exports.parse = DotenvModule.parse;
    module.exports.populate = DotenvModule.populate;
    module.exports = DotenvModule;
  }
});

// node_modules/dotenv/lib/env-options.js
var require_env_options = __commonJS({
  "node_modules/dotenv/lib/env-options.js"(exports, module) {
    "use strict";
    var options = {};
    if (process.env.DOTENV_CONFIG_ENCODING != null) {
      options.encoding = process.env.DOTENV_CONFIG_ENCODING;
    }
    if (process.env.DOTENV_CONFIG_PATH != null) {
      options.path = process.env.DOTENV_CONFIG_PATH;
    }
    if (process.env.DOTENV_CONFIG_QUIET != null) {
      options.quiet = process.env.DOTENV_CONFIG_QUIET;
    }
    if (process.env.DOTENV_CONFIG_DEBUG != null) {
      options.debug = process.env.DOTENV_CONFIG_DEBUG;
    }
    if (process.env.DOTENV_CONFIG_OVERRIDE != null) {
      options.override = process.env.DOTENV_CONFIG_OVERRIDE;
    }
    if (process.env.DOTENV_CONFIG_DOTENV_KEY != null) {
      options.DOTENV_KEY = process.env.DOTENV_CONFIG_DOTENV_KEY;
    }
    module.exports = options;
  }
});

// node_modules/dotenv/lib/cli-options.js
var require_cli_options = __commonJS({
  "node_modules/dotenv/lib/cli-options.js"(exports, module) {
    "use strict";
    var re = /^dotenv_config_(encoding|path|quiet|debug|override|DOTENV_KEY)=(.+)$/;
    module.exports = function optionMatcher(args) {
      const options = args.reduce(function(acc, cur) {
        const matches = cur.match(re);
        if (matches) {
          acc[matches[1]] = matches[2];
        }
        return acc;
      }, {});
      if (!("quiet" in options)) {
        options.quiet = "true";
      }
      return options;
    };
  }
});

// src/app.ts
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";

// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

// node_modules/dotenv/config.js
(function() {
  require_main().config(
    Object.assign(
      {},
      require_env_options(),
      require_cli_options()(process.argv)
    )
  );
})();

// src/lib/prisma.ts
import { PrismaPg } from "@prisma/adapter-pg";

// prisma/generated/prisma/client.ts
import * as path from "path";
import { fileURLToPath } from "url";

// prisma/generated/prisma/internal/class.ts
import * as runtime from "@prisma/client/runtime/client";
var config = {
  "previewFeatures": [
    "prismaSchemaFolder"
  ],
  "clientVersion": "7.8.0",
  "engineVersion": "3c6e192761c0362d496ed980de936e2f3cebcd3a",
  "activeProvider": "postgresql",
  "inlineSchema": `// BetterAuth core models \u2014 extended with ProFile AI custom fields

model User {
  id            String   @id
  name          String
  email         String
  emailVerified Boolean  @default(false)
  image         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // ProFile AI extensions
  role             Role    @default(USER)
  isActive         Boolean @default(true)
  twoFactorEnabled Boolean @default(false)
  twoFactorSecret  String? // AES-256-GCM encrypted TOTP secret

  // Relations
  sessions     Session[]
  accounts     Account[]
  profile      UserProfile?
  adminProfile AdminProfile?
  devices      LoginDevice[]
  resumes      Resume[]
  otps         OtpCode[]
  limits       UserLimit?

  @@unique([email])
  @@map("user")
}

model Session {
  id        String   @id
  expiresAt DateTime
  token     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  ipAddress String?
  userAgent String?
  userId    String
  deviceId  String?

  user   User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  device LoginDevice? @relation(fields: [deviceId], references: [id])

  @@unique([token])
  @@index([userId])
  @@map("session")
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([userId])
  @@map("account")
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
  @@map("verification")
}

enum Role {
  ADMIN
  USER
}

enum OtpType {
  EMAIL_VERIFY
  FORGET_PASSWORD
  RESET_PASSWORD
  TWO_FACTOR
}

enum ResumeType {
  RESUME
  CV
}

enum ResumeStatus {
  DRAFT
  GENERATED
  EXPORTED
}

enum TemplateCategory {
  MODERN
  CLASSIC
  CREATIVE
  ATS
}

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Platform Config, User Limits, OTP & Device Models
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

model PlatformConfig {
  id          String   @id @default(cuid())
  key         String   @unique
  value       String
  description String?
  updatedBy   String // Admin userId
  updatedAt   DateTime @updatedAt

  // Keys:
  //   default_resume_limit | default_api_limit
  //   max_devices_per_user | otp_expiry_minutes
  //   session_ttl_days     | maintenance_mode

  @@map("platform_config")
}

model UserLimit {
  id              String   @id @default(cuid())
  userId          String   @unique
  resumeLimit     Int      @default(5) // Max resumes/CVs per cycle
  apiLimit        Int      @default(50) // Max AI API calls per month
  resumeUsed      Int      @default(0)
  apiUsed         Int      @default(0)
  resetAt         DateTime // Next monthly reset timestamp
  overrideByAdmin Boolean  @default(false)

  user User @relation(fields: [userId], references: [id])

  @@map("user_limit")
}

model OtpCode {
  id        String   @id @default(cuid())
  userId    String
  codeHash  String // bcrypt hash of 6-digit OTP
  type      OtpType
  expiresAt DateTime // TTL: 10 minutes from creation
  used      Boolean  @default(false)
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("otp_code")
}

model LoginDevice {
  id          String   @id @default(cuid())
  userId      String
  deviceName  String // e.g. 'Chrome on Windows 11'
  deviceType  String // desktop | mobile | tablet
  browser     String?
  os          String?
  ipAddress   String?
  userAgent   String
  fingerprint String // SHA-256 hash(browser+os+ua)
  isTrusted   Boolean  @default(false)
  lastSeenAt  DateTime @default(now())
  createdAt   DateTime @default(now())

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  sessions Session[]

  // Rule: Max 3 devices per user, enforced at service layer
  @@map("login_device")
}

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Profile Models
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

model UserProfile {
  id             String   @id @default(cuid())
  userId         String   @unique
  firstName      String
  lastName       String
  phone          String?
  avatarUrl      String? // MinIO URL
  headline       String? // e.g. 'Senior Software Engineer'
  bio            String?
  location       String?
  website        String?
  linkedIn       String?
  github         String?
  skills         String[] // Array of skill tags
  languages      String[]
  education      Json // [{school, degree, field, from, to, gpa}]
  experience     Json // [{company, role, from, to, current, desc}]
  certifications Json? // [{name, issuer, year, url}]
  resumeCount    Int      @default(0)
  apiCallCount   Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_profile")
}

model AdminProfile {
  id          String   @id @default(cuid())
  userId      String   @unique
  firstName   String
  lastName    String
  phone       String?
  avatarUrl   String? // MinIO URL
  department  String?
  permissions String[] // Fine-grained permission flags
  notes       String? // Internal admin notes
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("admin_profile")
}

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Resume & Template Models
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

model ResumeTemplate {
  id           String           @id @default(cuid())
  name         String
  description  String?
  thumbnailUrl String // Preview image (MinIO)
  htmlLayout   String // Handlebars HTML string
  cssStyles    String // Scoped CSS for this template
  category     TemplateCategory
  isActive     Boolean          @default(true)
  isDefault    Boolean          @default(false)
  createdBy    String // Admin userId
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  resumes Resume[]

  @@map("resume_template")
}

model Resume {
  id             String       @id @default(cuid())
  userId         String
  templateId     String
  title          String
  type           ResumeType   @default(RESUME)
  status         ResumeStatus @default(DRAFT)
  targetJobTitle String? // For ATS optimization
  jobDescription String? // Pasted JD for ATS scoring
  atsScore       Int? // 0-100 ATS compatibility score
  contentData    Json // Structured resume content
  aiSuggestions  Json? // AI improvement suggestions
  pdfUrl         String? // MinIO URL of exported PDF
  version        Int          @default(1)
  isPublic       Boolean      @default(false)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  user     User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  template ResumeTemplate  @relation(fields: [templateId], references: [id])
  history  ResumeHistory[]

  @@map("resume")
}

model ResumeHistory {
  id        String   @id @default(cuid())
  resumeId  String
  version   Int
  snapshot  Json // Full contentData snapshot at this version
  changedBy String // userId of editor
  createdAt DateTime @default(now())

  resume Resume @relation(fields: [resumeId], references: [id], onDelete: Cascade)

  @@map("resume_history")
}

// ProFile AI \u2014 Prisma Schema Entry Point
// All models are split into separate files in this directory.
// Learn more: https://pris.ly/d/prisma-schema

generator client {
  provider        = "prisma-client"
  output          = "../generated/prisma"
  previewFeatures = ["prismaSchemaFolder"]
}

datasource db {
  provider = "postgresql"
}
`,
  "runtimeDataModel": {
    "models": {},
    "enums": {},
    "types": {}
  },
  "parameterizationSchema": {
    "strings": [],
    "graph": ""
  }
};
config.runtimeDataModel = JSON.parse('{"models":{"User":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"email","kind":"scalar","type":"String"},{"name":"emailVerified","kind":"scalar","type":"Boolean"},{"name":"image","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"role","kind":"enum","type":"Role"},{"name":"isActive","kind":"scalar","type":"Boolean"},{"name":"twoFactorEnabled","kind":"scalar","type":"Boolean"},{"name":"twoFactorSecret","kind":"scalar","type":"String"},{"name":"sessions","kind":"object","type":"Session","relationName":"SessionToUser"},{"name":"accounts","kind":"object","type":"Account","relationName":"AccountToUser"},{"name":"profile","kind":"object","type":"UserProfile","relationName":"UserToUserProfile"},{"name":"adminProfile","kind":"object","type":"AdminProfile","relationName":"AdminProfileToUser"},{"name":"devices","kind":"object","type":"LoginDevice","relationName":"LoginDeviceToUser"},{"name":"resumes","kind":"object","type":"Resume","relationName":"ResumeToUser"},{"name":"otps","kind":"object","type":"OtpCode","relationName":"OtpCodeToUser"},{"name":"limits","kind":"object","type":"UserLimit","relationName":"UserToUserLimit"}],"dbName":"user"},"Session":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"token","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"ipAddress","kind":"scalar","type":"String"},{"name":"userAgent","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"deviceId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"SessionToUser"},{"name":"device","kind":"object","type":"LoginDevice","relationName":"LoginDeviceToSession"}],"dbName":"session"},"Account":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"accountId","kind":"scalar","type":"String"},{"name":"providerId","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"AccountToUser"},{"name":"accessToken","kind":"scalar","type":"String"},{"name":"refreshToken","kind":"scalar","type":"String"},{"name":"idToken","kind":"scalar","type":"String"},{"name":"accessTokenExpiresAt","kind":"scalar","type":"DateTime"},{"name":"refreshTokenExpiresAt","kind":"scalar","type":"DateTime"},{"name":"scope","kind":"scalar","type":"String"},{"name":"password","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":"account"},"Verification":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"identifier","kind":"scalar","type":"String"},{"name":"value","kind":"scalar","type":"String"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":"verification"},"PlatformConfig":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"key","kind":"scalar","type":"String"},{"name":"value","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"updatedBy","kind":"scalar","type":"String"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":"platform_config"},"UserLimit":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"resumeLimit","kind":"scalar","type":"Int"},{"name":"apiLimit","kind":"scalar","type":"Int"},{"name":"resumeUsed","kind":"scalar","type":"Int"},{"name":"apiUsed","kind":"scalar","type":"Int"},{"name":"resetAt","kind":"scalar","type":"DateTime"},{"name":"overrideByAdmin","kind":"scalar","type":"Boolean"},{"name":"user","kind":"object","type":"User","relationName":"UserToUserLimit"}],"dbName":"user_limit"},"OtpCode":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"codeHash","kind":"scalar","type":"String"},{"name":"type","kind":"enum","type":"OtpType"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"used","kind":"scalar","type":"Boolean"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"user","kind":"object","type":"User","relationName":"OtpCodeToUser"}],"dbName":"otp_code"},"LoginDevice":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"deviceName","kind":"scalar","type":"String"},{"name":"deviceType","kind":"scalar","type":"String"},{"name":"browser","kind":"scalar","type":"String"},{"name":"os","kind":"scalar","type":"String"},{"name":"ipAddress","kind":"scalar","type":"String"},{"name":"userAgent","kind":"scalar","type":"String"},{"name":"fingerprint","kind":"scalar","type":"String"},{"name":"isTrusted","kind":"scalar","type":"Boolean"},{"name":"lastSeenAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"user","kind":"object","type":"User","relationName":"LoginDeviceToUser"},{"name":"sessions","kind":"object","type":"Session","relationName":"LoginDeviceToSession"}],"dbName":"login_device"},"UserProfile":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"firstName","kind":"scalar","type":"String"},{"name":"lastName","kind":"scalar","type":"String"},{"name":"phone","kind":"scalar","type":"String"},{"name":"avatarUrl","kind":"scalar","type":"String"},{"name":"headline","kind":"scalar","type":"String"},{"name":"bio","kind":"scalar","type":"String"},{"name":"location","kind":"scalar","type":"String"},{"name":"website","kind":"scalar","type":"String"},{"name":"linkedIn","kind":"scalar","type":"String"},{"name":"github","kind":"scalar","type":"String"},{"name":"skills","kind":"scalar","type":"String"},{"name":"languages","kind":"scalar","type":"String"},{"name":"education","kind":"scalar","type":"Json"},{"name":"experience","kind":"scalar","type":"Json"},{"name":"certifications","kind":"scalar","type":"Json"},{"name":"resumeCount","kind":"scalar","type":"Int"},{"name":"apiCallCount","kind":"scalar","type":"Int"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"user","kind":"object","type":"User","relationName":"UserToUserProfile"}],"dbName":"user_profile"},"AdminProfile":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"firstName","kind":"scalar","type":"String"},{"name":"lastName","kind":"scalar","type":"String"},{"name":"phone","kind":"scalar","type":"String"},{"name":"avatarUrl","kind":"scalar","type":"String"},{"name":"department","kind":"scalar","type":"String"},{"name":"permissions","kind":"scalar","type":"String"},{"name":"notes","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"user","kind":"object","type":"User","relationName":"AdminProfileToUser"}],"dbName":"admin_profile"},"ResumeTemplate":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"thumbnailUrl","kind":"scalar","type":"String"},{"name":"htmlLayout","kind":"scalar","type":"String"},{"name":"cssStyles","kind":"scalar","type":"String"},{"name":"category","kind":"enum","type":"TemplateCategory"},{"name":"isActive","kind":"scalar","type":"Boolean"},{"name":"isDefault","kind":"scalar","type":"Boolean"},{"name":"createdBy","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"resumes","kind":"object","type":"Resume","relationName":"ResumeToResumeTemplate"}],"dbName":"resume_template"},"Resume":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"templateId","kind":"scalar","type":"String"},{"name":"title","kind":"scalar","type":"String"},{"name":"type","kind":"enum","type":"ResumeType"},{"name":"status","kind":"enum","type":"ResumeStatus"},{"name":"targetJobTitle","kind":"scalar","type":"String"},{"name":"jobDescription","kind":"scalar","type":"String"},{"name":"atsScore","kind":"scalar","type":"Int"},{"name":"contentData","kind":"scalar","type":"Json"},{"name":"aiSuggestions","kind":"scalar","type":"Json"},{"name":"pdfUrl","kind":"scalar","type":"String"},{"name":"version","kind":"scalar","type":"Int"},{"name":"isPublic","kind":"scalar","type":"Boolean"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"user","kind":"object","type":"User","relationName":"ResumeToUser"},{"name":"template","kind":"object","type":"ResumeTemplate","relationName":"ResumeToResumeTemplate"},{"name":"history","kind":"object","type":"ResumeHistory","relationName":"ResumeToResumeHistory"}],"dbName":"resume"},"ResumeHistory":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"resumeId","kind":"scalar","type":"String"},{"name":"version","kind":"scalar","type":"Int"},{"name":"snapshot","kind":"scalar","type":"Json"},{"name":"changedBy","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"resume","kind":"object","type":"Resume","relationName":"ResumeToResumeHistory"}],"dbName":"resume_history"}},"enums":{},"types":{}}');
config.parameterizationSchema = {
  strings: JSON.parse('["where","orderBy","cursor","user","sessions","_count","device","accounts","profile","adminProfile","devices","resumes","template","resume","history","otps","limits","User.findUnique","User.findUniqueOrThrow","User.findFirst","User.findFirstOrThrow","User.findMany","data","User.createOne","User.createMany","User.createManyAndReturn","User.updateOne","User.updateMany","User.updateManyAndReturn","create","update","User.upsertOne","User.deleteOne","User.deleteMany","having","_min","_max","User.groupBy","User.aggregate","Session.findUnique","Session.findUniqueOrThrow","Session.findFirst","Session.findFirstOrThrow","Session.findMany","Session.createOne","Session.createMany","Session.createManyAndReturn","Session.updateOne","Session.updateMany","Session.updateManyAndReturn","Session.upsertOne","Session.deleteOne","Session.deleteMany","Session.groupBy","Session.aggregate","Account.findUnique","Account.findUniqueOrThrow","Account.findFirst","Account.findFirstOrThrow","Account.findMany","Account.createOne","Account.createMany","Account.createManyAndReturn","Account.updateOne","Account.updateMany","Account.updateManyAndReturn","Account.upsertOne","Account.deleteOne","Account.deleteMany","Account.groupBy","Account.aggregate","Verification.findUnique","Verification.findUniqueOrThrow","Verification.findFirst","Verification.findFirstOrThrow","Verification.findMany","Verification.createOne","Verification.createMany","Verification.createManyAndReturn","Verification.updateOne","Verification.updateMany","Verification.updateManyAndReturn","Verification.upsertOne","Verification.deleteOne","Verification.deleteMany","Verification.groupBy","Verification.aggregate","PlatformConfig.findUnique","PlatformConfig.findUniqueOrThrow","PlatformConfig.findFirst","PlatformConfig.findFirstOrThrow","PlatformConfig.findMany","PlatformConfig.createOne","PlatformConfig.createMany","PlatformConfig.createManyAndReturn","PlatformConfig.updateOne","PlatformConfig.updateMany","PlatformConfig.updateManyAndReturn","PlatformConfig.upsertOne","PlatformConfig.deleteOne","PlatformConfig.deleteMany","PlatformConfig.groupBy","PlatformConfig.aggregate","UserLimit.findUnique","UserLimit.findUniqueOrThrow","UserLimit.findFirst","UserLimit.findFirstOrThrow","UserLimit.findMany","UserLimit.createOne","UserLimit.createMany","UserLimit.createManyAndReturn","UserLimit.updateOne","UserLimit.updateMany","UserLimit.updateManyAndReturn","UserLimit.upsertOne","UserLimit.deleteOne","UserLimit.deleteMany","_avg","_sum","UserLimit.groupBy","UserLimit.aggregate","OtpCode.findUnique","OtpCode.findUniqueOrThrow","OtpCode.findFirst","OtpCode.findFirstOrThrow","OtpCode.findMany","OtpCode.createOne","OtpCode.createMany","OtpCode.createManyAndReturn","OtpCode.updateOne","OtpCode.updateMany","OtpCode.updateManyAndReturn","OtpCode.upsertOne","OtpCode.deleteOne","OtpCode.deleteMany","OtpCode.groupBy","OtpCode.aggregate","LoginDevice.findUnique","LoginDevice.findUniqueOrThrow","LoginDevice.findFirst","LoginDevice.findFirstOrThrow","LoginDevice.findMany","LoginDevice.createOne","LoginDevice.createMany","LoginDevice.createManyAndReturn","LoginDevice.updateOne","LoginDevice.updateMany","LoginDevice.updateManyAndReturn","LoginDevice.upsertOne","LoginDevice.deleteOne","LoginDevice.deleteMany","LoginDevice.groupBy","LoginDevice.aggregate","UserProfile.findUnique","UserProfile.findUniqueOrThrow","UserProfile.findFirst","UserProfile.findFirstOrThrow","UserProfile.findMany","UserProfile.createOne","UserProfile.createMany","UserProfile.createManyAndReturn","UserProfile.updateOne","UserProfile.updateMany","UserProfile.updateManyAndReturn","UserProfile.upsertOne","UserProfile.deleteOne","UserProfile.deleteMany","UserProfile.groupBy","UserProfile.aggregate","AdminProfile.findUnique","AdminProfile.findUniqueOrThrow","AdminProfile.findFirst","AdminProfile.findFirstOrThrow","AdminProfile.findMany","AdminProfile.createOne","AdminProfile.createMany","AdminProfile.createManyAndReturn","AdminProfile.updateOne","AdminProfile.updateMany","AdminProfile.updateManyAndReturn","AdminProfile.upsertOne","AdminProfile.deleteOne","AdminProfile.deleteMany","AdminProfile.groupBy","AdminProfile.aggregate","ResumeTemplate.findUnique","ResumeTemplate.findUniqueOrThrow","ResumeTemplate.findFirst","ResumeTemplate.findFirstOrThrow","ResumeTemplate.findMany","ResumeTemplate.createOne","ResumeTemplate.createMany","ResumeTemplate.createManyAndReturn","ResumeTemplate.updateOne","ResumeTemplate.updateMany","ResumeTemplate.updateManyAndReturn","ResumeTemplate.upsertOne","ResumeTemplate.deleteOne","ResumeTemplate.deleteMany","ResumeTemplate.groupBy","ResumeTemplate.aggregate","Resume.findUnique","Resume.findUniqueOrThrow","Resume.findFirst","Resume.findFirstOrThrow","Resume.findMany","Resume.createOne","Resume.createMany","Resume.createManyAndReturn","Resume.updateOne","Resume.updateMany","Resume.updateManyAndReturn","Resume.upsertOne","Resume.deleteOne","Resume.deleteMany","Resume.groupBy","Resume.aggregate","ResumeHistory.findUnique","ResumeHistory.findUniqueOrThrow","ResumeHistory.findFirst","ResumeHistory.findFirstOrThrow","ResumeHistory.findMany","ResumeHistory.createOne","ResumeHistory.createMany","ResumeHistory.createManyAndReturn","ResumeHistory.updateOne","ResumeHistory.updateMany","ResumeHistory.updateManyAndReturn","ResumeHistory.upsertOne","ResumeHistory.deleteOne","ResumeHistory.deleteMany","ResumeHistory.groupBy","ResumeHistory.aggregate","AND","OR","NOT","id","resumeId","version","snapshot","changedBy","createdAt","equals","in","notIn","lt","lte","gt","gte","not","string_contains","string_starts_with","string_ends_with","array_starts_with","array_ends_with","array_contains","contains","startsWith","endsWith","userId","templateId","title","ResumeType","type","ResumeStatus","status","targetJobTitle","jobDescription","atsScore","contentData","aiSuggestions","pdfUrl","isPublic","updatedAt","name","description","thumbnailUrl","htmlLayout","cssStyles","TemplateCategory","category","isActive","isDefault","createdBy","every","some","none","firstName","lastName","phone","avatarUrl","department","permissions","notes","has","hasEvery","hasSome","headline","bio","location","website","linkedIn","github","skills","languages","education","experience","certifications","resumeCount","apiCallCount","deviceName","deviceType","browser","os","ipAddress","userAgent","fingerprint","isTrusted","lastSeenAt","codeHash","OtpType","expiresAt","used","resumeLimit","apiLimit","resumeUsed","apiUsed","resetAt","overrideByAdmin","key","value","updatedBy","identifier","accountId","providerId","accessToken","refreshToken","idToken","accessTokenExpiresAt","refreshTokenExpiresAt","scope","password","token","deviceId","email","emailVerified","image","Role","role","twoFactorEnabled","twoFactorSecret","is","isNot","connectOrCreate","upsert","createMany","set","disconnect","delete","connect","updateMany","deleteMany","push","increment","decrement","multiply","divide"]'),
  graph: "3gV10AEWBAAApgMAIAcAAKcDACAIAACoAwAgCQAAqQMAIAoAAKoDACALAACGAwAgDwAAqwMAIBAAAKwDACDpAQAApAMAMOoBAAAtABDrAQAApAMAMOwBAQAAAAHxAUAAhQMAIZECQACFAwAhkgIBAIEDACGZAiAAhAMAIdgCAQAAAAHZAiAAhAMAIdoCAQCCAwAh3AIAAKUD3AIi3QIgAIQDACHeAgEAggMAIQEAAAABACAOAwAAigMAIAYAALsDACDpAQAAugMAMOoBAAADABDrAQAAugMAMOwBAQCBAwAh8QFAAIUDACGDAgEAgQMAIZECQACFAwAhugIBAIIDACG7AgEAggMAIcECQACFAwAh1gIBAIEDACHXAgEAggMAIQUDAAD9AwAgBgAAnwUAILoCAADGAwAguwIAAMYDACDXAgAAxgMAIA4DAACKAwAgBgAAuwMAIOkBAAC6AwAw6gEAAAMAEOsBAAC6AwAw7AEBAAAAAfEBQACFAwAhgwIBAIEDACGRAkAAhQMAIboCAQCCAwAhuwIBAIIDACHBAkAAhQMAIdYCAQAAAAHXAgEAggMAIQMAAAADACABAAAEADACAAAFACARAwAAigMAIAQAAKYDACDpAQAAtwMAMOoBAAAHABDrAQAAtwMAMOwBAQCBAwAh8QFAAIUDACGDAgEAgQMAIbYCAQCBAwAhtwIBAIEDACG4AgEAggMAIbkCAQCCAwAhugIBAIIDACG7AgEAgQMAIbwCAQCBAwAhvQIgAIQDACG-AkAAhQMAIQEAAAAHACADAAAAAwAgAQAABAAwAgAABQAgAQAAAAMAIBEDAACKAwAg6QEAALgDADDqAQAACwAQ6wEAALgDADDsAQEAgQMAIfEBQACFAwAhgwIBAIEDACGRAkAAhQMAIc0CAQCBAwAhzgIBAIEDACHPAgEAggMAIdACAQCCAwAh0QIBAIIDACHSAkAAuQMAIdMCQAC5AwAh1AIBAIIDACHVAgEAggMAIQgDAAD9AwAgzwIAAMYDACDQAgAAxgMAINECAADGAwAg0gIAAMYDACDTAgAAxgMAINQCAADGAwAg1QIAAMYDACARAwAAigMAIOkBAAC4AwAw6gEAAAsAEOsBAAC4AwAw7AEBAAAAAfEBQACFAwAhgwIBAIEDACGRAkAAhQMAIc0CAQCBAwAhzgIBAIEDACHPAgEAggMAIdACAQCCAwAh0QIBAIIDACHSAkAAuQMAIdMCQAC5AwAh1AIBAIIDACHVAgEAggMAIQMAAAALACABAAAMADACAAANACAZAwAAigMAIOkBAACMAwAw6gEAAA8AEOsBAACMAwAw7AEBAIEDACHxAUAAhQMAIYMCAQCBAwAhkQJAAIUDACGfAgEAgQMAIaACAQCBAwAhoQIBAIIDACGiAgEAggMAIakCAQCCAwAhqgIBAIIDACGrAgEAggMAIawCAQCCAwAhrQIBAIIDACGuAgEAggMAIa8CAACIAwAgsAIAAIgDACCxAgAAjQMAILICAACNAwAgswIAAI4DACC0AgIAjwMAIbUCAgCPAwAhAQAAAA8AIA8DAACKAwAg6QEAAIkDADDqAQAAEQAQ6wEAAIkDADDsAQEAgQMAIfEBQACFAwAhgwIBAIEDACGRAkAAhQMAIZ8CAQCBAwAhoAIBAIEDACGhAgEAggMAIaICAQCCAwAhowIBAIIDACGkAgAAiAMAIKUCAQCCAwAhAQAAABEAIAUDAAD9AwAgBAAAlQUAILgCAADGAwAguQIAAMYDACC6AgAAxgMAIBEDAACKAwAgBAAApgMAIOkBAAC3AwAw6gEAAAcAEOsBAAC3AwAw7AEBAAAAAfEBQACFAwAhgwIBAIEDACG2AgEAgQMAIbcCAQCBAwAhuAIBAIIDACG5AgEAggMAIboCAQCCAwAhuwIBAIEDACG8AgEAgQMAIb0CIACEAwAhvgJAAIUDACEDAAAABwAgAQAAEwAwAgAAFAAgFgMAAIoDACAMAAC1AwAgDgAAtgMAIOkBAACxAwAw6gEAABYAEOsBAACxAwAw7AEBAIEDACHuAQIAjwMAIfEBQACFAwAhgwIBAIEDACGEAgEAgQMAIYUCAQCBAwAhhwIAALIDhwIiiQIAALMDiQIiigIBAIIDACGLAgEAggMAIYwCAgC0AwAhjQIAAI0DACCOAgAAjgMAII8CAQCCAwAhkAIgAIQDACGRAkAAhQMAIQgDAAD9AwAgDAAAnQUAIA4AAJ4FACCKAgAAxgMAIIsCAADGAwAgjAIAAMYDACCOAgAAxgMAII8CAADGAwAgFgMAAIoDACAMAAC1AwAgDgAAtgMAIOkBAACxAwAw6gEAABYAEOsBAACxAwAw7AEBAAAAAe4BAgCPAwAh8QFAAIUDACGDAgEAgQMAIYQCAQCBAwAhhQIBAIEDACGHAgAAsgOHAiKJAgAAswOJAiKKAgEAggMAIYsCAQCCAwAhjAICALQDACGNAgAAjQMAII4CAACOAwAgjwIBAIIDACGQAiAAhAMAIZECQACFAwAhAwAAABYAIAEAABcAMAIAABgAIAMAAAAWACABAAAXADACAAAYACABAAAAFgAgCg0AALADACDpAQAArwMAMOoBAAAcABDrAQAArwMAMOwBAQCBAwAh7QEBAIEDACHuAQIAjwMAIe8BAACNAwAg8AEBAIEDACHxAUAAhQMAIQENAACcBQAgCg0AALADACDpAQAArwMAMOoBAAAcABDrAQAArwMAMOwBAQAAAAHtAQEAgQMAIe4BAgCPAwAh7wEAAI0DACDwAQEAgQMAIfEBQACFAwAhAwAAABwAIAEAAB0AMAIAAB4AIAEAAAAcACALAwAAigMAIOkBAACtAwAw6gEAACEAEOsBAACtAwAw7AEBAIEDACHxAUAAhQMAIYMCAQCBAwAhhwIAAK4DwQIivwIBAIEDACHBAkAAhQMAIcICIACEAwAhAQMAAP0DACALAwAAigMAIOkBAACtAwAw6gEAACEAEOsBAACtAwAw7AEBAAAAAfEBQACFAwAhgwIBAIEDACGHAgAArgPBAiK_AgEAgQMAIcECQACFAwAhwgIgAIQDACEDAAAAIQAgAQAAIgAwAgAAIwAgDAMAAIoDACDpAQAAlgMAMOoBAAAlABDrAQAAlgMAMOwBAQCBAwAhgwIBAIEDACHDAgIAjwMAIcQCAgCPAwAhxQICAI8DACHGAgIAjwMAIccCQACFAwAhyAIgAIQDACEBAAAAJQAgAQAAAAMAIAEAAAALACABAAAABwAgAQAAABYAIAEAAAAhACABAAAAAQAgFgQAAKYDACAHAACnAwAgCAAAqAMAIAkAAKkDACAKAACqAwAgCwAAhgMAIA8AAKsDACAQAACsAwAg6QEAAKQDADDqAQAALQAQ6wEAAKQDADDsAQEAgQMAIfEBQACFAwAhkQJAAIUDACGSAgEAgQMAIZkCIACEAwAh2AIBAIEDACHZAiAAhAMAIdoCAQCCAwAh3AIAAKUD3AIi3QIgAIQDACHeAgEAggMAIQoEAACVBQAgBwAAlgUAIAgAAJcFACAJAACYBQAgCgAAmQUAIAsAAPUDACAPAACaBQAgEAAAmwUAINoCAADGAwAg3gIAAMYDACADAAAALQAgAQAALgAwAgAAAQAgAwAAAC0AIAEAAC4AMAIAAAEAIAMAAAAtACABAAAuADACAAABACATBAAAjQUAIAcAAI4FACAIAACPBQAgCQAAkAUAIAoAAJEFACALAACSBQAgDwAAkwUAIBAAAJQFACDsAQEAAAAB8QFAAAAAAZECQAAAAAGSAgEAAAABmQIgAAAAAdgCAQAAAAHZAiAAAAAB2gIBAAAAAdwCAAAA3AIC3QIgAAAAAd4CAQAAAAEBFgAAMgAgC-wBAQAAAAHxAUAAAAABkQJAAAAAAZICAQAAAAGZAiAAAAAB2AIBAAAAAdkCIAAAAAHaAgEAAAAB3AIAAADcAgLdAiAAAAAB3gIBAAAAAQEWAAA0ADABFgAANAAwEwQAAMAEACAHAADBBAAgCAAAwgQAIAkAAMMEACAKAADEBAAgCwAAxQQAIA8AAMYEACAQAADHBAAg7AEBAMEDACHxAUAAwwMAIZECQADDAwAhkgIBAMEDACGZAiAA0AMAIdgCAQDBAwAh2QIgANADACHaAgEAzgMAIdwCAAC_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_AgEAAAABwQJAAAAAAcICIAAAAAEBFgAAwgEAMAEWAADCAQAwCAMAAKIEACDsAQEAwQMAIfEBQADDAwAhgwIBAMEDACGHAgAAoQTBAiK_AgEAwQMAIcECQADDAwAhwgIgANADACECAAAAIwAgFgAAxQEAIAfsAQEAwQMAIfEBQADDAwAhgwIBAMEDACGHAgAAoQTBAiK_AgEAwQMAIcECQADDAwAhwgIgANADACECAAAAIQAgFgAAxwEAIAIAAAAhACAWAADHAQAgAwAAACMAIB0AAMABACAeAADFAQAgAQAAACMAIAEAAAAhACADBQAAngQAICMAAKAEACAkAACfBAAgCukBAACRAwAw6gEAAM4BABDrAQAAkQMAMOwBAQDdAgAh8QFAAOACACGDAgEA3QIAIYcCAACSA8ECIr8CAQDdAgAhwQJAAOACACHCAiAA7wIAIQMAAAAhACABAADNAQAwIgAAzgEAIAMAAAAhACABAAAiADACAAAjACABAAAAFAAgAQAAABQAIAMAAAAHACABAAATADACAAAUACADAAAABwAgAQAAEwAwAgAAFAAgAwAAAAcAIAEAABMAMAIAABQAIA4DAACcBAAgBAAAnQQAIOwBAQAAAAHxAUAAAAABgwIBAAAAAbYCAQAAAAG3AgEAAAABuAIBAAAAAbkCAQAAAAG6AgEAAAABuwIBAAAAAbwCAQAAAAG9AiAAAAABvgJAAAAAAQEWAADWAQAgDOwBAQAAAAHxAUAAAAABgwIBAAAAAbYCAQAAAAG3AgEAAAABuAIBAAAAAbkCAQAAAAG6AgEAAAABuwIBAAAAAbwCAQAAAAG9AiAAAAABvgJAAAAAAQEWAADYAQAwARYAANgBADAOAwAAjAQAIAQAAI0EACDsAQEAwQMAIfEBQADDAwAhgwIBAMEDACG2AgEAwQMAIbcCAQDBAwAhuAIBAM4DACG5AgEAzgMAIboCAQDOAwAhuwIBAMEDACG8AgEAwQMAIb0CIADQAwAhvgJAAMMDACECAAAAFAAgFgAA2wEAIAzsAQEAwQMAIfEBQADDAwAhgwIBAMEDACG2AgEAwQMAIbcCAQDBAwAhuAIBAM4DACG5AgEAzgMAIboCAQDOAwAhuwIBAMEDACG8AgEAwQMAIb0CIADQAwAhvgJAAMMDACECAAAABwAgFgAA3QEAIAIAAAAHACAWAADdAQAgAwAAABQAIB0AANYBACAeAADbAQAgAQAAABQAIAEAAAAHACAGBQAAiQQAICMAAIsEACAkAACKBAAguAIAAMYDACC5AgAAxgMAILoCAADGAwAgD-kBAACQAwAw6gEAAOQBABDrAQAAkAMAMOwBAQDdAgAh8QFAAOACACGDAgEA3QIAIbYCAQDdAgAhtwIBAN0CACG4AgEA7AIAIbkCAQDsAgAhugIBAOwCACG7AgEA3QIAIbwCAQDdAgAhvQIgAO8CACG-AkAA4AIAIQMAAAAHACABAADjAQAwIgAA5AEAIAMAAAAHACABAAATADACAAAUACAZAwAAigMAIOkBAACMAwAw6gEAAA8AEOsBAACMAwAw7AEBAAAAAfEBQACFAwAhgwIBAAAAAZECQACFAwAhnwIBAIEDACGgAgEAgQMAIaECAQCCAwAhogIBAIIDACGpAgEAggMAIaoCAQCCAwAhqwIBAIIDACGsAgEAggMAIa0CAQCCAwAhrgIBAIIDACGvAgAAiAMAILACAACIAwAgsQIAAI0DACCyAgAAjQMAILMCAACOAwAgtAICAI8DACG1AgIAjwMAIQEAAADnAQAgAQAAAOcBACAKAwAA_QMAIKECAADGAwAgogIAAMYDACCpAgAAxgMAIKoCAADGAwAgqwIAAMYDACCsAgAAxgMAIK0CAADGAwAgrgIAAMYDACCzAgAAxgMAIAMAAAAPACABAADqAQAwAgAA5wEAIAMAAAAPACABAADqAQAwAgAA5wEAIAMAAAAPACABAADqAQAwAgAA5wEAIBYDAACIBAAg7AEBAAAAAfEBQAAAAAGDAgEAAAABkQJAAAAAAZ8CAQAAAAGgAgEAAAABoQIBAAAAAaICAQAAAAGpAgEAAAABqgIBAAAAAasCAQAAAAGsAgEAAAABrQIBAAAAAa4CAQAAAAGvAgAAhgQAILACAACHBAAgsQKAAAAAAbICgAAAAAGzAoAAAAABtAICAAAAAbUCAgAAAAEBFgAA7gEAIBXsAQEAAAAB8QFAAAAAAYMCAQAAAAGRAkAAAAABnwIBAAAAAaACAQAAAAGhAgEAAAABogIBAAAAAakCAQAAAAGqAgEAAAABqwIBAAAAAawCAQAAAAGtAgEAAAABrgIBAAAAAa8CAACGBAAgsAIAAIcEACCxAoAAAAABsgKAAAAAAbMCgAAAAAG0AgIAAAABtQICAAAAAQEWAADwAQAwARYAAPABADAWAwAAhQQAIOwBAQDBAwAh8QFAAMMDACGDAgEAwQMAIZECQADDAwAhnwIBAMEDACGgAgEAwQMAIaECAQDOAwAhogIBAM4DACGpAgEAzgMAIaoCAQDOAwAhqwIBAM4DACGsAgEAzgMAIa0CAQDOAwAhrgIBAM4DACGvAgAAgwQAILACAACEBAAgsQKAAAAAAbICgAAAAAGzAoAAAAABtAICAMIDACG1AgIAwgMAIQIAAADnAQAgFgAA8wEAIBXsAQEAwQMAIfEBQADDAwAhgwIBAMEDACGRAkAAwwMAIZ8CAQDBAwAhoAIBAMEDACGhAgEAzgMAIaICAQDOAwAhqQIBAM4DACGqAgEAzgMAIasCAQDOAwAhrAIBAM4DACGtAgEAzgMAIa4CAQDOAwAhrwIAAIMEACCwAgAAhAQAILECgAAAAAGyAoAAAAABswKAAAAAAbQCAgDCAwAhtQICAMIDACECAAAADwAgFgAA9QEAIAIAAAAPACAWAAD1AQAgAwAAAOcBACAdAADuAQAgHgAA8wEAIAEAAADnAQAgAQAAAA8AIA4FAAD-AwAgIwAAgQQAICQAAIAEACB1AAD_AwAgdgAAggQAIKECAADGAwAgogIAAMYDACCpAgAAxgMAIKoCAADGAwAgqwIAAMYDACCsAgAAxgMAIK0CAADGAwAgrgIAAMYDACCzAgAAxgMAIBjpAQAAiwMAMOoBAAD8AQAQ6wEAAIsDADDsAQEA3QIAIfEBQADgAgAhgwIBAN0CACGRAkAA4AIAIZ8CAQDdAgAhoAIBAN0CACGhAgEA7AIAIaICAQDsAgAhqQIBAOwCACGqAgEA7AIAIasCAQDsAgAhrAIBAOwCACGtAgEA7AIAIa4CAQDsAgAhrwIAAIgDACCwAgAAiAMAILECAADfAgAgsgIAAN8CACCzAgAA7gIAILQCAgDeAgAhtQICAN4CACEDAAAADwAgAQAA-wEAMCIAAPwBACADAAAADwAgAQAA6gEAMAIAAOcBACAPAwAAigMAIOkBAACJAwAw6gEAABEAEOsBAACJAwAw7AEBAAAAAfEBQACFAwAhgwIBAAAAAZECQACFAwAhnwIBAIEDACGgAgEAgQMAIaECAQCCAwAhogIBAIIDACGjAgEAggMAIaQCAACIAwAgpQIBAIIDACEBAAAA_wEAIAEAAAD_AQAgBQMAAP0DACChAgAAxgMAIKICAADGAwAgowIAAMYDACClAgAAxgMAIAMAAAARACABAACCAgAwAgAA_wEAIAMAAAARACABAACCAgAwAgAA_wEAIAMAAAARACABAACCAgAwAgAA_wEAIAwDAAD8AwAg7AEBAAAAAfEBQAAAAAGDAgEAAAABkQJAAAAAAZ8CAQAAAAGgAgEAAAABoQIBAAAAAaICAQAAAAGjAgEAAAABpAIAAPsDACClAgEAAAABARYAAIYCACAL7AEBAAAAAfEBQAAAAAGDAgEAAAABkQJAAAAAAZ8CAQAAAAGgAgEAAAABoQIBAAAAAaICAQAAAAGjAgEAAAABpAIAAPsDACClAgEAAAABARYAAIgCADABFgAAiAIAMAwDAAD6AwAg7AEBAMEDACHxAUAAwwMAIYMCAQDBAwAhkQJAAMMDACGfAgEAwQMAIaACAQDBAwAhoQIBAM4DACGiAgEAzgMAIaMCAQDOAwAhpAIAAPkDACClAgEAzgMAIQIAAAD_AQAgFgAAiwIAIAvsAQEAwQMAIfEBQADDAwAhgwIBAMEDACGRAkAAwwMAIZ8CAQDBAwAhoAIBAMEDACGhAgEAzgMAIaICAQDOAwAhowIBAM4DACGkAgAA-QMAIKUCAQDOAwAhAgAAABEAIBYAAI0CACACAAAAEQAgFgAAjQIAIAMAAAD_AQAgHQAAhgIAIB4AAIsCACABAAAA_wEAIAEAAAARACAHBQAA9gMAICMAAPgDACAkAAD3AwAgoQIAAMYDACCiAgAAxgMAIKMCAADGAwAgpQIAAMYDACAO6QEAAIcDADDqAQAAlAIAEOsBAACHAwAw7AEBAN0CACHxAUAA4AIAIYMCAQDdAgAhkQJAAOACACGfAgEA3QIAIaACAQDdAgAhoQIBAOwCACGiAgEA7AIAIaMCAQDsAgAhpAIAAIgDACClAgEA7AIAIQMAAAARACABAACTAgAwIgAAlAIAIAMAAAARACABAACCAgAwAgAA_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_AwAgJAAAvgMAIHUAAL0DACB2AADAAwAgCekBAADcAgAw6gEAANkCABDrAQAA3AIAMOwBAQDdAgAh7QEBAN0CACHuAQIA3gIAIe8BAADfAgAg8AEBAN0CACHxAUAA4AIAIQMAAAAcACABAADYAgAwIgAA2QIAIAMAAAAcACABAAAdADACAAAeACAJ6QEAANwCADDqAQAA2QIAEOsBAADcAgAw7AEBAN0CACHtAQEA3QIAIe4BAgDeAgAh7wEAAN8CACDwAQEA3QIAIfEBQADgAgAhDgUAAOICACAjAADoAgAgJAAA6AIAIPIBAQAAAAHzAQEAAAAE9AEBAAAABPUBAQAAAAH2AQEAAAAB9wEBAAAAAfgBAQAAAAH5AQEA5wIAIYACAQAAAAGBAgEAAAABggIBAAAAAQ0FAADiAgAgIwAA4gIAICQAAOICACB1AADmAgAgdgAA4gIAIPIBAgAAAAHzAQIAAAAE9AECAAAABPUBAgAAAAH2AQIAAAAB9wECAAAAAfgBAgAAAAH5AQIA5QIAIQ8FAADiAgAgIwAA5AIAICQAAOQCACDyAYAAAAAB9QGAAAAAAfYBgAAAAAH3AYAAAAAB-AGAAAAAAfkBgAAAAAH6AQEAAAAB-wEBAAAAAfwBAQAAAAH9AYAAAAAB_gGAAAAAAf8BgAAAAAELBQAA4gIAICMAAOMCACAkAADjAgAg8gFAAAAAAfMBQAAAAAT0AUAAAAAE9QFAAAAAAfYBQAAAAAH3AUAAAAAB-AFAAAAAAfkBQADhAgAhCwUAAOICACAjAADjAgAgJAAA4wIAIPIBQAAAAAHzAUAAAAAE9AFAAAAABPUBQAAAAAH2AUAAAAAB9wFAAAAAAfgBQAAAAAH5AUAA4QIAIQjyAQIAAAAB8wECAAAABPQBAgAAAAT1AQIAAAAB9gECAAAAAfcBAgAAAAH4AQIAAAAB-QECAOICACEI8gFAAAAAAfMBQAAAAAT0AUAAAAAE9QFAAAAAAfYBQAAAAAH3AUAAAAAB-AFAAAAAAfkBQADjAgAhDPIBgAAAAAH1AYAAAAAB9gGAAAAAAfcBgAAAAAH4AYAAAAAB-QGAAAAAAfoBAQAAAAH7AQEAAAAB_AEBAAAAAf0BgAAAAAH-AYAAAAAB_wGAAAAAAQ0FAADiAgAgIwAA4gIAICQAAOICACB1AADmAgAgdgAA4gIAIPIBAgAAAAHzAQIAAAAE9AECAAAABPUBAgAAAAH2AQIAAAAB9wECAAAAAfgBAgAAAAH5AQIA5QIAIQjyAQgAAAAB8wEIAAAABPQBCAAAAAT1AQgAAAAB9gEIAAAAAfcBCAAAAAH4AQgAAAAB-QEIAOYCACEOBQAA4gIAICMAAOgCACAkAADoAgAg8gEBAAAAAfMBAQAAAAT0AQEAAAAE9QEBAAAAAfYBAQAAAAH3AQEAAAAB-AEBAAAAAfkBAQDnAgAhgAIBAAAAAYECAQAAAAGCAgEAAAABC_IBAQAAAAHzAQEAAAAE9AEBAAAABPUBAQAAAAH2AQEAAAAB9wEBAAAAAfgBAQAAAAH5AQEA6AIAIYACAQAAAAGBAgEAAAABggIBAAAAARPpAQAA6QIAMOoBAADDAgAQ6wEAAOkCADDsAQEA3QIAIe4BAgDeAgAh8QFAAOACACGDAgEA3QIAIYQCAQDdAgAhhQIBAN0CACGHAgAA6gKHAiKJAgAA6wKJAiKKAgEA7AIAIYsCAQDsAgAhjAICAO0CACGNAgAA3wIAII4CAADuAgAgjwIBAOwCACGQAiAA7wIAIZECQADgAgAhBwUAAOICACAjAAD7AgAgJAAA-wIAIPIBAAAAhwIC8wEAAACHAgj0AQAAAIcCCPkBAAD6AocCIgcFAADiAgAgIwAA-QIAICQAAPkCACDyAQAAAIkCAvMBAAAAiQII9AEAAACJAgj5AQAA-AKJAiIOBQAA8gIAICMAAPcCACAkAAD3AgAg8gEBAAAAAfMBAQAAAAX0AQEAAAAF9QEBAAAAAfYBAQAAAAH3AQEAAAAB-AEBAAAAAfkBAQD2AgAhgAIBAAAAAYECAQAAAAGCAgEAAAABDQUAAPICACAjAADyAgAgJAAA8gIAIHUAAPUCACB2AADyAgAg8gECAAAAAfMBAgAAAAX0AQIAAAAF9QECAAAAAfYBAgAAAAH3AQIAAAAB-AECAAAAAfkBAgD0AgAhDwUAAPICACAjAADzAgAgJAAA8wIAIPIBgAAAAAH1AYAAAAAB9gGAAAAAAfcBgAAAAAH4AYAAAAAB-QGAAAAAAfoBAQAAAAH7AQEAAAAB_AEBAAAAAf0BgAAAAAH-AYAAAAAB_wGAAAAAAQUFAADiAgAgIwAA8QIAICQAAPECACDyASAAAAAB-QEgAPACACEFBQAA4gIAICMAAPECACAkAADxAgAg8gEgAAAAAfkBIADwAgAhAvIBIAAAAAH5ASAA8QIAIQjyAQIAAAAB8wECAAAABfQBAgAAAAX1AQIAAAAB9gECAAAAAfcBAgAAAAH4AQIAAAAB-QECAPICACEM8gGAAAAAAfUBgAAAAAH2AYAAAAAB9wGAAAAAAfgBgAAAAAH5AYAAAAAB-gEBAAAAAfsBAQAAAAH8AQEAAAAB_QGAAAAAAf4BgAAAAAH_AYAAAAABDQUAAPICACAjAADyAgAgJAAA8gIAIHUAAPUCACB2AADyAgAg8gECAAAAAfMBAgAAAAX0AQIAAAAF9QECAAAAAfYBAgAAAAH3AQIAAAAB-AECAAAAAfkBAgD0AgAhCPIBCAAAAAHzAQgAAAAF9AEIAAAABfUBCAAAAAH2AQgAAAAB9wEIAAAAAfgBCAAAAAH5AQgA9QIAIQ4FAADyAgAgIwAA9wIAICQAAPcCACDyAQEAAAAB8wEBAAAABfQBAQAAAAX1AQEAAAAB9gEBAAAAAfcBAQAAAAH4AQEAAAAB-QEBAPYCACGAAgEAAAABgQIBAAAAAYICAQAAAAEL8gEBAAAAAfMBAQAAAAX0AQEAAAAF9QEBAAAAAfYBAQAAAAH3AQEAAAAB-AEBAAAAAfkBAQD3AgAhgAIBAAAAAYECAQAAAAGCAgEAAAABBwUAAOICACAjAAD5AgAgJAAA-QIAIPIBAAAAiQIC8wEAAACJAgj0AQAAAIkCCPkBAAD4AokCIgTyAQAAAIkCAvMBAAAAiQII9AEAAACJAgj5AQAA-QKJAiIHBQAA4gIAICMAAPsCACAkAAD7AgAg8gEAAACHAgLzAQAAAIcCCPQBAAAAhwII-QEAAPoChwIiBPIBAAAAhwIC8wEAAACHAgj0AQAAAIcCCPkBAAD7AocCIg_pAQAA_AIAMOoBAACtAgAQ6wEAAPwCADDsAQEA3QIAIfEBQADgAgAhkQJAAOACACGSAgEA3QIAIZMCAQDsAgAhlAIBAN0CACGVAgEA3QIAIZYCAQDdAgAhmAIAAP0CmAIimQIgAO8CACGaAiAA7wIAIZsCAQDdAgAhBwUAAOICACAjAAD_AgAgJAAA_wIAIPIBAAAAmAIC8wEAAACYAgj0AQAAAJgCCPkBAAD-ApgCIgcFAADiAgAgIwAA_wIAICQAAP8CACDyAQAAAJgCAvMBAAAAmAII9AEAAACYAgj5AQAA_gKYAiIE8gEAAACYAgLzAQAAAJgCCPQBAAAAmAII-QEAAP8CmAIiEAsAAIYDACDpAQAAgAMAMOoBAACaAgAQ6wEAAIADADDsAQEAgQMAIfEBQACFAwAhkQJAAIUDACGSAgEAgQMAIZMCAQCCAwAhlAIBAIEDACGVAgEAgQMAIZYCAQCBAwAhmAIAAIMDmAIimQIgAIQDACGaAiAAhAMAIZsCAQCBAwAhC_IBAQAAAAHzAQEAAAAE9AEBAAAABPUBAQAAAAH2AQEAAAAB9wEBAAAAAfgBAQAAAAH5AQEA6AIAIYACAQAAAAGBAgEAAAABggIBAAAAAQvyAQEAAAAB8wEBAAAABfQBAQAAAAX1AQEAAAAB9gEBAAAAAfcBAQAAAAH4AQEAAAAB-QEBAPcCACGAAgEAAAABgQIBAAAAAYICAQAAAAEE8gEAAACYAgLzAQAAAJgCCPQBAAAAmAII-QEAAP8CmAIiAvIBIAAAAAH5ASAA8QIAIQjyAUAAAAAB8wFAAAAABPQBQAAAAAT1AUAAAAAB9gFAAAAAAfcBQAAAAAH4AUAAAAAB-QFAAOMCACEDnAIAABYAIJ0CAAAWACCeAgAAFgAgDukBAACHAwAw6gEAAJQCABDrAQAAhwMAMOwBAQDdAgAh8QFAAOACACGDAgEA3QIAIZECQADgAgAhnwIBAN0CACGgAgEA3QIAIaECAQDsAgAhogIBAOwCACGjAgEA7AIAIaQCAACIAwAgpQIBAOwCACEE8gEBAAAABaYCAQAAAAGnAgEAAAAEqAIBAAAABA8DAACKAwAg6QEAAIkDADDqAQAAEQAQ6wEAAIkDADDsAQEAgQMAIfEBQACFAwAhgwIBAIEDACGRAkAAhQMAIZ8CAQCBAwAhoAIBAIEDACGhAgEAggMAIaICAQCCAwAhowIBAIIDACGkAgAAiAMAIKUCAQCCAwAhGAQAAKYDACAHAACnAwAgCAAAqAMAIAkAAKkDACAKAACqAwAgCwAAhgMAIA8AAKsDACAQAACsAwAg6QEAAKQDADDqAQAALQAQ6wEAAKQDADDsAQEAgQMAIfEBQACFAwAhkQJAAIUDACGSAgEAgQMAIZkCIACEAwAh2AIBAIEDACHZAiAAhAMAIdoCAQCCAwAh3AIAAKUD3AIi3QIgAIQDACHeAgEAggMAId8CAAAtACDgAgAALQAgGOkBAACLAwAw6gEAAPwBABDrAQAAiwMAMOwBAQDdAgAh8QFAAOACACGDAgEA3QIAIZECQADgAgAhnwIBAN0CACGgAgEA3QIAIaECAQDsAgAhogIBAOwCACGpAgEA7AIAIaoCAQDsAgAhqwIBAOwCACGsAgEA7AIAIa0CAQDsAgAhrgIBAOwCACGvAgAAiAMAILACAACIAwAgsQIAAN8CACCyAgAA3wIAILMCAADuAgAgtAICAN4CACG1AgIA3gIAIRkDAACKAwAg6QEAAIwDADDqAQAADwAQ6wEAAIwDADDsAQEAgQMAIfEBQACFAwAhgwIBAIEDACGRAkAAhQMAIZ8CAQCBAwAhoAIBAIEDACGhAgEAggMAIaICAQCCAwAhqQIBAIIDACGqAgEAggMAIasCAQCCAwAhrAIBAIIDACGtAgEAggMAIa4CAQCCAwAhrwIAAIgDACCwAgAAiAMAILECAACNAwAgsgIAAI0DACCzAgAAjgMAILQCAgCPAwAhtQICAI8DACEM8gGAAAAAAfUBgAAAAAH2AYAAAAAB9wGAAAAAAfgBgAAAAAH5AYAAAAAB-gEBAAAAAfsBAQAAAAH8AQEAAAAB_QGAAAAAAf4BgAAAAAH_AYAAAAABDPIBgAAAAAH1AYAAAAAB9gGAAAAAAfcBgAAAAAH4AYAAAAAB-QGAAAAAAfoBAQAAAAH7AQEAAAAB_AEBAAAAAf0BgAAAAAH-AYAAAAAB_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-gQAMOMCAAD7BAAg5AIAAPwEADDlAgAA_AQAMOYCAAD8BAAw5wIAAPwEADDoAgAA_gQAMOkCAAD_BAAwBx0AAPMEACAeAAD2BAAg4QIAAPQEACDiAgAA9QQAIOUCAAAPACDmAgAADwAg5wIAAOcBACAHHQAA7gQAIB4AAPEEACDhAgAA7wQAIOICAADwBAAg5QIAABEAIOYCAAARACDnAgAA_wEAIAsdAADiBAAwHgAA5wQAMOECAADjBAAw4gIAAOQEADDjAgAA5QQAIOQCAADmBAAw5QIAAOYEADDmAgAA5gQAMOcCAADmBAAw6AIAAOgEADDpAgAA6QQAMAsdAADZBAAwHgAA3QQAMOECAADaBAAw4gIAANsEADDjAgAA3AQAIOQCAADsAwAw5QIAAOwDADDmAgAA7AMAMOcCAADsAwAw6AIAAN4EADDpAgAA7wMAMAsdAADNBAAwHgAA0gQAMOECAADOBAAw4gIAAM8EADDjAgAA0AQAIOQCAADRBAAw5QIAANEEADDmAgAA0QQAMOcCAADRBAAw6AIAANMEADDpAgAA1AQAMAcdAADIBAAgHgAAywQAIOECAADJBAAg4gIAAMoEACDlAgAAJQAg5gIAACUAIOcCAACjAQAgB-wBAQAAAAHDAgIAAAABxAICAAAAAcUCAgAAAAHGAgIAAAABxwJAAAAAAcgCIAAAAAECAAAAowEAIB0AAMgEACADAAAAJQAgHQAAyAQAIB4AAMwEACAJAAAAJQAgFgAAzAQAIOwBAQDBAwAhwwICAMIDACHEAgIAwgMAIcUCAgDCAwAhxgICAMIDACHHAkAAwwMAIcgCIADQAwAhB-wBAQDBAwAhwwICAMIDACHEAgIAwgMAIcUCAgDCAwAhxgICAMIDACHHAkAAwwMAIcgCIADQAwAhBuwBAQAAAAHxAUAAAAABhwIAAADBAgK_AgEAAAABwQJAAAAAAcICIAAAAAECAAAAIwAgHQAA2AQAIAMAAAAjACAdAADYBAAgHgAA1wQAIAEWAACkBQAwCwMAAIoDACDpAQAArQMAMOoBAAAhABDrAQAArQMAMOwBAQAAAAHxAUAAhQMAIYMCAQCBAwAhhwIAAK4DwQIivwIBAIEDACHBAkAAhQMAIcICIACEAwAhAgAAACMAIBYAANcEACACAAAA1QQAIBYAANYEACAK6QEAANQEADDqAQAA1QQAEOsBAADUBAAw7AEBAIEDACHxAUAAhQMAIYMCAQCBAwAhhwIAAK4DwQIivwIBAIEDACHBAkAAhQMAIcICIACEAwAhCukBAADUBAAw6gEAANUEABDrAQAA1AQAMOwBAQCBAwAh8QFAAIUDACGDAgEAgQMAIYcCAACuA8ECIr8CAQCBAwAhwQJAAIUDACHCAiAAhAMAIQbsAQEAwQMAIfEBQADDAwAhhwIAAKEEwQIivwIBAMEDACHBAkAAwwMAIcICIADQAwAhBuwBAQDBAwAh8QFAAMMDACGHAgAAoQTBAiK_AgEAwQMAIcECQADDAwAhwgIgANADACEG7AEBAAAAAfEBQAAAAAGHAgAAAMECAr8CAQAAAAHBAkAAAAABwgIgAAAAAREMAADhAwAgDgAA4gMAIOwBAQAAAAHuAQIAAAAB8QFAAAAAAYQCAQAAAAGFAgEAAAABhwIAAACHAgKJAgAAAIkCAooCAQAAAAGLAgEAAAABjAICAAAAAY0CgAAAAAGOAoAAAAABjwIBAAAAAZACIAAAAAGRAkAAAAABAgAAABgAIB0AAOEEACADAAAAGAAgHQAA4QQAIB4AAOAEACABFgAAowUAMAIAAAAYACAWAADgBAAgAgAAAPADACAWAADfBAAgD-wBAQDBAwAh7gECAMIDACHxAUAAwwMAIYQCAQDBAwAhhQIBAMEDACGHAgAAzAOHAiKJAgAAzQOJAiKKAgEAzgMAIYsCAQDOAwAhjAICAM8DACGNAoAAAAABjgKAAAAAAY8CAQDOAwAhkAIgANADACGRAkAAwwMAIREMAADSAwAgDgAA0wMAIOwBAQDBAwAh7gECAMIDACHxAUAAwwMAIYQCAQDBAwAhhQIBAMEDACGHAgAAzAOHAiKJAgAAzQOJAiKKAgEAzgMAIYsCAQDOAwAhjAICAM8DACGNAoAAAAABjgKAAAAAAY8CAQDOAwAhkAIgANADACGRAkAAwwMAIREMAADhAwAgDgAA4gMAIOwBAQAAAAHuAQIAAAAB8QFAAAAAAYQCAQAAAAGFAgEAAAABhwIAAACHAgKJAgAAAIkCAooCAQAAAAGLAgEAAAABjAICAAAAAY0CgAAAAAGOAoAAAAABjwIBAAAAAZACIAAAAAGRAkAAAAABDAQAAJ0EACDsAQEAAAAB8QFAAAAAAbYCAQAAAAG3AgEAAAABuAIBAAAAAbkCAQAAAAG6AgEAAAABuwIBAAAAAbwCAQAAAAG9AiAAAAABvgJAAAAAAQIAAAAUACAdAADtBAAgAwAAABQAIB0AAO0EACAeAADsBAAgARYAAKIFADARAwAAigMAIAQAAKYDACDpAQAAtwMAMOoBAAAHABDrAQAAtwMAMOwBAQAAAAHxAUAAhQMAIYMCAQCBAwAhtgIBAIEDACG3AgEAgQMAIbgCAQCCAwAhuQIBAIIDACG6AgEAggMAIbsCAQCBAwAhvAIBAIEDACG9AiAAhAMAIb4CQACFAwAhAgAAABQAIBYAAOwEACACAAAA6gQAIBYAAOsEACAP6QEAAOkEADDqAQAA6gQAEOsBAADpBAAw7AEBAIEDACHxAUAAhQMAIYMCAQCBAwAhtgIBAIEDACG3AgEAgQMAIbgCAQCCAwAhuQIBAIIDACG6AgEAggMAIbsCAQCBAwAhvAIBAIEDACG9AiAAhAMAIb4CQACFAwAhD-kBAADpBAAw6gEAAOoEABDrAQAA6QQAMOwBAQCBAwAh8QFAAIUDACGDAgEAgQMAIbYCAQCBAwAhtwIBAIEDACG4AgEAggMAIbkCAQCCAwAhugIBAIIDACG7AgEAgQMAIbwCAQCBAwAhvQIgAIQDACG-AkAAhQMAIQvsAQEAwQMAIfEBQADDAwAhtgIBAMEDACG3AgEAwQMAIbgCAQDOAwAhuQIBAM4DACG6AgEAzgMAIbsCAQDBAwAhvAIBAMEDACG9AiAA0AMAIb4CQADDAwAhDAQAAI0EACDsAQEAwQMAIfEBQADDAwAhtgIBAMEDACG3AgEAwQMAIbgCAQDOAwAhuQIBAM4DACG6AgEAzgMAIbsCAQDBAwAhvAIBAMEDACG9AiAA0AMAIb4CQADDAwAhDAQAAJ0EACDsAQEAAAAB8QFAAAAAAbYCAQAAAAG3AgEAAAABuAIBAAAAAbkCAQAAAAG6AgEAAAABuwIBAAAAAbwCAQAAAAG9AiAAAAABvgJAAAAAAQrsAQEAAAAB8QFAAAAAAZECQAAAAAGfAgEAAAABoAIBAAAAAaECAQAAAAGiAgEAAAABowIBAAAAAaQCAAD7AwAgpQIBAAAAAQIAAAD_AQAgHQAA7gQAIAMAAAARACAdAADuBAAgHgAA8gQAIAwAAAARACAWAADyBAAg7AEBAMEDACHxAUAAwwMAIZECQADDAwAhnwIBAMEDACGgAgEAwQMAIaECAQDOAwAhogIBAM4DACGjAgEAzgMAIaQCAAD5AwAgpQIBAM4DACEK7AEBAMEDACHxAUAAwwMAIZECQADDAwAhnwIBAMEDACGgAgEAwQMAIaECAQDOAwAhogIBAM4DACGjAgEAzgMAIaQCAAD5AwAgpQIBAM4DACEU7AEBAAAAAfEBQAAAAAGRAkAAAAABnwIBAAAAAaACAQAAAAGhAgEAAAABogIBAAAAAakCAQAAAAGqAgEAAAABqwIBAAAAAawCAQAAAAGtAgEAAAABrgIBAAAAAa8CAACGBAAgsAIAAIcEACCxAoAAAAABsgKAAAAAAbMCgAAAAAG0AgIAAAABtQICAAAAAQIAAADnAQAgHQAA8wQAIAMAAAAPACAdAADzBAAgHgAA9wQAIBYAAAAPACAWAAD3BAAg7AEBAMEDACHxAUAAwwMAIZECQADDAwAhnwIBAMEDACGgAgEAwQMAIaECAQDOAwAhogIBAM4DACGpAgEAzgMAIaoCAQDOAwAhqwIBAM4DACGsAgEAzgMAIa0CAQDOAwAhrgIBAM4DACGvAgAAgwQAILACAACEBAAgsQKAAAAAAbICgAAAAAGzAoAAAAABtAICAMIDACG1AgIAwgMAIRTsAQEAwQMAIfEBQADDAwAhkQJAAMMDACGfAgEAwQMAIaACAQDBAwAhoQIBAM4DACGiAgEAzgMAIakCAQDOAwAhqgIBAM4DACGrAgEAzgMAIawCAQDOAwAhrQIBAM4DACGuAgEAzgMAIa8CAACDBAAgsAIAAIQEACCxAoAAAAABsgKAAAAAAbMCgAAAAAG0AgIAwgMAIbUCAgDCAwAhDOwBAQAAAAHxAUAAAAABkQJAAAAAAc0CAQAAAAHOAgEAAAABzwIBAAAAAdACAQAAAAHRAgEAAAAB0gJAAAAAAdMCQAAAAAHUAgEAAAAB1QIBAAAAAQIAAAANACAdAACDBQAgAwAAAA0AIB0AAIMFACAeAACCBQAgARYAAKEFADARAwAAigMAIOkBAAC4AwAw6gEAAAsAEOsBAAC4AwAw7AEBAAAAAfEBQACFAwAhgwIBAIEDACGRAkAAhQMAIc0CAQCBAwAhzgIBAIEDACHPAgEAggMAIdACAQCCAwAh0QIBAIIDACHSAkAAuQMAIdMCQAC5AwAh1AIBAIIDACHVAgEAggMAIQIAAAANACAWAACCBQAgAgAAAIAFACAWAACBBQAgEOkBAAD_BAAw6gEAAIAFABDrAQAA_wQAMOwBAQCBAwAh8QFAAIUDACGDAgEAgQMAIZECQACFAwAhzQIBAIEDACHOAgEAgQMAIc8CAQCCAwAh0AIBAIIDACHRAgEAggMAIdICQAC5AwAh0wJAALkDACHUAgEAggMAIdUCAQCCAwAhEOkBAAD_BAAw6gEAAIAFABDrAQAA_wQAMOwBAQCBAwAh8QFAAIUDACGDAgEAgQMAIZECQACFAwAhzQIBAIEDACHOAgEAgQMAIc8CAQCCAwAh0AIBAIIDACHRAgEAggMAIdICQAC5AwAh0wJAALkDACHUAgEAggMAIdUCAQCCAwAhDOwBAQDBAwAh8QFAAMMDACGRAkAAwwMAIc0CAQDBAwAhzgIBAMEDACHPAgEAzgMAIdACAQDOAwAh0QIBAM4DACHSAkAAtAQAIdMCQAC0BAAh1AIBAM4DACHVAgEAzgMAIQzsAQEAwQMAIfEBQADDAwAhkQJAAMMDACHNAgEAwQMAIc4CAQDBAwAhzwIBAM4DACHQAgEAzgMAIdECAQDOAwAh0gJAALQEACHTAkAAtAQAIdQCAQDOAwAh1QIBAM4DACEM7AEBAAAAAfEBQAAAAAGRAkAAAAABzQIBAAAAAc4CAQAAAAHPAgEAAAAB0AIBAAAAAdECAQAAAAHSAkAAAAAB0wJAAAAAAdQCAQAAAAHVAgEAAAABCQYAALsEACDsAQEAAAAB8QFAAAAAAZECQAAAAAG6AgEAAAABuwIBAAAAAcECQAAAAAHWAgEAAAAB1wIBAAAAAQIAAAAFACAdAACMBQAgAwAAAAUAIB0AAIwFACAeAACLBQAgARYAAKAFADACAAAABQAgFgAAiwUAIAIAAACWBAAgFgAAigUAIAjsAQEAwQMAIfEBQADDAwAhkQJAAMMDACG6AgEAzgMAIbsCAQDOAwAhwQJAAMMDACHWAgEAwQMAIdcCAQDOAwAhCQYAALoEACDsAQEAwQMAIfEBQADDAwAhkQJAAMMDACG6AgEAzgMAIbsCAQDOAwAhwQJAAMMDACHWAgEAwQMAIdcCAQDOAwAhCQYAALsEACDsAQEAAAAB8QFAAAAAAZECQAAAAAG6AgEAAAABuwIBAAAAAcECQAAAAAHWAgEAAAAB1wIBAAAAAQQdAACEBQAw4QIAAIUFADDjAgAAhwUAIOcCAACSBAAwBB0AAPgEADDhAgAA-QQAMOMCAAD7BAAg5wIAAPwEADADHQAA8wQAIOECAAD0BAAg5wIAAOcBACADHQAA7gQAIOECAADvBAAg5wIAAP8BACAEHQAA4gQAMOECAADjBAAw4wIAAOUEACDnAgAA5gQAMAQdAADZBAAw4QIAANoEADDjAgAA3AQAIOcCAADsAwAwBB0AAM0EADDhAgAAzgQAMOMCAADQBAAg5wIAANEEADADHQAAyAQAIOECAADJBAAg5wIAAKMBACAAAAoDAAD9AwAgoQIAAMYDACCiAgAAxgMAIKkCAADGAwAgqgIAAMYDACCrAgAAxgMAIKwCAADGAwAgrQIAAMYDACCuAgAAxgMAILMCAADGAwAgBQMAAP0DACChAgAAxgMAIKICAADGAwAgowIAAMYDACClAgAAxgMAIAAAAQMAAP0DACAIAwAA_QMAIAwAAJ0FACAOAACeBQAgigIAAMYDACCLAgAAxgMAIIwCAADGAwAgjgIAAMYDACCPAgAAxgMAIAILAAD1AwAgkwIAAMYDACAABQMAAP0DACAEAACVBQAguAIAAMYDACC5AgAAxgMAILoCAADGAwAgCOwBAQAAAAHxAUAAAAABkQJAAAAAAboCAQAAAAG7AgEAAAABwQJAAAAAAdYCAQAAAAHXAgEAAAABDOwBAQAAAAHxAUAAAAABkQJAAAAAAc0CAQAAAAHOAgEAAAABzwIBAAAAAdACAQAAAAHRAgEAAAAB0gJAAAAAAdMCQAAAAAHUAgEAAAAB1QIBAAAAAQvsAQEAAAAB8QFAAAAAAbYCAQAAAAG3AgEAAAABuAIBAAAAAbkCAQAAAAG6AgEAAAABuwIBAAAAAbwCAQAAAAG9AiAAAAABvgJAAAAAAQ_sAQEAAAAB7gECAAAAAfEBQAAAAAGEAgEAAAABhQIBAAAAAYcCAAAAhwICiQIAAACJAgKKAgEAAAABiwIBAAAAAYwCAgAAAAGNAoAAAAABjgKAAAAAAY8CAQAAAAGQAiAAAAABkQJAAAAAAQbsAQEAAAAB8QFAAAAAAYcCAAAAwQICvwIBAAAAAcECQAAAAAHCAiAAAAABDQMAAJwEACDsAQEAAAAB8QFAAAAAAYMCAQAAAAG2AgEAAAABtwIBAAAAAbgCAQAAAAG5AgEAAAABugIBAAAAAbsCAQAAAAG8AgEAAAABvQIgAAAAAb4CQAAAAAECAAAAFAAgHQAApQUAIAMAAAAHACAdAAClBQAgHgAAqQUAIA8AAAAHACADAACMBAAgFgAAqQUAIOwBAQDBAwAh8QFAAMMDACGDAgEAwQMAIbYCAQDBAwAhtwIBAMEDACG4AgEAzgMAIbkCAQDOAwAhugIBAM4DACG7AgEAwQMAIbwCAQDBAwAhvQIgANADACG-AkAAwwMAIQ0DAACMBAAg7AEBAMEDACHxAUAAwwMAIYMCAQDBAwAhtgIBAMEDACG3AgEAwQMAIbgCAQDOAwAhuQIBAM4DACG6AgEAzgMAIbsCAQDBAwAhvAIBAMEDACG9AiAA0AMAIb4CQADDAwAhEgQAAI0FACAIAACPBQAgCQAAkAUAIAoAAJEFACALAACSBQAgDwAAkwUAIBAAAJQFACDsAQEAAAAB8QFAAAAAAZECQAAAAAGSAgEAAAABmQIgAAAAAdgCAQAAAAHZAiAAAAAB2gIBAAAAAdwCAAAA3AIC3QIgAAAAAd4CAQAAAAECAAAAAQAgHQAAqgUAIAMAAAAtACAdAACqBQAgHgAArgUAIBQAAAAtACAEAADABAAgCAAAwgQAIAkAAMMEACAKAADEBAAgCwAAxQQAIA8AAMYEACAQAADHBAAgFgAArgUAIOwBAQDBAwAh8QFAAMMDACGRAkAAwwMAIZICAQDBAwAhmQIgANADACHYAgEAwQMAIdkCIADQAwAh2gIBAM4DACHcAgAAvwTcAiLdAiAA0AMAId4CAQDOAwAhEgQAAMAEACAIAADCBAAgCQAAwwQAIAoAAMQEACALAADFBAAgDwAAxgQAIBAAAMcEACDsAQEAwQMAIfEBQADDAwAhkQJAAMMDACGSAgEAwQMAIZkCIADQAwAh2AIBAMEDACHZAiAA0AMAIdoCAQDOAwAh3AIAAL8E3AIi3QIgANADACHeAgEAzgMAIRIEAACNBQAgBwAAjgUAIAgAAI8FACAJAACQBQAgCgAAkQUAIAsAAJIFACAPAACTBQAg7AEBAAAAAfEBQAAAAAGRAkAAAAABkgIBAAAAAZkCIAAAAAHYAgEAAAAB2QIgAAAAAdoCAQAAAAHcAgAAANwCAt0CIAAAAAHeAgEAAAABAgAAAAEAIB0AAK8FACADAAAALQAgHQAArwUAIB4AALMFACAUAAAALQAgBAAAwAQAIAcAAMEEACAIAADCBAAgCQAAwwQAIAoAAMQEACALAADFBAAgDwAAxgQAIBYAALMFACDsAQEAwQMAIfEBQADDAwAhkQJAAMMDACGSAgEAwQMAIZkCIADQAwAh2AIBAMEDACHZAiAA0AMAIdoCAQDOAwAh3AIAAL8E3AIi3QIgANADACHeAgEAzgMAIRIEAADABAAgBwAAwQQAIAgAAMIEACAJAADDBAAgCgAAxAQAIAsAAMUEACAPAADGBAAg7AEBAMEDACHxAUAAwwMAIZECQADDAwAhkgIBAMEDACGZAiAA0AMAIdgCAQDBAwAh2QIgANADACHaAgEAzgMAIdwCAAC_BNwCIt0CIADQAwAh3gIBAM4DACESBAAAjQUAIAcAAI4FACAIAACPBQAgCQAAkAUAIAoAAJEFACALAACSBQAgEAAAlAUAIOwBAQAAAAHxAUAAAAABkQJAAAAAAZICAQAAAAGZAiAAAAAB2AIBAAAAAdkCIAAAAAHaAgEAAAAB3AIAAADcAgLdAiAAAAAB3gIBAAAAAQIAAAABACAdAAC0BQAgAwAAAC0AIB0AALQFACAeAAC4BQAgFAAAAC0AIAQAAMAEACAHAADBBAAgCAAAwgQAIAkAAMMEACAKAADEBAAgCwAAxQQAIBAAAMcEACAWAAC4BQAg7AEBAMEDACHxAUAAwwMAIZECQADDAwAhkgIBAMEDACGZAiAA0AMAIdgCAQDBAwAh2QIgANADACHaAgEAzgMAIdwCAAC_BNwCIt0CIADQAwAh3gIBAM4DACESBAAAwAQAIAcAAMEEACAIAADCBAAgCQAAwwQAIAoAAMQEACALAADFBAAgEAAAxwQAIOwBAQDBAwAh8QFAAMMDACGRAkAAwwMAIZICAQDBAwAhmQIgANADACHYAgEAwQMAIdkCIADQAwAh2gIBAM4DACHcAgAAvwTcAiLdAiAA0AMAId4CAQDOAwAhEgQAAI0FACAHAACOBQAgCAAAjwUAIAkAAJAFACALAACSBQAgDwAAkwUAIBAAAJQFACDsAQEAAAAB8QFAAAAAAZECQAAAAAGSAgEAAAABmQIgAAAAAdgCAQAAAAHZAiAAAAAB2gIBAAAAAdwCAAAA3AIC3QIgAAAAAd4CAQAAAAECAAAAAQAgHQAAuQUAIBIHAACOBQAgCAAAjwUAIAkAAJAFACAKAACRBQAgCwAAkgUAIA8AAJMFACAQAACUBQAg7AEBAAAAAfEBQAAAAAGRAkAAAAABkgIBAAAAAZkCIAAAAAHYAgEAAAAB2QIgAAAAAdoCAQAAAAHcAgAAANwCAt0CIAAAAAHeAgEAAAABAgAAAAEAIB0AALsFACADAAAALQAgHQAAuwUAIB4AAL8FACAUAAAALQAgBwAAwQQAIAgAAMIEACAJAADDBAAgCgAAxAQAIAsAAMUEACAPAADGBAAgEAAAxwQAIBYAAL8FACDsAQEAwQMAIfEBQADDAwAhkQJAAMMDACGSAgEAwQMAIZkCIADQAwAh2AIBAMEDACHZAiAA0AMAIdoCAQDOAwAh3AIAAL8E3AIi3QIgANADACHeAgEAzgMAIRIHAADBBAAgCAAAwgQAIAkAAMMEACAKAADEBAAgCwAAxQQAIA8AAMYEACAQAADHBAAg7AEBAMEDACHxAUAAwwMAIZECQADDAwAhkgIBAMEDACGZAiAA0AMAIdgCAQDBAwAh2QIgANADACHaAgEAzgMAIdwCAAC_BNwCIt0CIADQAwAh3gIBAM4DACEI7AEBAAAAAfEBQAAAAAGDAgEAAAABkQJAAAAAAboCAQAAAAG7AgEAAAABwQJAAAAAAdYCAQAAAAEDAAAALQAgHQAAuQUAIB4AAMMFACAUAAAALQAgBAAAwAQAIAcAAMEEACAIAADCBAAgCQAAwwQAIAsAAMUEACAPAADGBAAgEAAAxwQAIBYAAMMFACDsAQEAwQMAIfEBQADDAwAhkQJAAMMDACGSAgEAwQMAIZkCIADQAwAh2AIBAMEDACHZAiAA0AMAIdoCAQDOAwAh3AIAAL8E3AIi3QIgANADACHeAgEAzgMAIRIEAADABAAgBwAAwQQAIAgAAMIEACAJAADDBAAgCwAAxQQAIA8AAMYEACAQAADHBAAg7AEBAMEDACHxAUAAwwMAIZECQADDAwAhkgIBAMEDACGZAiAA0AMAIdgCAQDBAwAh2QIgANADACHaAgEAzgMAIdwCAAC_BNwCIt0CIADQAwAh3gIBAM4DACESBAAAjQUAIAcAAI4FACAJAACQBQAgCgAAkQUAIAsAAJIFACAPAACTBQAgEAAAlAUAIOwBAQAAAAHxAUAAAAABkQJAAAAAAZICAQAAAAGZAiAAAAAB2AIBAAAAAdkCIAAAAAHaAgEAAAAB3AIAAADcAgLdAiAAAAAB3gIBAAAAAQIAAAABACAdAADEBQAgAwAAAC0AIB0AAMQFACAeAADIBQAgFAAAAC0AIAQAAMAEACAHAADBBAAgCQAAwwQAIAoAAMQEACALAADFBAAgDwAAxgQAIBAAAMcEACAWAADIBQAg7AEBAMEDACHxAUAAwwMAIZECQADDAwAhkgIBAMEDACGZAiAA0AMAIdgCAQDBAwAh2QIgANADACHaAgEAzgMAIdwCAAC_BNwCIt0CIADQAwAh3gIBAM4DACESBAAAwAQAIAcAAMEEACAJAADDBAAgCgAAxAQAIAsAAMUEACAPAADGBAAgEAAAxwQAIOwBAQDBAwAh8QFAAMMDACGRAkAAwwMAIZICAQDBAwAhmQIgANADACHYAgEAwQMAIdkCIADQAwAh2gIBAM4DACHcAgAAvwTcAiLdAiAA0AMAId4CAQDOAwAhEgQAAI0FACAHAACOBQAgCAAAjwUAIAoAAJEFACALAACSBQAgDwAAkwUAIBAAAJQFACDsAQEAAAAB8QFAAAAAAZECQAAAAAGSAgEAAAABmQIgAAAAAdgCAQAAAAHZAiAAAAAB2gIBAAAAAdwCAAAA3AIC3QIgAAAAAd4CAQAAAAECAAAAAQAgHQAAyQUAIAMAAAAtACAdAADJBQAgHgAAzQUAIBQAAAAtACAEAADABAAgBwAAwQQAIAgAAMIEACAKAADEBAAgCwAAxQQAIA8AAMYEACAQAADHBAAgFgAAzQUAIOwBAQDBAwAh8QFAAMMDACGRAkAAwwMAIZICAQDBAwAhmQIgANADACHYAgEAwQMAIdkCIADQAwAh2gIBAM4DACHcAgAAvwTcAiLdAiAA0AMAId4CAQDOAwAhEgQAAMAEACAHAADBBAAgCAAAwgQAIAoAAMQEACALAADFBAAgDwAAxgQAIBAAAMcEACDsAQEAwQMAIfEBQADDAwAhkQJAAMMDACGSAgEAwQMAIZkCIADQAwAh2AIBAMEDACHZAiAA0AMAIdoCAQDOAwAh3AIAAL8E3AIi3QIgANADACHeAgEAzgMAIQ_sAQEAAAAB7gECAAAAAfEBQAAAAAGDAgEAAAABhQIBAAAAAYcCAAAAhwICiQIAAACJAgKKAgEAAAABiwIBAAAAAYwCAgAAAAGNAoAAAAABjgKAAAAAAY8CAQAAAAGQAiAAAAABkQJAAAAAAQzsAQEAAAAB8QFAAAAAAZECQAAAAAGSAgEAAAABkwIBAAAAAZQCAQAAAAGVAgEAAAABlgIBAAAAAZgCAAAAmAICmQIgAAAAAZoCIAAAAAGbAgEAAAABAgAAAJcCACAdAADPBQAgEgQAAI0FACAHAACOBQAgCAAAjwUAIAkAAJAFACAKAACRBQAgDwAAkwUAIBAAAJQFACDsAQEAAAAB8QFAAAAAAZECQAAAAAGSAgEAAAABmQIgAAAAAdgCAQAAAAHZAiAAAAAB2gIBAAAAAdwCAAAA3AIC3QIgAAAAAd4CAQAAAAECAAAAAQAgHQAA0QUAIAXsAQEAAAAB7gECAAAAAe8BgAAAAAHwAQEAAAAB8QFAAAAAAQMAAACaAgAgHQAAzwUAIB4AANYFACAOAAAAmgIAIBYAANYFACDsAQEAwQMAIfEBQADDAwAhkQJAAMMDACGSAgEAwQMAIZMCAQDOAwAhlAIBAMEDACGVAgEAwQMAIZYCAQDBAwAhmAIAAOYDmAIimQIgANADACGaAiAA0AMAIZsCAQDBAwAhDOwBAQDBAwAh8QFAAMMDACGRAkAAwwMAIZICAQDBAwAhkwIBAM4DACGUAgEAwQMAIZUCAQDBAwAhlgIBAMEDACGYAgAA5gOYAiKZAiAA0AMAIZoCIADQAwAhmwIBAMEDACEDAAAALQAgHQAA0QUAIB4AANkFACAUAAAALQAgBAAAwAQAIAcAAMEEACAIAADCBAAgCQAAwwQAIAoAAMQEACAPAADGBAAgEAAAxwQAIBYAANkFACDsAQEAwQMAIfEBQADDAwAhkQJAAMMDACGSAgEAwQMAIZkCIADQAwAh2AIBAMEDACHZAiAA0AMAIdoCAQDOAwAh3AIAAL8E3AIi3QIgANADACHeAgEAzgMAIRIEAADABAAgBwAAwQQAIAgAAMIEACAJAADDBAAgCgAAxAQAIA8AAMYEACAQAADHBAAg7AEBAMEDACHxAUAAwwMAIZECQADDAwAhkgIBAMEDACGZAiAA0AMAIdgCAQDBAwAh2QIgANADACHaAgEAzgMAIdwCAAC_BNwCIt0CIADQAwAh3gIBAM4DACESAwAA4AMAIAwAAOEDACDsAQEAAAAB7gECAAAAAfEBQAAAAAGDAgEAAAABhAIBAAAAAYUCAQAAAAGHAgAAAIcCAokCAAAAiQICigIBAAAAAYsCAQAAAAGMAgIAAAABjQKAAAAAAY4CgAAAAAGPAgEAAAABkAIgAAAAAZECQAAAAAECAAAAGAAgHQAA2gUAIAMAAAAWACAdAADaBQAgHgAA3gUAIBQAAAAWACADAADRAwAgDAAA0gMAIBYAAN4FACDsAQEAwQMAIe4BAgDCAwAh8QFAAMMDACGDAgEAwQMAIYQCAQDBAwAhhQIBAMEDACGHAgAAzAOHAiKJAgAAzQOJAiKKAgEAzgMAIYsCAQDOAwAhjAICAM8DACGNAoAAAAABjgKAAAAAAY8CAQDOAwAhkAIgANADACGRAkAAwwMAIRIDAADRAwAgDAAA0gMAIOwBAQDBAwAh7gECAMIDACHxAUAAwwMAIYMCAQDBAwAhhAIBAMEDACGFAgEAwQMAIYcCAADMA4cCIokCAADNA4kCIooCAQDOAwAhiwIBAM4DACGMAgIAzwMAIY0CgAAAAAGOAoAAAAABjwIBAM4DACGQAiAA0AMAIZECQADDAwAhCQQGAgUADwcOBQgQBgkSBwoVAwsZCA8kDRAmDgIDAAEGCAMDAwABBAkCBQAEAQQKAAEDAAEBAwABAQMAAQQDAAEFAAwMAAkOHwsCBQAKCxoIAQsbAAENAAgBDiAAAQMAAQEDAAEFBCcABygACikACyoADysAAAAAAwUAFCMAFSQAFgAAAAMFABQjABUkABYCAwABBk0DAgMAAQZTAwMFABsjABwkAB0AAAADBQAbIwAcJAAdAQMAAQEDAAEDBQAiIwAjJAAkAAAAAwUAIiMAIyQAJAAAAAMFACojACskACwAAAADBQAqIwArJAAsAAAAAwUAMiMAMyQANAAAAAMFADIjADMkADQBAwABAQMAAQUFADkjADwkAD11ADp2ADsAAAAAAAUFADkjADwkAD11ADp2ADsBAwABAQMAAQMFAEIjAEMkAEQAAAADBQBCIwBDJABEAQMAAQEDAAEDBQBJIwBKJABLAAAAAwUASSMASiQASwEDAAEBAwABBQUAUCMAUyQAVHUAUXYAUgAAAAAABQUAUCMAUyQAVHUAUXYAUgEDAAEBAwABAwUAWSMAWiQAWwAAAAMFAFkjAFokAFsAAAMFAGAjAGEkAGIAAAADBQBgIwBhJABiAgMAAQwACQIDAAEMAAkFBQBnIwBqJABrdQBodgBpAAAAAAAFBQBnIwBqJABrdQBodgBpAQ0ACAENAAgFBQBwIwBzJAB0dQBxdgByAAAAAAAFBQBwIwBzJAB0dQBxdgByEQIBEiwBEy8BFDABFTEBFzMBGDUQGTYRGjgBGzoQHDsSHzwBID0BIT4QJUETJkIXJ0MCKEQCKUUCKkYCK0cCLEkCLUsQLkwYL08CMFEQMVIZMlQCM1UCNFYQNVkaNloeN1sFOFwFOV0FOl4FO18FPGEFPWMQPmQfP2YFQGgQQWkgQmoFQ2sFRGwQRW8hRnAlR3ImSHMmSXYmSncmS3gmTHomTXwQTn0nT38mUIEBEFGCAShSgwEmU4QBJlSFARBViAEpVokBLVeLAS5YjAEuWY8BLlqQAS5bkQEuXJMBLl2VARBelgEvX5gBLmCaARBhmwEwYpwBLmOdAS5kngEQZaEBMWaiATVnpAEOaKUBDmmnAQ5qqAEOa6kBDmyrAQ5trQEQbq4BNm-wAQ5wsgEQcbMBN3K0AQ5ztQEOdLYBEHe5ATh4ugE-ebsBDXq8AQ17vQENfL4BDX2_AQ1-wQENf8MBEIABxAE_gQHGAQ2CAcgBEIMByQFAhAHKAQ2FAcsBDYYBzAEQhwHPAUGIAdABRYkB0QEDigHSAQOLAdMBA4wB1AEDjQHVAQOOAdcBA48B2QEQkAHaAUaRAdwBA5IB3gEQkwHfAUeUAeABA5UB4QEDlgHiARCXAeUBSJgB5gFMmQHoAQaaAekBBpsB6wEGnAHsAQadAe0BBp4B7wEGnwHxARCgAfIBTaEB9AEGogH2ARCjAfcBTqQB-AEGpQH5AQamAfoBEKcB_QFPqAH-AVWpAYACB6oBgQIHqwGDAgesAYQCB60BhQIHrgGHAgevAYkCELABigJWsQGMAgeyAY4CELMBjwJXtAGQAge1AZECB7YBkgIQtwGVAli4AZYCXLkBmAIJugGZAgm7AZwCCbwBnQIJvQGeAgm-AaACCb8BogIQwAGjAl3BAaUCCcIBpwIQwwGoAl7EAakCCcUBqgIJxgGrAhDHAa4CX8gBrwJjyQGwAgjKAbECCMsBsgIIzAGzAgjNAbQCCM4BtgIIzwG4AhDQAbkCZNEBuwII0gG9AhDTAb4CZdQBvwII1QHAAgjWAcECENcBxAJm2AHFAmzZAcYCC9oBxwIL2wHIAgvcAckCC90BygIL3gHMAgvfAc4CEOABzwJt4QHRAgviAdMCEOMB1AJu5AHVAgvlAdYCC-YB1wIQ5wHaAm_oAdsCdQ"
};
async function decodeBase64AsWasm(wasmBase64) {
  const { Buffer: Buffer2 } = await import("buffer");
  const wasmArray = Buffer2.from(wasmBase64, "base64");
  return new WebAssembly.Module(wasmArray);
}
config.compilerWasm = {
  getRuntime: async () => await import("@prisma/client/runtime/query_compiler_fast_bg.postgresql.mjs"),
  getQueryCompilerWasmModule: async () => {
    const { wasm } = await import("@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.mjs");
    return await decodeBase64AsWasm(wasm);
  },
  importName: "./query_compiler_fast_bg.js"
};
function getPrismaClientClass() {
  return runtime.getPrismaClient(config);
}

// prisma/generated/prisma/internal/prismaNamespace.ts
import * as runtime2 from "@prisma/client/runtime/client";
var getExtensionContext = runtime2.Extensions.getExtensionContext;
var NullTypes2 = {
  DbNull: runtime2.NullTypes.DbNull,
  JsonNull: runtime2.NullTypes.JsonNull,
  AnyNull: runtime2.NullTypes.AnyNull
};
var TransactionIsolationLevel = runtime2.makeStrictEnum({
  ReadUncommitted: "ReadUncommitted",
  ReadCommitted: "ReadCommitted",
  RepeatableRead: "RepeatableRead",
  Serializable: "Serializable"
});
var defineExtension = runtime2.Extensions.defineExtension;

// prisma/generated/prisma/client.ts
globalThis["__dirname"] = path.dirname(fileURLToPath(import.meta.url));
var PrismaClient = getPrismaClientClass();

// src/lib/prisma.ts
var connectionString = `${process.env.DATABASE_URL}`;
var adapter = new PrismaPg({ connectionString });
var prisma = new PrismaClient({ adapter });

// src/lib/auth.ts
var auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  }),
  emailAndPassword: {
    enabled: true
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60
      // 5 minutes
    }
  },
  advanced: {
    cookiePrefix: "better-auth",
    useSecureCookies: process.env.NODE_ENV === "production",
    crossSubDomainCookies: {
      enabled: false
    },
    disableCSRFCheck: true,
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      httpOnly: false
    }
  }
});

// src/index.ts
import { Router as Router6 } from "express";

// src/modules/auth/auth.router.ts
import { Router } from "express";

// src/modules/auth/auth.controller.ts
import status3 from "http-status";

// src/utils/catchAsync.ts
var catchAsync = (fn) => {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
};

// src/utils/sendResponse.ts
var sendResponse = (res, responseData) => {
  res.status(responseData.status).json({
    success: responseData.success,
    message: responseData.message,
    data: responseData.data,
    meta: responseData.meta
  });
};

// src/utils/jwt.ts
import jwt from "jsonwebtoken";
var createToken = (payload, secret, { expiresIn }) => {
  const token = jwt.sign(payload, secret, { expiresIn });
  return token;
};
var vefifyToken = (token, secret) => {
  try {
    const decoded = jwt.verify(token, secret);
    return {
      success: true,
      data: decoded
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
      error
    };
  }
};
var decodedToken = (token) => {
  const decodedToken2 = jwt.decode(token);
  return decodedToken2;
};
var jwtUtils = {
  createToken,
  vefifyToken,
  decodedToken
};

// src/config/env.ts
var import_dotenv = __toESM(require_main(), 1);
import status from "http-status";

// src/errorHelpers/AppError.ts
var AppError = class extends Error {
  statusCode;
  code;
  constructor(statusCode, message, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
};
var AppError_default = AppError;

// src/config/env.ts
import_dotenv.default.config();
var loadEnvVariables = () => {
  const requiredEnvVariables = [
    "NODE_ENV",
    "PORT",
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "ACCESS_TOKEN_SECRET",
    "REFRESH_TOKEN_SECRET",
    "ACCESS_TOKEN_EXPIRES_IN",
    "REFRESH_TOKEN_EXPIRES_IN",
    "BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN",
    "BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE",
    "FRONTEND_URL",
    "TOTP_ENCRYPTION_KEY",
    "OpenRouter_API_KEY",
    "EMAIL_SENDER_SMTP_USER",
    "EMAIL_SENDER_SMTP_PASS",
    "EMAIL_SENDER_SMTP_HOST",
    "EMAIL_SENDER_SMTP_PORT",
    "EMAIL_SENDER_SMTP_FROM",
    "REDIS_URL",
    "MINIO_ENDPOINT",
    "MINIO_PORT",
    "MINIO_ACCESS_KEY",
    "MINIO_SECRET_KEY",
    "MINIO_BUCKET",
    "MINIO_USE_SSL",
    "PUPPETEER_SERVICE_URL"
  ];
  requiredEnvVariables.forEach((variable) => {
    if (!process.env[variable]) {
      throw new AppError_default(
        status.INTERNAL_SERVER_ERROR,
        `Environment variable ${variable} is required but not set in .env file.`
      );
    }
  });
  return {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
    ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN,
    REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN,
    BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN: process.env.BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN,
    BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE: process.env.BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE,
    FRONTEND_URL: process.env.FRONTEND_URL,
    TOTP_ENCRYPTION_KEY: process.env.TOTP_ENCRYPTION_KEY,
    OpenRouter_API_KEY: process.env.OpenRouter_API_KEY,
    EMAIL_SENDER: {
      SMTP_USER: process.env.EMAIL_SENDER_SMTP_USER,
      SMTP_PASS: process.env.EMAIL_SENDER_SMTP_PASS,
      SMTP_HOST: process.env.EMAIL_SENDER_SMTP_HOST,
      SMTP_PORT: process.env.EMAIL_SENDER_SMTP_PORT,
      SMTP_FROM: process.env.EMAIL_SENDER_SMTP_FROM
    },
    REDIS: {
      REDIS_URL: process.env.REDIS_URL
    },
    MINIO: {
      MINIO_ENDPOINT: process.env.MINIO_ENDPOINT,
      MINIO_PORT: process.env.MINIO_PORT,
      MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY,
      MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY,
      MINIO_BUCKET: process.env.MINIO_BUCKET,
      MINIO_USE_SSL: process.env.MINIO_USE_SSL
    },
    PUPPETEER_SERVICE_URL: process.env.PUPPETEER_SERVICE_URL
  };
};
var envVars = loadEnvVariables();

// src/utils/cookie.ts
var isProd = envVars.NODE_ENV === "production";
var SESSION_COOKIE_NAME = "better-auth.session_token";
var SECURE_SESSION_COOKIE_NAME = "__Secure-better-auth.session_token";
var getBetterAuthSessionToken = (req) => {
  return req.cookies[SESSION_COOKIE_NAME] || req.cookies[SECURE_SESSION_COOKIE_NAME];
};
var betterAuthSessionCookieName = isProd ? SECURE_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME;
var setCookie = (res, key, value, options) => {
  res.cookie(key, value, options);
};
var getCookie = (req, key) => {
  return req.cookies[key];
};
var clearCookie = (res, key, options) => {
  res.clearCookie(key, options);
};
var cookieUtils = {
  setCookie,
  getCookie,
  clearCookie,
  getBetterAuthSessionToken,
  betterAuthSessionCookieName
};

// src/utils/token.ts
var isProd2 = envVars.NODE_ENV === "production";
var createAccessToken = (payload) => {
  const accessToken = jwtUtils.createToken(
    payload,
    envVars.ACCESS_TOKEN_SECRET,
    {
      expiresIn: envVars.ACCESS_TOKEN_EXPIRES_IN
    }
  );
  return accessToken;
};
var createRefreshToken = (payload) => {
  const refreshToken = jwtUtils.createToken(
    payload,
    envVars.REFRESH_TOKEN_SECRET,
    {
      expiresIn: envVars.REFRESH_TOKEN_EXPIRES_IN
    }
  );
  return refreshToken;
};
var setAccessTokenCookie = (res, token) => {
  cookieUtils.setCookie(res, "accessToken", token, {
    httpOnly: true,
    secure: isProd2,
    sameSite: isProd2 ? "none" : "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 1e3
    // 1 day
  });
};
var setRefreshTokenCookie = (res, token) => {
  cookieUtils.setCookie(res, "refreshToken", token, {
    httpOnly: true,
    secure: isProd2,
    sameSite: isProd2 ? "none" : "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7 * 1e3
    // 7 days
  });
};
var setBetterAuthSessionCookie = (res, token) => {
  cookieUtils.setCookie(res, cookieUtils.betterAuthSessionCookieName, token, {
    httpOnly: true,
    secure: isProd2,
    sameSite: isProd2 ? "none" : "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 1e3
    // 1 day
  });
};
var tokenUtils = {
  createAccessToken,
  createRefreshToken,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  setBetterAuthSessionCookie
};

// src/modules/auth/auth.service.ts
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { UAParser } from "ua-parser-js";
import status2 from "http-status";

// src/lib/redis.ts
import { Redis } from "ioredis";
var createRedisClient = () => {
  const client = new Redis(envVars.REDIS.REDIS_URL, {
    maxRetriesPerRequest: null,
    // Required for BullMQ
    enableReadyCheck: false,
    lazyConnect: true
  });
  client.on("connect", () => {
    console.log("[Redis] Connected successfully");
  });
  client.on("error", (err) => {
    console.error("[Redis] Connection error:", err.message);
  });
  client.on("reconnecting", () => {
    console.warn("[Redis] Reconnecting...");
  });
  return client;
};
var redis = createRedisClient();

// src/lib/mailer.ts
import nodemailer from "nodemailer";
var { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = envVars.EMAIL_SENDER;
var createTransporter = () => {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10),
    secure: false,
    // true for 465, false for 587/1025
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : void 0
  });
};
var mailer = createTransporter();
var baseTemplate = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>ProFile AI</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; margin: 0; padding: 20px; }
    .container { max-width: 520px; margin: 40px auto; background: #1a1a2e; border-radius: 16px; overflow: hidden; border: 1px solid #16213e; }
    .header { background: linear-gradient(135deg, #6C63FF 0%, #4ECDC4 100%); padding: 32px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 24px; letter-spacing: -0.5px; }
    .body { padding: 32px; color: #e0e0e0; }
    .otp-box { background: #0f3460; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }
    .otp-code { font-size: 40px; font-weight: 700; letter-spacing: 12px; color: #6C63FF; font-family: monospace; }
    .otp-timer { font-size: 13px; color: #9e9e9e; margin-top: 8px; }
    .footer { padding: 20px 32px; text-align: center; font-size: 12px; color: #555; border-top: 1px solid #16213e; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>ProFile AI</h1></div>
    <div class="body">${content}</div>
    <div class="footer">\xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} ProFile AI. All rights reserved.<br/>This email was sent automatically. Please do not reply.</div>
  </div>
</body>
</html>
`;
var OTP_SUBJECT_MAP = {
  EMAIL_VERIFY: "Verify Your Email \u2014 ProFile AI",
  FORGET_PASSWORD: "Password Reset Code \u2014 ProFile AI",
  RESET_PASSWORD: "Password Reset Code \u2014 ProFile AI",
  TWO_FACTOR: "Two-Factor Authentication Code \u2014 ProFile AI"
};
var OTP_TITLE_MAP = {
  EMAIL_VERIFY: "Verify Your Email Address",
  FORGET_PASSWORD: "Reset Your Password",
  RESET_PASSWORD: "Reset Your Password",
  TWO_FACTOR: "Two-Factor Authentication"
};
var OTP_DESC_MAP = {
  EMAIL_VERIFY: "Please use the code below to verify your email address and activate your ProFile AI account.",
  FORGET_PASSWORD: "We received a request to reset your password. Use the code below to proceed.",
  RESET_PASSWORD: "Use the code below to complete your password reset.",
  TWO_FACTOR: "Your two-factor authentication code for ProFile AI login:"
};
var sendOtpEmail = async ({
  to,
  otp,
  type,
  firstName
}) => {
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
  const content = `
    <p>${greeting}</p>
    <p>${OTP_DESC_MAP[type]}</p>
    <div class="otp-box">
      <div class="otp-code">${otp}</div>
      <div class="otp-timer">\u23F1 This code expires in 10 minutes</div>
    </div>
    <p style="font-size:13px; color:#9e9e9e;">If you did not request this, you can safely ignore this email. Your account remains secure.</p>
  `;
  await mailer.sendMail({
    from: SMTP_FROM,
    to,
    subject: OTP_SUBJECT_MAP[type],
    html: baseTemplate(`<h2 style="color:#fff;margin-bottom:8px;">${OTP_TITLE_MAP[type]}</h2>${content}`)
  });
};
var sendWelcomeEmail = async (to, firstName) => {
  const content = `
    <h2 style="color:#fff;">Welcome to ProFile AI, ${firstName}! \u{1F389}</h2>
    <p>Your account is now active. You can start building AI-powered, ATS-optimized resumes that stand out.</p>
    <p style="margin-top:24px;">
      <a href="${envVars.FRONTEND_URL}/dashboard"
         style="background:linear-gradient(135deg,#6C63FF,#4ECDC4);color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
        Go to Dashboard \u2192
      </a>
    </p>
  `;
  await mailer.sendMail({
    from: SMTP_FROM,
    to,
    subject: "Welcome to ProFile AI!",
    html: baseTemplate(content)
  });
};

// src/modules/auth/auth.service.ts
var OTP_TTL_MINUTES = 10;
var MAX_DEVICES = 3;
var OTP_RATE_LIMIT_KEY = (email, type) => `otp:rate:${type}:${email}`;
var OTP_RATE_LIMIT_MAX = 3;
var OTP_RATE_LIMIT_WINDOW = 60 * 60;
var generateOtp = () => {
  return crypto.randomInt(1e5, 999999).toString();
};
var hashOtp = async (otp) => {
  return bcrypt.hash(otp, 10);
};
var verifyOtp = async (otp, hash) => {
  return bcrypt.compare(otp, hash);
};
var checkOtpRateLimit = async (email, type) => {
  const key = OTP_RATE_LIMIT_KEY(email, type);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, OTP_RATE_LIMIT_WINDOW);
  }
  if (count > OTP_RATE_LIMIT_MAX) {
    throw new AppError_default(
      status2.TOO_MANY_REQUESTS,
      `Too many OTP requests. Please wait before requesting another OTP.`
    );
  }
};
var saveOtp = async (userId, otp, type) => {
  await prisma.otpCode.updateMany({
    where: { userId, type, used: false },
    data: { used: true }
  });
  const codeHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1e3);
  await prisma.otpCode.create({
    data: { userId, codeHash, type, expiresAt }
  });
};
var consumeOtp = async (userId, otp, type) => {
  const otpRecord = await prisma.otpCode.findFirst({
    where: { userId, type, used: false },
    orderBy: { createdAt: "desc" }
  });
  if (!otpRecord) {
    throw new AppError_default(status2.BAD_REQUEST, "Invalid or expired OTP.");
  }
  if (/* @__PURE__ */ new Date() > otpRecord.expiresAt) {
    throw new AppError_default(status2.BAD_REQUEST, "OTP has expired. Please request a new one.");
  }
  const isValid = await verifyOtp(otp, otpRecord.codeHash);
  if (!isValid) {
    throw new AppError_default(status2.BAD_REQUEST, "Invalid OTP. Please try again.");
  }
  await prisma.otpCode.update({
    where: { id: otpRecord.id },
    data: { used: true }
  });
};
var parseDevice = (userAgent, ipAddress) => {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();
  const browser = result.browser.name || "Unknown Browser";
  const os = result.os.name || "Unknown OS";
  const deviceType = result.device.type === "mobile" ? "mobile" : result.device.type === "tablet" ? "tablet" : "desktop";
  const deviceName = `${browser} on ${os}`;
  const fingerprint = crypto.createHash("sha256").update(`${browser}:${os}:${userAgent.substring(0, 100)}`).digest("hex");
  return { browser, os, deviceType, deviceName, fingerprint, ipAddress };
};
var registerDevice = async (userId, userAgent, ipAddress) => {
  const deviceInfo = parseDevice(userAgent, ipAddress);
  const existing = await prisma.loginDevice.findFirst({
    where: { userId, fingerprint: deviceInfo.fingerprint }
  });
  if (existing) {
    await prisma.loginDevice.update({
      where: { id: existing.id },
      data: { lastSeenAt: /* @__PURE__ */ new Date(), ipAddress }
    });
    return existing.id;
  }
  const deviceCount = await prisma.loginDevice.count({ where: { userId } });
  if (deviceCount >= MAX_DEVICES) {
    throw new AppError_default(
      status2.FORBIDDEN,
      "Device limit reached. Please revoke a device from your Profile \u2192 Devices tab.",
      "DEVICE_LIMIT_REACHED"
    );
  }
  const device = await prisma.loginDevice.create({
    data: {
      userId,
      deviceName: deviceInfo.deviceName,
      deviceType: deviceInfo.deviceType,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      ipAddress: deviceInfo.ipAddress,
      userAgent,
      fingerprint: deviceInfo.fingerprint,
      isTrusted: false
    }
  });
  return device.id;
};
var registerUser = async (data) => {
  const { firstName, lastName, email, password } = data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError_default(status2.CONFLICT, "An account with this email already exists.");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = crypto.randomUUID();
  const user = await prisma.user.create({
    data: {
      id: userId,
      name: `${firstName} ${lastName}`,
      email,
      emailVerified: false,
      role: "USER",
      isActive: true,
      twoFactorEnabled: false,
      accounts: {
        create: {
          id: crypto.randomUUID(),
          accountId: userId,
          providerId: "credential",
          password: passwordHash
        }
      },
      profile: {
        create: {
          firstName,
          lastName,
          education: [],
          experience: [],
          skills: [],
          languages: []
        }
      },
      limits: {
        create: {
          resumeLimit: 5,
          apiLimit: 50,
          resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3)
        }
      }
    }
  });
  const otp = generateOtp();
  await saveOtp(user.id, otp, "EMAIL_VERIFY");
  await sendOtpEmail({ to: email, otp, type: "EMAIL_VERIFY", firstName });
  return { userId: user.id, email: user.email };
};
var verifyEmail = async (data) => {
  const { email, otp } = data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError_default(status2.NOT_FOUND, "No account found with this email.");
  if (user.emailVerified) throw new AppError_default(status2.BAD_REQUEST, "Email is already verified.");
  await consumeOtp(user.id, otp, "EMAIL_VERIFY");
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true }
  });
  await sendWelcomeEmail(email, user.name.split(" ")[0]);
  return { message: "Email verified successfully." };
};
var loginUser = async (data, req) => {
  const { email, password } = data;
  const user = await prisma.user.findUnique({
    where: { email },
    include: { accounts: true }
  });
  if (!user) throw new AppError_default(status2.UNAUTHORIZED, "Invalid email or password.");
  if (!user.isActive) throw new AppError_default(status2.FORBIDDEN, "Your account has been deactivated.");
  if (!user.emailVerified) {
    throw new AppError_default(
      status2.UNAUTHORIZED,
      "Please verify your email before logging in.",
      "EMAIL_NOT_VERIFIED"
    );
  }
  const credentialAccount = user.accounts.find((a) => a.providerId === "credential");
  if (!credentialAccount?.password) {
    throw new AppError_default(status2.UNAUTHORIZED, "Invalid email or password.");
  }
  const isPasswordValid = await bcrypt.compare(password, credentialAccount.password);
  if (!isPasswordValid) throw new AppError_default(status2.UNAUTHORIZED, "Invalid email or password.");
  if (user.twoFactorEnabled) {
    const otp = generateOtp();
    await checkOtpRateLimit(email, "TWO_FACTOR");
    await saveOtp(user.id, otp, "TWO_FACTOR");
    await sendOtpEmail({ to: email, otp, type: "TWO_FACTOR", firstName: user.name.split(" ")[0] });
    return { twoFactorRequired: true, email };
  }
  const userAgent = req.headers["user-agent"] || "Unknown";
  const ipAddress = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip || "";
  const deviceId = await registerDevice(user.id, userAgent, ipAddress);
  const accessToken = tokenUtils.createAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email
  });
  const refreshToken = tokenUtils.createRefreshToken({ userId: user.id });
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
  await prisma.session.create({
    data: {
      id: sessionId,
      token: accessToken,
      userId: user.id,
      deviceId,
      expiresAt,
      ipAddress,
      userAgent
    }
  });
  return {
    twoFactorRequired: false,
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  };
};
var verifyTwoFactor = async (data, req) => {
  const { email, otp } = data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError_default(status2.NOT_FOUND, "No account found with this email.");
  await consumeOtp(user.id, otp, "TWO_FACTOR");
  const userAgent = req.headers["user-agent"] || "Unknown";
  const ipAddress = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip || "";
  const deviceId = await registerDevice(user.id, userAgent, ipAddress);
  const accessToken = tokenUtils.createAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email
  });
  const refreshToken = tokenUtils.createRefreshToken({ userId: user.id });
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
  await prisma.session.create({
    data: {
      id: sessionId,
      token: accessToken,
      userId: user.id,
      deviceId,
      expiresAt,
      ipAddress,
      userAgent
    }
  });
  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  };
};
var forgotPassword = async (email) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { message: "If an account with this email exists, an OTP has been sent." };
  }
  await checkOtpRateLimit(email, "FORGET_PASSWORD");
  const otp = generateOtp();
  await saveOtp(user.id, otp, "FORGET_PASSWORD");
  await sendOtpEmail({
    to: email,
    otp,
    type: "FORGET_PASSWORD",
    firstName: user.name.split(" ")[0]
  });
  return { message: "If an account with this email exists, an OTP has been sent." };
};
var resetPassword = async (data) => {
  const { email, otp, newPassword } = data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError_default(status2.NOT_FOUND, "No account found with this email.");
  await consumeOtp(user.id, otp, "FORGET_PASSWORD");
  const newPasswordHash = await bcrypt.hash(newPassword, 12);
  await prisma.account.updateMany({
    where: { userId: user.id, providerId: "credential" },
    data: { password: newPasswordHash }
  });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  return { message: "Password reset successfully. Please log in with your new password." };
};
var logoutUser = async (token, userId) => {
  await prisma.session.deleteMany({ where: { userId, token } });
  return { message: "Logged out successfully." };
};
var resendOtp = async (email, type) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { message: "If an account with this email exists, an OTP has been sent." };
  }
  await checkOtpRateLimit(email, type);
  const otp = generateOtp();
  await saveOtp(user.id, otp, type);
  await sendOtpEmail({ to: email, otp, type, firstName: user.name.split(" ")[0] });
  return { message: "OTP sent successfully." };
};
var enable2FA = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError_default(status2.NOT_FOUND, "User not found.");
  if (user.twoFactorEnabled) throw new AppError_default(status2.BAD_REQUEST, "2FA is already enabled.");
  const otp = generateOtp();
  await saveOtp(userId, otp, "TWO_FACTOR");
  await sendOtpEmail({ to: user.email, otp, type: "TWO_FACTOR", firstName: user.name.split(" ")[0] });
  return { message: "An OTP has been sent to your email to confirm 2FA activation." };
};
var confirm2FA = async (userId, otp) => {
  await consumeOtp(userId, otp, "TWO_FACTOR");
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true }
  });
  return { message: "Two-factor authentication has been enabled." };
};
var disable2FA = async (userId, otp) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError_default(status2.NOT_FOUND, "User not found.");
  if (!user.twoFactorEnabled) throw new AppError_default(status2.BAD_REQUEST, "2FA is not enabled.");
  await consumeOtp(userId, otp, "TWO_FACTOR");
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null }
  });
  return { message: "Two-factor authentication has been disabled." };
};

// src/modules/auth/auth.controller.ts
var register = catchAsync(async (req, res) => {
  const result = await registerUser(req.body);
  sendResponse(res, {
    status: status3.CREATED,
    success: true,
    message: "Account created. Please check your email for the verification OTP.",
    data: result
  });
});
var verifyEmail2 = catchAsync(async (req, res) => {
  const result = await verifyEmail(req.body);
  sendResponse(res, {
    status: status3.OK,
    success: true,
    message: result.message,
    data: null
  });
});
var login = catchAsync(async (req, res) => {
  const result = await loginUser(req.body, req);
  if (result.twoFactorRequired) {
    return sendResponse(res, {
      status: status3.OK,
      success: true,
      message: "2FA required. OTP sent to your email.",
      data: { twoFactorRequired: true, email: result.email }
    });
  }
  if (result.accessToken) tokenUtils.setAccessTokenCookie(res, result.accessToken);
  if (result.refreshToken) tokenUtils.setRefreshTokenCookie(res, result.refreshToken);
  sendResponse(res, {
    status: status3.OK,
    success: true,
    message: "Login successful.",
    data: { user: result.user, accessToken: result.accessToken }
  });
});
var verifyTwoFactor2 = catchAsync(async (req, res) => {
  const result = await verifyTwoFactor(req.body, req);
  tokenUtils.setAccessTokenCookie(res, result.accessToken);
  tokenUtils.setRefreshTokenCookie(res, result.refreshToken);
  sendResponse(res, {
    status: status3.OK,
    success: true,
    message: "2FA verification successful.",
    data: { user: result.user, accessToken: result.accessToken }
  });
});
var forgotPassword2 = catchAsync(async (req, res) => {
  const result = await forgotPassword(req.body.email);
  sendResponse(res, {
    status: status3.OK,
    success: true,
    message: result.message,
    data: null
  });
});
var resetPassword2 = catchAsync(async (req, res) => {
  const result = await resetPassword(req.body);
  sendResponse(res, {
    status: status3.OK,
    success: true,
    message: result.message,
    data: null
  });
});
var logout = catchAsync(async (req, res) => {
  const token = req.cookies?.accessToken || req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    await logoutUser(token, req.user.userId);
  }
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");
  sendResponse(res, {
    status: status3.OK,
    success: true,
    message: "Logged out successfully.",
    data: null
  });
});
var resendOtp2 = catchAsync(async (req, res) => {
  const { email, type } = req.body;
  const result = await resendOtp(email, type);
  sendResponse(res, {
    status: status3.OK,
    success: true,
    message: result.message,
    data: null
  });
});
var enable2FA2 = catchAsync(async (req, res) => {
  const result = await enable2FA(req.user.userId);
  sendResponse(res, {
    status: status3.OK,
    success: true,
    message: result.message,
    data: null
  });
});
var confirm2FA2 = catchAsync(async (req, res) => {
  const result = await confirm2FA(req.user.userId, req.body.otp);
  sendResponse(res, {
    status: status3.OK,
    success: true,
    message: result.message,
    data: null
  });
});
var disable2FA2 = catchAsync(async (req, res) => {
  const result = await disable2FA(req.user.userId, req.body.otp);
  sendResponse(res, {
    status: status3.OK,
    success: true,
    message: result.message,
    data: null
  });
});

// src/middleware/validateRequest.ts
import { ZodError } from "zod";
var validateRequest = (schema) => async (req, _res, next) => {
  try {
    const parsed = await schema.parseAsync({
      body: req.body,
      cookies: req.cookies,
      params: req.params,
      query: req.query
    });
    req.body = parsed.body ?? req.body;
    req.cookies = parsed.cookies ?? req.cookies;
    req.params = parsed.params ?? req.params;
    req.query = parsed.query ?? req.query;
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues[0]?.message ?? "Validation failed.";
      next(new AppError_default(400, message, "VALIDATION_ERROR"));
      return;
    }
    next(error);
  }
};

// src/middleware/checkAuth.ts
import status4 from "http-status";
var checkAuth = (...authRoles) => async (req, res, next) => {
  try {
    const accessToken = cookieUtils.getCookie(req, "accessToken") || req.headers.authorization?.replace("Bearer ", "");
    if (!accessToken) {
      throw new AppError_default(status4.UNAUTHORIZED, "Unauthorized. Please log in to continue.");
    }
    const verifiedToken = jwtUtils.vefifyToken(accessToken, envVars.ACCESS_TOKEN_SECRET);
    if (!verifiedToken.success || !verifiedToken.data) {
      throw new AppError_default(status4.UNAUTHORIZED, "Unauthorized. Access token is invalid or expired.");
    }
    const { userId } = verifiedToken.data;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true, isActive: true }
    });
    if (!user) {
      throw new AppError_default(status4.UNAUTHORIZED, "Unauthorized. User account not found.");
    }
    if (!user.isActive) {
      throw new AppError_default(status4.FORBIDDEN, "Your account has been deactivated. Please contact support.");
    }
    if (authRoles.length > 0 && !authRoles.includes(user.role)) {
      throw new AppError_default(
        status4.FORBIDDEN,
        `Forbidden. This resource requires one of: [${authRoles.join(", ")}].`
      );
    }
    req.user = {
      userId: user.id,
      role: user.role,
      email: user.email
    };
    next();
  } catch (error) {
    next(error);
  }
};

// src/modules/auth/auth.schema.ts
import { z } from "zod";
var registerSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, "First name is required").max(50),
    lastName: z.string().min(1, "Last name is required").max(50),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters").regex(/[A-Z]/, "Password must contain at least one uppercase letter").regex(/[0-9]/, "Password must contain at least one number").regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
    confirmPassword: z.string()
  }).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  })
});
var verifyEmailSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    otp: z.string().length(6, "OTP must be exactly 6 digits").regex(/^\d{6}$/, "OTP must be numeric")
  })
});
var loginSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required")
  })
});
var twoFactorVerifySchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    otp: z.string().length(6, "OTP must be exactly 6 digits").regex(/^\d{6}$/, "OTP must be numeric")
  })
});
var forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address")
  })
});
var resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    otp: z.string().length(6, "OTP must be exactly 6 digits").regex(/^\d{6}$/, "OTP must be numeric"),
    newPassword: z.string().min(8, "Password must be at least 8 characters").regex(/[A-Z]/, "Password must contain at least one uppercase letter").regex(/[0-9]/, "Password must contain at least one number").regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
    confirmPassword: z.string()
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  })
});
var resendOtpSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    type: z.enum(["EMAIL_VERIFY", "FORGET_PASSWORD", "TWO_FACTOR"])
  })
});
var confirm2FASchema = z.object({
  body: z.object({
    otp: z.string().length(6, "OTP must be exactly 6 digits").regex(/^\d{6}$/, "OTP must be numeric")
  })
});
var disable2FASchema = z.object({
  body: z.object({
    otp: z.string().length(6, "OTP must be exactly 6 digits").regex(/^\d{6}$/, "OTP must be numeric")
  })
});

// src/modules/auth/auth.router.ts
var router = Router();
router.post("/register", validateRequest(registerSchema), register);
router.post("/verify-email", validateRequest(verifyEmailSchema), verifyEmail2);
router.post("/login", validateRequest(loginSchema), login);
router.post("/2fa/verify", validateRequest(twoFactorVerifySchema), verifyTwoFactor2);
router.post("/forgot-password", validateRequest(forgotPasswordSchema), forgotPassword2);
router.post("/reset-password", validateRequest(resetPasswordSchema), resetPassword2);
router.post("/otp/resend", validateRequest(resendOtpSchema), resendOtp2);
router.post("/logout", checkAuth(), logout);
router.post("/2fa/enable", checkAuth(), enable2FA2);
router.post("/2fa/confirm", checkAuth(), validateRequest(confirm2FASchema), confirm2FA2);
router.post("/2fa/disable", checkAuth(), validateRequest(disable2FASchema), disable2FA2);
var authRouter = router;

// src/modules/user/user.router.ts
import { Router as Router2 } from "express";
import multer from "multer";

// src/modules/user/user.controller.ts
import status6 from "http-status";

// src/modules/user/user.service.ts
import bcrypt2 from "bcryptjs";
import status5 from "http-status";

// src/lib/minio.ts
import * as Minio from "minio";
var { MINIO_ENDPOINT, MINIO_PORT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_USE_SSL } = envVars.MINIO;
var minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: parseInt(MINIO_PORT, 10),
  useSSL: MINIO_USE_SSL === "true",
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY
});
var BUCKET_NAME = envVars.MINIO.MINIO_BUCKET;
var ensureBucketExists = async () => {
  const exists = await minioClient.bucketExists(BUCKET_NAME);
  if (!exists) {
    await minioClient.makeBucket(BUCKET_NAME, "us-east-1");
    console.log(`[MinIO] Bucket "${BUCKET_NAME}" created.`);
  } else {
    console.log(`[MinIO] Bucket "${BUCKET_NAME}" already exists.`);
  }
};
var uploadBuffer = async (objectName, buffer, contentType) => {
  await minioClient.putObject(BUCKET_NAME, objectName, buffer, buffer.length, {
    "Content-Type": contentType
  });
  return objectName;
};
var uploadStream = async (objectName, stream, size, contentType) => {
  await minioClient.putObject(BUCKET_NAME, objectName, stream, size, {
    "Content-Type": contentType
  });
  return objectName;
};
var getPresignedUrl = async (objectName, ttlSeconds = 900) => {
  return minioClient.presignedGetObject(BUCKET_NAME, objectName, ttlSeconds);
};

// src/modules/user/user.service.ts
import { Readable } from "stream";
var getProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      role: true,
      twoFactorEnabled: true,
      createdAt: true,
      profile: true,
      limits: true
    }
  });
  if (!user) throw new AppError_default(status5.NOT_FOUND, "User not found.");
  const profile = user.profile;
  const completionFields = [
    profile?.firstName,
    profile?.lastName,
    profile?.phone,
    profile?.headline,
    profile?.bio,
    profile?.location,
    profile?.website,
    profile?.linkedIn,
    profile?.avatarUrl,
    profile?.skills?.length ? true : null,
    Array.isArray(profile?.education) && profile.education.length > 0 ? true : null,
    Array.isArray(profile?.experience) && profile.experience.length > 0 ? true : null
  ];
  const completedCount = completionFields.filter(Boolean).length;
  const completionPercentage = Math.round(completedCount / completionFields.length * 100);
  return { ...user, completionPercentage };
};
var updateProfile = async (userId, data) => {
  const { firstName, lastName, ...rest } = data;
  const updateData = { ...rest };
  if (firstName || lastName) {
    const current = await prisma.userProfile.findUnique({ where: { userId } });
    updateData.firstName = firstName || current?.firstName;
    updateData.lastName = lastName || current?.lastName;
  }
  const profile = await prisma.userProfile.upsert({
    where: { userId },
    update: updateData,
    create: {
      userId,
      firstName: firstName || "",
      lastName: lastName || "",
      education: [],
      experience: [],
      skills: [],
      languages: [],
      ...rest
    }
  });
  if (firstName || lastName) {
    await prisma.user.update({
      where: { id: userId },
      data: { name: `${profile.firstName} ${profile.lastName}` }
    });
  }
  return profile;
};
var uploadAvatar = async (userId, buffer, mimetype, originalname) => {
  const ext = originalname.split(".").pop() || "jpg";
  const objectName = `avatars/${userId}/avatar.${ext}`;
  const readable = Readable.from(buffer);
  await uploadStream(objectName, readable, buffer.length, mimetype);
  const presignedUrl = await getPresignedUrl(objectName, 7 * 24 * 3600);
  await prisma.userProfile.upsert({
    where: { userId },
    update: { avatarUrl: presignedUrl },
    create: {
      userId,
      firstName: "",
      lastName: "",
      education: [],
      experience: [],
      skills: [],
      languages: [],
      avatarUrl: presignedUrl
    }
  });
  return presignedUrl;
};
var changePassword = async (userId, data) => {
  const { currentPassword, newPassword } = data;
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "credential" }
  });
  if (!account?.password) {
    throw new AppError_default(status5.BAD_REQUEST, "No password set for this account.");
  }
  const isValid = await bcrypt2.compare(currentPassword, account.password);
  if (!isValid) throw new AppError_default(status5.UNAUTHORIZED, "Current password is incorrect.");
  const newHash = await bcrypt2.hash(newPassword, 12);
  await prisma.account.update({
    where: { id: account.id },
    data: { password: newHash }
  });
  return { message: "Password changed successfully." };
};
var getDevices = async (userId, currentSessionToken) => {
  const devices = await prisma.loginDevice.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    include: {
      sessions: {
        where: { token: currentSessionToken },
        select: { id: true }
      }
    }
  });
  return devices.map((d) => ({
    id: d.id,
    deviceName: d.deviceName,
    deviceType: d.deviceType,
    browser: d.browser,
    os: d.os,
    ipAddress: d.ipAddress,
    lastSeenAt: d.lastSeenAt,
    isTrusted: d.isTrusted,
    isCurrentDevice: d.sessions.length > 0
  }));
};
var revokeDevice = async (userId, deviceId) => {
  const device = await prisma.loginDevice.findFirst({
    where: { id: deviceId, userId }
  });
  if (!device) throw new AppError_default(status5.NOT_FOUND, "Device not found.");
  await prisma.session.deleteMany({ where: { deviceId } });
  await prisma.loginDevice.delete({ where: { id: deviceId } });
  return { message: "Device revoked successfully." };
};
var getUserLimits = async (userId) => {
  const limits = await prisma.userLimit.findUnique({ where: { userId } });
  if (!limits) throw new AppError_default(status5.NOT_FOUND, "User limits not found.");
  return limits;
};

// src/modules/user/user.controller.ts
var getProfile2 = catchAsync(async (req, res) => {
  const data = await getProfile(req.user.userId);
  sendResponse(res, { status: status6.OK, success: true, message: "Profile retrieved.", data });
});
var updateProfile2 = catchAsync(async (req, res) => {
  const data = await updateProfile(req.user.userId, req.body);
  sendResponse(res, { status: status6.OK, success: true, message: "Profile updated.", data });
});
var uploadAvatar2 = catchAsync(async (req, res) => {
  if (!req.file) {
    return sendResponse(res, {
      status: status6.BAD_REQUEST,
      success: false,
      message: "No file uploaded.",
      data: null
    });
  }
  const url = await uploadAvatar(
    req.user.userId,
    req.file.buffer,
    req.file.mimetype,
    req.file.originalname
  );
  sendResponse(res, { status: status6.OK, success: true, message: "Avatar uploaded.", data: { avatarUrl: url } });
});
var changePassword2 = catchAsync(async (req, res) => {
  const result = await changePassword(req.user.userId, req.body);
  sendResponse(res, { status: status6.OK, success: true, message: result.message, data: null });
});
var getDevices2 = catchAsync(async (req, res) => {
  const token = req.cookies?.accessToken || "";
  const data = await getDevices(req.user.userId, token);
  sendResponse(res, { status: status6.OK, success: true, message: "Devices retrieved.", data });
});
var revokeDevice2 = catchAsync(async (req, res) => {
  const result = await revokeDevice(req.user.userId, req.params.id);
  sendResponse(res, { status: status6.OK, success: true, message: result.message, data: null });
});
var getLimits = catchAsync(async (req, res) => {
  const data = await getUserLimits(req.user.userId);
  sendResponse(res, { status: status6.OK, success: true, message: "Limits retrieved.", data });
});

// src/modules/user/user.schema.ts
import { z as z2 } from "zod";
var updateProfileSchema = z2.object({
  body: z2.object({
    firstName: z2.string().min(1).max(50).optional(),
    lastName: z2.string().min(1).max(50).optional(),
    phone: z2.string().max(20).optional(),
    headline: z2.string().max(100).optional(),
    bio: z2.string().max(500).optional(),
    location: z2.string().max(100).optional(),
    website: z2.string().url("Invalid URL").optional().or(z2.literal("")),
    linkedIn: z2.string().url("Invalid LinkedIn URL").optional().or(z2.literal("")),
    github: z2.string().url("Invalid GitHub URL").optional().or(z2.literal("")),
    skills: z2.array(z2.string()).optional(),
    languages: z2.array(z2.string()).optional(),
    education: z2.array(z2.object({
      school: z2.string(),
      degree: z2.string(),
      field: z2.string(),
      from: z2.string(),
      to: z2.string().optional(),
      gpa: z2.string().optional()
    })).optional(),
    experience: z2.array(z2.object({
      company: z2.string(),
      role: z2.string(),
      from: z2.string(),
      to: z2.string().optional(),
      current: z2.boolean().optional(),
      desc: z2.string().optional()
    })).optional(),
    certifications: z2.array(z2.object({
      name: z2.string(),
      issuer: z2.string(),
      year: z2.string().optional(),
      url: z2.string().url().optional().or(z2.literal(""))
    })).optional()
  })
});
var changePasswordSchema = z2.object({
  body: z2.object({
    currentPassword: z2.string().min(1, "Current password is required"),
    newPassword: z2.string().min(8, "Password must be at least 8 characters").regex(/[A-Z]/, "Must contain an uppercase letter").regex(/[0-9]/, "Must contain a number").regex(/[^A-Za-z0-9]/, "Must contain a special character"),
    confirmPassword: z2.string()
  }).refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  })
});

// src/modules/user/user.router.ts
var router2 = Router2();
var upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router2.use(checkAuth());
router2.get("/profile", getProfile2);
router2.put("/profile", validateRequest(updateProfileSchema), updateProfile2);
router2.post("/avatar", upload.single("avatar"), uploadAvatar2);
router2.put("/change-password", validateRequest(changePasswordSchema), changePassword2);
router2.get("/devices", getDevices2);
router2.delete("/devices/:id", revokeDevice2);
router2.get("/limits", getLimits);
var userRouter = router2;

// src/modules/template/template.router.ts
import { Router as Router3 } from "express";
import multer2 from "multer";

// src/modules/template/template.controller.ts
import status8 from "http-status";

// src/modules/template/template.service.ts
import status7 from "http-status";
import { Readable as Readable2 } from "stream";
var SAMPLE_RESUME_DATA = {
  firstName: "Alex",
  lastName: "Johnson",
  email: "alex.johnson@email.com",
  phone: "+1 (555) 123-4567",
  location: "San Francisco, CA",
  website: "https://alexjohnson.dev",
  linkedIn: "https://linkedin.com/in/alexjohnson",
  headline: "Senior Full-Stack Engineer",
  bio: "Passionate software engineer with 6+ years of experience building scalable web applications.",
  skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker", "AWS"],
  languages: ["English", "Spanish"],
  experience: [
    {
      company: "TechCorp Inc.",
      role: "Senior Software Engineer",
      from: "2021",
      to: "Present",
      current: true,
      desc: "Led development of microservices architecture serving 2M+ users. Reduced API latency by 40%."
    },
    {
      company: "StartupXYZ",
      role: "Software Engineer",
      from: "2018",
      to: "2021",
      current: false,
      desc: "Built full-stack features for the core product using React and Node.js."
    }
  ],
  education: [
    {
      school: "University of California, Berkeley",
      degree: "B.S.",
      field: "Computer Science",
      from: "2014",
      to: "2018",
      gpa: "3.8"
    }
  ],
  certifications: [
    { name: "AWS Solutions Architect", issuer: "Amazon Web Services", year: "2022" }
  ]
};
var listTemplates = async (category) => {
  return prisma.resumeTemplate.findMany({
    where: {
      isActive: true,
      ...category && category !== "ALL" ? { category } : {}
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      thumbnailUrl: true,
      category: true,
      isDefault: true,
      isActive: true,
      _count: { select: { resumes: true } }
    }
  });
};
var getTemplateById = async (id) => {
  const template = await prisma.resumeTemplate.findUnique({ where: { id } });
  if (!template) throw new AppError_default(status7.NOT_FOUND, "Template not found.");
  return { template, sampleData: SAMPLE_RESUME_DATA };
};
var createTemplate = async (data, adminUserId, thumbnailFile) => {
  let thumbnailUrl = data.thumbnailUrl || "";
  if (thumbnailFile) {
    const ext = thumbnailFile.originalname.split(".").pop() || "png";
    const objectName = `templates/${Date.now()}.${ext}`;
    const readable = Readable2.from(thumbnailFile.buffer);
    await uploadStream(objectName, readable, thumbnailFile.size, thumbnailFile.mimetype);
    thumbnailUrl = await getPresignedUrl(objectName, 365 * 24 * 3600);
  }
  if (data.isDefault) {
    await prisma.resumeTemplate.updateMany({ data: { isDefault: false } });
  }
  return prisma.resumeTemplate.create({
    data: {
      name: data.name,
      description: data.description,
      thumbnailUrl,
      htmlLayout: data.htmlLayout,
      cssStyles: data.cssStyles,
      category: data.category,
      isActive: data.isActive ?? true,
      isDefault: data.isDefault ?? false,
      createdBy: adminUserId
    }
  });
};
var updateTemplate = async (id, data, thumbnailFile) => {
  const existing = await prisma.resumeTemplate.findUnique({ where: { id } });
  if (!existing) throw new AppError_default(status7.NOT_FOUND, "Template not found.");
  let thumbnailUrl = existing.thumbnailUrl;
  if (thumbnailFile) {
    const ext = thumbnailFile.originalname.split(".").pop() || "png";
    const objectName = `templates/${id}.${ext}`;
    const readable = Readable2.from(thumbnailFile.buffer);
    await uploadStream(objectName, readable, thumbnailFile.size, thumbnailFile.mimetype);
    thumbnailUrl = await getPresignedUrl(objectName, 365 * 24 * 3600);
  }
  if (data.isDefault) {
    await prisma.resumeTemplate.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
  }
  return prisma.resumeTemplate.update({
    where: { id },
    data: { ...data, thumbnailUrl, category: data.category }
  });
};
var toggleStatus = async (id) => {
  const template = await prisma.resumeTemplate.findUnique({ where: { id } });
  if (!template) throw new AppError_default(status7.NOT_FOUND, "Template not found.");
  return prisma.resumeTemplate.update({
    where: { id },
    data: { isActive: !template.isActive }
  });
};
var setDefault = async (id) => {
  const template = await prisma.resumeTemplate.findUnique({ where: { id } });
  if (!template) throw new AppError_default(status7.NOT_FOUND, "Template not found.");
  await prisma.resumeTemplate.updateMany({ data: { isDefault: false } });
  return prisma.resumeTemplate.update({ where: { id }, data: { isDefault: true } });
};
var deleteTemplate = async (id) => {
  const template = await prisma.resumeTemplate.findUnique({
    where: { id },
    include: { _count: { select: { resumes: true } } }
  });
  if (!template) throw new AppError_default(status7.NOT_FOUND, "Template not found.");
  if (template._count.resumes > 0) {
    throw new AppError_default(
      status7.CONFLICT,
      `Cannot delete template \u2014 ${template._count.resumes} resume(s) are using it.`
    );
  }
  await prisma.resumeTemplate.delete({ where: { id } });
  return { message: "Template deleted successfully." };
};

// src/modules/template/template.controller.ts
var listTemplates2 = catchAsync(async (req, res) => {
  const data = await listTemplates(req.query.category);
  sendResponse(res, { status: status8.OK, success: true, message: "Templates retrieved.", data });
});
var getTemplate = catchAsync(async (req, res) => {
  const data = await getTemplateById(req.params.id);
  sendResponse(res, { status: status8.OK, success: true, message: "Template retrieved.", data });
});
var createTemplate2 = catchAsync(async (req, res) => {
  const data = await createTemplate(req.body, req.user.userId, req.file);
  sendResponse(res, { status: status8.CREATED, success: true, message: "Template created.", data });
});
var updateTemplate2 = catchAsync(async (req, res) => {
  const data = await updateTemplate(req.params.id, req.body, req.file);
  sendResponse(res, { status: status8.OK, success: true, message: "Template updated.", data });
});
var toggleStatus2 = catchAsync(async (req, res) => {
  const data = await toggleStatus(req.params.id);
  sendResponse(res, { status: status8.OK, success: true, message: "Template status toggled.", data });
});
var setDefault2 = catchAsync(async (req, res) => {
  const data = await setDefault(req.params.id);
  sendResponse(res, { status: status8.OK, success: true, message: "Default template updated.", data });
});
var deleteTemplate2 = catchAsync(async (req, res) => {
  const result = await deleteTemplate(req.params.id);
  sendResponse(res, { status: status8.OK, success: true, message: result.message, data: null });
});

// src/modules/template/template.schema.ts
import { z as z3 } from "zod";
var createTemplateSchema = z3.object({
  body: z3.object({
    name: z3.string().min(1, "Template name is required").max(100),
    description: z3.string().max(500).optional(),
    thumbnailUrl: z3.string().optional().default(""),
    htmlLayout: z3.string().min(10, "HTML layout is required"),
    cssStyles: z3.string().optional().default(""),
    category: z3.enum(["MODERN", "CLASSIC", "CREATIVE", "ATS"]),
    isActive: z3.coerce.boolean().optional().default(true),
    isDefault: z3.coerce.boolean().optional().default(false)
  })
});
var updateTemplateSchema = z3.object({
  body: z3.object({
    name: z3.string().min(1).max(100).optional(),
    description: z3.string().max(500).optional(),
    htmlLayout: z3.string().min(10).optional(),
    cssStyles: z3.string().optional(),
    category: z3.enum(["MODERN", "CLASSIC", "CREATIVE", "ATS"]).optional(),
    isActive: z3.coerce.boolean().optional(),
    isDefault: z3.coerce.boolean().optional()
  })
});

// src/modules/template/template.router.ts
var router3 = Router3();
var upload2 = multer2({ storage: multer2.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router3.get("/", listTemplates2);
router3.get("/:id", getTemplate);
router3.post(
  "/",
  checkAuth("ADMIN"),
  upload2.single("thumbnail"),
  validateRequest(createTemplateSchema),
  createTemplate2
);
router3.put(
  "/:id",
  checkAuth("ADMIN"),
  upload2.single("thumbnail"),
  validateRequest(updateTemplateSchema),
  updateTemplate2
);
router3.patch("/:id/status", checkAuth("ADMIN"), toggleStatus2);
router3.patch("/:id/default", checkAuth("ADMIN"), setDefault2);
router3.delete("/:id", checkAuth("ADMIN"), deleteTemplate2);
var templateRouter = router3;

// src/modules/resume/resume.router.ts
import { Router as Router4 } from "express";

// src/modules/resume/resume.controller.ts
import status10 from "http-status";

// src/modules/resume/resume.service.ts
import status9 from "http-status";
import Handlebars from "handlebars";

// src/utils/aiResponse.ts
var FREE_MODELS = [
  "openrouter/owl-alpha",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "poolside/laguna-m.1:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openai/gpt-oss-120b:free",
  "poolside/laguna-xs.2:free",
  "openai/gpt-oss-20b:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/llama-nemotron-embed-vl-1b-v2:free"
];
function buildSystemPrompt(responseStyle, restrictedAnswer) {
  const lines = [
    "You are a precise AI assistant. Always respond with valid JSON only \u2014 no markdown fences, no extra text.",
    `Response format / style: ${responseStyle}`
  ];
  if (restrictedAnswer && restrictedAnswer.trim()) {
    lines.push(`Restrictions \u2014 strictly avoid: ${restrictedAnswer.trim()}`);
  }
  return lines.join("\n");
}
async function fetchFromModel(model, systemPrompt, userMessage, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${envVars.OpenRouter_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage }
          ],
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      }
    );
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `HTTP ${response.status} from model "${model}": ${errorBody}`
      );
    }
    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content ?? "";
    if (!content) {
      throw new Error(`Empty content returned by model "${model}"`);
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}
function safeParseJson(raw2) {
  try {
    const cleaned = raw2.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}
async function getAiResponse(params) {
  const {
    context,
    responseStyle,
    retryNumber = 2,
    aiModel,
    restrictedAnswer = "",
    responseTime = 5e3
  } = params;
  const systemPrompt = buildSystemPrompt(responseStyle, restrictedAnswer);
  const modelsToTry = aiModel ? [aiModel] : FREE_MODELS;
  let lastError = "Unknown error";
  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= retryNumber; attempt++) {
      try {
        console.log(
          `[AI] Trying model "${model}" \u2014 attempt ${attempt}/${retryNumber}`
        );
        const rawText = await fetchFromModel(
          model,
          systemPrompt,
          context,
          responseTime
        );
        const parsed = safeParseJson(rawText);
        if (parsed !== null) {
          return {
            success: true,
            model,
            data: parsed
          };
        }
        console.warn(
          `[AI] Model "${model}" returned non-JSON output. Returning rawText.`
        );
        return {
          success: true,
          model,
          data: null,
          rawText
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.error(
          `[AI] Model "${model}" attempt ${attempt} failed: ${lastError}`
        );
        if (attempt < retryNumber) {
          await new Promise((res) => setTimeout(res, 500 * attempt));
        }
      }
    }
    console.warn(`[AI] All ${retryNumber} attempts failed for "${model}". Moving to next model.`);
  }
  return {
    success: false,
    model: modelsToTry[modelsToTry.length - 1],
    data: null,
    error: `All models failed. Last error: ${lastError}`
  };
}

// src/modules/resume/resume.service.ts
var buildResumePrompt = (profile, input) => {
  return `
You are an expert resume writer and career coach. Generate a professional, ATS-optimized resume for the following person targeting the specified job title.

== CANDIDATE PROFILE ==
Name: ${profile.firstName} ${profile.lastName}
Email: ${profile.email || ""}
Phone: ${profile.phone || ""}
Location: ${profile.location || ""}
Headline: ${profile.headline || ""}
Bio: ${profile.bio || ""}
Skills: ${JSON.stringify(profile.skills || [])}
Languages: ${JSON.stringify(profile.languages || [])}
Experience: ${JSON.stringify(profile.experience || [])}
Education: ${JSON.stringify(profile.education || [])}
Certifications: ${JSON.stringify(profile.certifications || [])}

== TARGET POSITION ==
Job Title: ${input.targetJobTitle}
${input.jobDescription ? `Job Description:
${input.jobDescription}` : ""}

== INSTRUCTIONS ==
1. Write a compelling professional summary (3-4 sentences) tailored to the job title
2. Enhance experience bullet points to be achievement-focused with metrics where possible
3. Highlight skills most relevant to the target role
4. Ensure ATS-friendly formatting
5. Use action verbs for experience descriptions
`;
};
var buildAtsPrompt = (contentData, jobDescription) => {
  return `
Analyze this resume against the job description and provide an ATS optimization score.

== RESUME CONTENT ==
${JSON.stringify(contentData, null, 2)}

== JOB DESCRIPTION ==
${jobDescription}

Return a JSON with this exact structure:
{
  "atsScore": <number 0-100>,
  "matchedKeywords": [<string>],
  "missingKeywords": [<string>],
  "suggestions": [
    { "section": "<section name>", "issue": "<issue>", "suggestion": "<improved text>" }
  ]
}
`;
};
var listResumes = async (userId, page = 1, limit = 10, type, resumeStatus) => {
  const where = {
    userId,
    ...type ? { type } : {},
    ...resumeStatus ? { status: resumeStatus } : {}
  };
  const [resumes, total] = await Promise.all([
    prisma.resume.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updatedAt: "desc" },
      include: { template: { select: { name: true, category: true } } }
    }),
    prisma.resume.count({ where })
  ]);
  return {
    resumes,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};
var getResume = async (userId, resumeId) => {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    include: { template: true }
  });
  if (!resume) throw new AppError_default(status9.NOT_FOUND, "Resume not found.");
  return resume;
};
var generateResume = async (userId, input) => {
  const limits = await prisma.userLimit.findUnique({ where: { userId } });
  if (!limits) throw new AppError_default(status9.BAD_REQUEST, "User limits not configured.");
  if (limits.resumeUsed >= limits.resumeLimit) {
    throw new AppError_default(status9.FORBIDDEN, `Resume limit reached (${limits.resumeLimit}/month).`, "RESUME_LIMIT_REACHED");
  }
  if (limits.apiUsed >= limits.apiLimit) {
    throw new AppError_default(status9.FORBIDDEN, `API call limit reached (${limits.apiLimit}/month).`, "API_LIMIT_REACHED");
  }
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) throw new AppError_default(status9.BAD_REQUEST, "Please complete your profile before generating a resume.");
  const template = await prisma.resumeTemplate.findUnique({ where: { id: input.templateId } });
  if (!template) throw new AppError_default(status9.NOT_FOUND, "Template not found.");
  const profileData = {
    ...profile,
    email: (await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email
  };
  const prompt = buildResumePrompt(profileData, input);
  const aiResult = await getAiResponse({
    context: prompt,
    responseStyle: `Return a JSON object representing a complete resume with these sections:
{
  "summary": "Professional summary text",
  "experience": [{ "company": "", "role": "", "from": "", "to": "", "current": false, "bullets": [""] }],
  "education": [{ "school": "", "degree": "", "field": "", "from": "", "to": "", "gpa": "" }],
  "skills": [""],
  "languages": [""],
  "certifications": [{ "name": "", "issuer": "", "year": "" }],
  "personalInfo": { "firstName": "", "lastName": "", "email": "", "phone": "", "location": "", "headline": "", "website": "", "linkedIn": "", "github": "" }
}`,
    responseTime: 3e4,
    retryNumber: 3
  });
  if (!aiResult.success || !aiResult.data) {
    throw new AppError_default(status9.INTERNAL_SERVER_ERROR, "AI generation failed. Please try again.");
  }
  const resume = await prisma.resume.create({
    data: {
      userId,
      templateId: input.templateId,
      title: input.title,
      type: input.type,
      status: "GENERATED",
      targetJobTitle: input.targetJobTitle,
      jobDescription: input.jobDescription,
      contentData: aiResult.data,
      version: 1
    }
  });
  await prisma.userLimit.update({
    where: { userId },
    data: { resumeUsed: { increment: 1 }, apiUsed: { increment: 1 } }
  });
  await prisma.userProfile.update({
    where: { userId },
    data: { resumeCount: { increment: 1 }, apiCallCount: { increment: 1 } }
  });
  return { resume, template };
};
var updateResume = async (userId, resumeId, data) => {
  const existing = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!existing) throw new AppError_default(status9.NOT_FOUND, "Resume not found.");
  await prisma.resumeHistory.create({
    data: {
      resumeId,
      version: existing.version,
      snapshot: existing.contentData,
      changedBy: userId
    }
  });
  return prisma.resume.update({
    where: { id: resumeId },
    data: {
      ...data,
      contentData: data.contentData ? data.contentData : existing.contentData,
      version: existing.version + 1
    }
  });
};
var deleteResume = async (userId, resumeId) => {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError_default(status9.NOT_FOUND, "Resume not found.");
  await prisma.resume.delete({ where: { id: resumeId } });
  return { message: "Resume deleted." };
};
var runAtsCheck = async (userId, resumeId, data) => {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError_default(status9.NOT_FOUND, "Resume not found.");
  const limits = await prisma.userLimit.findUnique({ where: { userId } });
  if (!limits || limits.apiUsed >= limits.apiLimit) {
    throw new AppError_default(status9.FORBIDDEN, "API call limit reached.", "API_LIMIT_REACHED");
  }
  const prompt = buildAtsPrompt(resume.contentData, data.jobDescription);
  const aiResult = await getAiResponse({
    context: prompt,
    responseStyle: "Return JSON with atsScore, matchedKeywords, missingKeywords, suggestions",
    responseTime: 2e4,
    retryNumber: 3
  });
  if (!aiResult.success || !aiResult.data) {
    throw new AppError_default(status9.INTERNAL_SERVER_ERROR, "ATS analysis failed. Please try again.");
  }
  const updated = await prisma.resume.update({
    where: { id: resumeId },
    data: {
      atsScore: aiResult.data.atsScore,
      jobDescription: data.jobDescription,
      aiSuggestions: aiResult.data
    }
  });
  await prisma.userLimit.update({ where: { userId }, data: { apiUsed: { increment: 1 } } });
  return { resume: updated, atsData: aiResult.data };
};
var exportPdf = async (userId, resumeId, format = "A4") => {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    include: { template: true }
  });
  if (!resume) throw new AppError_default(status9.NOT_FOUND, "Resume not found.");
  const template = Handlebars.compile(resume.template.htmlLayout);
  const contentData = resume.contentData;
  const personalInfo = contentData.personalInfo || {};
  const renderedHtml = template({
    ...contentData,
    ...personalInfo,
    cssStyles: resume.template.cssStyles
  });
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${resume.template.cssStyles}</style></head><body>${renderedHtml}</body></html>`;
  const puppeteerUrl = envVars.PUPPETEER_SERVICE_URL;
  const response = await fetch(`${puppeteerUrl}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html: fullHtml, options: { format } })
  });
  if (!response.ok) {
    throw new AppError_default(status9.INTERNAL_SERVER_ERROR, "PDF generation failed.");
  }
  const pdfBuffer = Buffer.from(await response.arrayBuffer());
  const objectName = `resumes/${userId}/${resumeId}/resume.pdf`;
  await uploadBuffer(objectName, pdfBuffer, "application/pdf");
  const presignedUrl = await getPresignedUrl(objectName, 3600);
  await prisma.resume.update({
    where: { id: resumeId },
    data: { pdfUrl: objectName, status: "EXPORTED" }
  });
  return { presignedUrl };
};
var getResumeHistory = async (userId, resumeId) => {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError_default(status9.NOT_FOUND, "Resume not found.");
  return prisma.resumeHistory.findMany({ where: { resumeId }, orderBy: { createdAt: "desc" } });
};
var restoreVersion = async (userId, resumeId, version) => {
  const historyEntry = await prisma.resumeHistory.findFirst({
    where: { resumeId, version }
  });
  if (!historyEntry) throw new AppError_default(status9.NOT_FOUND, "Version not found.");
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError_default(status9.NOT_FOUND, "Resume not found.");
  await prisma.resumeHistory.create({
    data: { resumeId, version: resume.version, snapshot: resume.contentData, changedBy: userId }
  });
  return prisma.resume.update({
    where: { id: resumeId },
    data: { contentData: historyEntry.snapshot, version: resume.version + 1 }
  });
};
var duplicateResume = async (userId, resumeId) => {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError_default(status9.NOT_FOUND, "Resume not found.");
  const limits = await prisma.userLimit.findUnique({ where: { userId } });
  if (limits && limits.resumeUsed >= limits.resumeLimit) {
    throw new AppError_default(status9.FORBIDDEN, "Resume limit reached.", "RESUME_LIMIT_REACHED");
  }
  const duplicate = await prisma.resume.create({
    data: {
      userId,
      templateId: resume.templateId,
      title: `${resume.title} (Copy)`,
      type: resume.type,
      status: "DRAFT",
      targetJobTitle: resume.targetJobTitle,
      contentData: resume.contentData,
      version: 1
    }
  });
  await prisma.userLimit.update({ where: { userId }, data: { resumeUsed: { increment: 1 } } });
  return duplicate;
};
var aiModifySection = async (userId, resumeId, data) => {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new AppError_default(status9.NOT_FOUND, "Resume not found.");
  const limits = await prisma.userLimit.findUnique({ where: { userId } });
  if (!limits || limits.apiUsed >= limits.apiLimit) {
    throw new AppError_default(status9.FORBIDDEN, "API call limit reached.", "API_LIMIT_REACHED");
  }
  const contentData = resume.contentData;
  const sectionContent = contentData[data.section];
  const aiResult = await getAiResponse({
    context: `Section: ${data.section}
Current content: ${JSON.stringify(sectionContent)}
Instruction: ${data.instruction}`,
    responseStyle: 'Return JSON: { "updatedSection": <the rewritten section content maintaining the same data structure> }',
    responseTime: 15e3,
    retryNumber: 2
  });
  if (!aiResult.success || !aiResult.data) {
    throw new AppError_default(status9.INTERNAL_SERVER_ERROR, "AI modification failed.");
  }
  const newContentData = { ...contentData, [data.section]: aiResult.data.updatedSection };
  const updated = await prisma.resume.update({
    where: { id: resumeId },
    data: { contentData: newContentData }
  });
  await prisma.userLimit.update({ where: { userId }, data: { apiUsed: { increment: 1 } } });
  return updated;
};

// src/modules/resume/resume.controller.ts
var listResumes2 = catchAsync(async (req, res) => {
  const { page = "1", limit = "10", type, status: resumeStatus } = req.query;
  const result = await listResumes(
    req.user.userId,
    parseInt(page),
    parseInt(limit),
    type,
    resumeStatus
  );
  sendResponse(res, {
    status: status10.OK,
    success: true,
    message: "Resumes retrieved.",
    data: result.resumes,
    meta: result.meta
  });
});
var getResume2 = catchAsync(async (req, res) => {
  const data = await getResume(req.user.userId, req.params.id);
  sendResponse(res, { status: status10.OK, success: true, message: "Resume retrieved.", data });
});
var generateResume2 = catchAsync(async (req, res) => {
  const data = await generateResume(req.user.userId, req.body);
  sendResponse(res, { status: status10.CREATED, success: true, message: "Resume generated successfully.", data });
});
var updateResume2 = catchAsync(async (req, res) => {
  const data = await updateResume(req.user.userId, req.params.id, req.body);
  sendResponse(res, { status: status10.OK, success: true, message: "Resume updated.", data });
});
var deleteResume2 = catchAsync(async (req, res) => {
  const result = await deleteResume(req.user.userId, req.params.id);
  sendResponse(res, { status: status10.OK, success: true, message: result.message, data: null });
});
var atsCheck = catchAsync(async (req, res) => {
  const data = await runAtsCheck(req.user.userId, req.params.id, req.body);
  sendResponse(res, { status: status10.OK, success: true, message: "ATS analysis complete.", data });
});
var exportPdf2 = catchAsync(async (req, res) => {
  const format = req.body.format || "A4";
  const data = await exportPdf(req.user.userId, req.params.id, format);
  sendResponse(res, { status: status10.OK, success: true, message: "PDF exported.", data });
});
var getHistory = catchAsync(async (req, res) => {
  const data = await getResumeHistory(req.user.userId, req.params.id);
  sendResponse(res, { status: status10.OK, success: true, message: "History retrieved.", data });
});
var restoreVersion2 = catchAsync(async (req, res) => {
  const data = await restoreVersion(req.user.userId, req.params.id, parseInt(req.params.version));
  sendResponse(res, { status: status10.OK, success: true, message: "Version restored.", data });
});
var duplicateResume2 = catchAsync(async (req, res) => {
  const data = await duplicateResume(req.user.userId, req.params.id);
  sendResponse(res, { status: status10.CREATED, success: true, message: "Resume duplicated.", data });
});
var aiModifySection2 = catchAsync(async (req, res) => {
  const data = await aiModifySection(req.user.userId, req.params.id, req.body);
  sendResponse(res, { status: status10.OK, success: true, message: "Section updated by AI.", data });
});

// src/modules/resume/resume.schema.ts
import { z as z4 } from "zod";
var generateResumeSchema = z4.object({
  body: z4.object({
    templateId: z4.string().min(1, "Template ID is required"),
    title: z4.string().min(1, "Resume title is required").max(100),
    type: z4.enum(["RESUME", "CV"]).default("RESUME"),
    targetJobTitle: z4.string().min(1, "Target job title is required").max(100),
    jobDescription: z4.string().max(5e3).optional()
  })
});
var updateResumeSchema = z4.object({
  body: z4.object({
    title: z4.string().min(1).max(100).optional(),
    contentData: z4.record(z4.unknown()).optional(),
    targetJobTitle: z4.string().max(100).optional(),
    jobDescription: z4.string().max(5e3).optional()
  })
});
var atsCheckSchema = z4.object({
  body: z4.object({
    jobDescription: z4.string().min(10, "Job description is required for ATS check").max(5e3)
  })
});
var aiModifySchema = z4.object({
  body: z4.object({
    section: z4.string().min(1, "Section name is required"),
    instruction: z4.string().min(1, "Instruction is required").max(500)
  })
});

// src/modules/resume/resume.router.ts
var router4 = Router4();
router4.use(checkAuth());
router4.get("/", listResumes2);
router4.post("/generate", validateRequest(generateResumeSchema), generateResume2);
router4.get("/:id", getResume2);
router4.put("/:id", validateRequest(updateResumeSchema), updateResume2);
router4.delete("/:id", deleteResume2);
router4.post("/:id/ats-check", validateRequest(atsCheckSchema), atsCheck);
router4.post("/:id/export", exportPdf2);
router4.get("/:id/history", getHistory);
router4.post("/:id/restore/:version", restoreVersion2);
router4.post("/:id/duplicate", duplicateResume2);
router4.put("/:id/ai-modify", validateRequest(aiModifySchema), aiModifySection2);
var resumeRouter = router4;

// src/modules/admin/admin.router.ts
import { Router as Router5 } from "express";

// src/modules/admin/admin.controller.ts
import status12 from "http-status";

// src/modules/admin/admin.service.ts
import status11 from "http-status";
var getDashboardStats = async () => {
  const [
    totalUsers,
    activeSessions,
    todayResumes,
    totalApiCallsThisMonth
  ] = await Promise.all([
    prisma.user.count({ where: { role: "USER" } }),
    prisma.session.count({ where: { expiresAt: { gt: /* @__PURE__ */ new Date() } } }),
    prisma.resume.count({
      where: { createdAt: { gte: new Date((/* @__PURE__ */ new Date()).setHours(0, 0, 0, 0)) } }
    }),
    prisma.userProfile.aggregate({ _sum: { apiCallCount: true } })
  ]);
  return {
    totalUsers,
    activeSessions,
    todayResumes,
    totalApiCallsThisMonth: totalApiCallsThisMonth._sum.apiCallCount || 0
  };
};
var listUsers = async (page = 1, limit = 20, search, roleFilter, statusFilter) => {
  const where = {
    role: "USER",
    ...search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } }
      ]
    } : {},
    ...statusFilter === "active" ? { isActive: true } : {},
    ...statusFilter === "banned" ? { isActive: false } : {}
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        profile: { select: { firstName: true, lastName: true, avatarUrl: true } },
        limits: true,
        _count: { select: { resumes: true } }
      }
    }),
    prisma.user.count({ where })
  ]);
  return { users, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};
var getUserById = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      limits: true,
      devices: true,
      _count: { select: { resumes: true } }
    }
  });
  if (!user) throw new AppError_default(status11.NOT_FOUND, "User not found.");
  return user;
};
var updateUserLimits = async (userId, resumeLimit, apiLimit) => {
  return prisma.userLimit.upsert({
    where: { userId },
    update: { resumeLimit, apiLimit, overrideByAdmin: true },
    create: {
      userId,
      resumeLimit,
      apiLimit,
      resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3),
      overrideByAdmin: true
    }
  });
};
var toggleUserStatus = async (userId, isActive) => {
  return prisma.user.update({ where: { id: userId }, data: { isActive } });
};
var deleteUser = async (userId) => {
  await prisma.user.delete({ where: { id: userId } });
  return { message: "User deleted permanently." };
};
var getSettings = async () => {
  return prisma.platformConfig.findMany({ orderBy: { key: "asc" } });
};
var updateSettings = async (settings, adminUserId) => {
  const updates = settings.map(
    (s) => prisma.platformConfig.upsert({
      where: { key: s.key },
      update: { value: s.value, updatedBy: adminUserId },
      create: { key: s.key, value: s.value, description: s.description, updatedBy: adminUserId }
    })
  );
  return Promise.all(updates);
};
var getAnalytics = async (from, to) => {
  const [
    userGrowth,
    resumeVolume,
    templateUsage,
    atsScoreDistribution
  ] = await Promise.all([
    prisma.user.groupBy({
      by: ["createdAt"],
      where: { createdAt: { gte: from, lte: to }, role: "USER" },
      _count: { id: true },
      orderBy: { createdAt: "asc" }
    }),
    prisma.resume.groupBy({
      by: ["createdAt"],
      where: { createdAt: { gte: from, lte: to } },
      _count: { id: true },
      orderBy: { createdAt: "asc" }
    }),
    prisma.resume.groupBy({
      by: ["templateId"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5
    }),
    prisma.resume.aggregate({
      where: { atsScore: { not: null } },
      _avg: { atsScore: true },
      _min: { atsScore: true },
      _max: { atsScore: true }
    })
  ]);
  return { userGrowth, resumeVolume, templateUsage, atsScoreDistribution };
};

// src/modules/admin/admin.controller.ts
var getDashboard = catchAsync(async (_req, res) => {
  const data = await getDashboardStats();
  sendResponse(res, { status: status12.OK, success: true, message: "Dashboard stats retrieved.", data });
});
var listUsers2 = catchAsync(async (req, res) => {
  const { page = "1", limit = "20", search, role, status: statusFilter } = req.query;
  const result = await listUsers(
    parseInt(page),
    parseInt(limit),
    search,
    role,
    statusFilter
  );
  sendResponse(res, {
    status: status12.OK,
    success: true,
    message: "Users retrieved.",
    data: result.users,
    meta: result.meta
  });
});
var getUserById2 = catchAsync(async (req, res) => {
  const data = await getUserById(req.params.id);
  sendResponse(res, { status: status12.OK, success: true, message: "User retrieved.", data });
});
var updateUserLimits2 = catchAsync(async (req, res) => {
  const { resumeLimit, apiLimit } = req.body;
  const data = await updateUserLimits(req.params.id, resumeLimit, apiLimit);
  sendResponse(res, { status: status12.OK, success: true, message: "User limits updated.", data });
});
var toggleUserStatus2 = catchAsync(async (req, res) => {
  const { isActive } = req.body;
  const data = await toggleUserStatus(req.params.id, isActive);
  sendResponse(res, { status: status12.OK, success: true, message: `User ${isActive ? "activated" : "banned"}.`, data });
});
var deleteUser2 = catchAsync(async (req, res) => {
  const result = await deleteUser(req.params.id);
  sendResponse(res, { status: status12.OK, success: true, message: result.message, data: null });
});
var getSettings2 = catchAsync(async (_req, res) => {
  const data = await getSettings();
  sendResponse(res, { status: status12.OK, success: true, message: "Settings retrieved.", data });
});
var updateSettings2 = catchAsync(async (req, res) => {
  const data = await updateSettings(req.body.settings, req.user.userId);
  sendResponse(res, { status: status12.OK, success: true, message: "Settings updated.", data });
});
var getAnalytics2 = catchAsync(async (req, res) => {
  const { from, to } = req.query;
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3);
  const toDate = to ? new Date(to) : /* @__PURE__ */ new Date();
  const data = await getAnalytics(fromDate, toDate);
  sendResponse(res, { status: status12.OK, success: true, message: "Analytics retrieved.", data });
});

// src/modules/admin/admin.router.ts
var router5 = Router5();
router5.use(checkAuth("ADMIN"));
router5.get("/dashboard", getDashboard);
router5.get("/users", listUsers2);
router5.get("/users/:id", getUserById2);
router5.put("/users/:id/limits", updateUserLimits2);
router5.patch("/users/:id/status", toggleUserStatus2);
router5.delete("/users/:id", deleteUser2);
router5.get("/settings", getSettings2);
router5.put("/settings", updateSettings2);
router5.get("/analytics", getAnalytics2);
var adminRouter = router5;

// src/index.ts
var router6 = Router6();
router6.use("/auth", authRouter);
router6.use("/user", userRouter);
router6.use("/templates", templateRouter);
router6.use("/resumes", resumeRouter);
router6.use("/admin", adminRouter);
var indexRouter = router6;

// src/middleware/globalErrorHandler.ts
import status14 from "http-status";
import z5 from "zod";

// src/errorHelpers/handleZodError.ts
import status13 from "http-status";
var handleZodError = (err) => {
  const statusCode = status13.BAD_REQUEST;
  const message = "Zod Validation Error";
  const errorSources = [];
  err.issues.forEach((issue) => {
    errorSources.push({
      path: issue.path.join(" => "),
      message: issue.message
    });
  });
  return {
    success: false,
    message,
    errorSources,
    statusCode
  };
};

// src/middleware/globalErrorHandler.ts
var globalErrorHandler = async (err, req, res, next) => {
  if (envVars.NODE_ENV === "development") {
    console.error("Error from Global Error Handler:", err);
  }
  let errorSources = [];
  let statusCode = status14.INTERNAL_SERVER_ERROR;
  let message = "Internal Server Error";
  let stack = void 0;
  let code = void 0;
  if (err instanceof z5.ZodError) {
    const simplifiedError = handleZodError(err);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorSources = [...simplifiedError.errorSources];
    stack = err.stack;
  } else if (err instanceof AppError_default) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
    stack = err.stack;
    errorSources = [{ path: "", message: err.message }];
  } else if (err instanceof Error) {
    statusCode = status14.INTERNAL_SERVER_ERROR;
    message = err.message;
    stack = err.stack;
    errorSources = [{ path: "", message: err.message }];
  }
  const errorResponse = {
    success: false,
    message,
    errorSources,
    code,
    error: envVars.NODE_ENV === "development" ? err : void 0,
    stack: envVars.NODE_ENV === "development" ? stack : void 0
  };
  res.status(statusCode).json(errorResponse);
};

// src/app.ts
var app = express();
app.use(helmet());
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
var allowedOrigins = [envVars.FRONTEND_URL, "http://localhost:3000"].filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed = allowedOrigins.includes(origin) || /^https:\/\/.*\.vercel\.app$/.test(origin);
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposedHeaders: ["Set-Cookie"]
  })
);
app.all("/api/auth/*splat", toNodeHandler(auth));
app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "ProFile AI API is running",
    service: "profileai-api",
    version: "1.0.0",
    environment: envVars.NODE_ENV,
    uptime: process.uptime(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.use("/api/v1", indexRouter);
app.use(globalErrorHandler);
var app_default = app;

// src/utils/scheduler.ts
import { Queue, Worker } from "bullmq";
var QUEUE_NAME = "profileai-scheduler";
var schedulerQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5e3 }
  }
});
var schedulerWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    if (job.name === "monthly-limit-reset") {
      console.log("[Scheduler] Running monthly limit reset...");
      const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3);
      await prisma.userLimit.updateMany({
        data: { resumeUsed: 0, apiUsed: 0, resetAt }
      });
      await prisma.userProfile.updateMany({
        data: { apiCallCount: 0 }
      });
      console.log(`[Scheduler] Monthly limits reset for all users. Next reset: ${resetAt.toISOString()}`);
    }
  },
  { connection: redis }
);
var scheduleMonthlyReset = async () => {
  await schedulerQueue.removeRepeatable("monthly-limit-reset", {
    pattern: "0 0 1 * *"
    // 1st of every month at midnight
  });
  await schedulerQueue.add(
    "monthly-limit-reset",
    {},
    {
      repeat: { pattern: "0 0 1 * *" }
      // Cron: every 1st at midnight
    }
  );
  console.log("[Scheduler] Monthly limit reset job scheduled.");
};
schedulerWorker.on("completed", (job) => {
  console.log(`[Scheduler] Job "${job.name}" completed.`);
});
schedulerWorker.on("failed", (job, err) => {
  console.error(`[Scheduler] Job "${job?.name}" failed:`, err.message);
});

// src/server.ts
var PORT = process.env.PORT || 5e3;
async function main() {
  try {
    await prisma.$connect();
    console.log("[DB] Connected to PostgreSQL successfully.");
    await redis.connect();
    console.log("[Redis] Connected successfully.");
    await ensureBucketExists();
    await scheduleMonthlyReset();
    app_default.listen(PORT, () => {
      console.log(`[Server] ProFile AI API running on http://localhost:${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    console.error("[Server] Fatal startup error:", error);
    await prisma.$disconnect();
    await redis.quit();
    process.exit(1);
  }
}
main();
