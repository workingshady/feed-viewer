import { createHash, randomBytes } from "node:crypto";

/** 256-bit random token for links; only its hash is stored, so a database leak exposes no usable links. */
export const newToken = () => randomBytes(32).toString("base64url");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
