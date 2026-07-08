import { createHash, createHmac } from "crypto";

/**
 * SENAPRED's public eventos page (https://www.senapred.cl/eventos/) is a
 * Create React App SPA backed by a single AWS AppSync GraphQL API. Its
 * default auth mode is Cognito User Pools (login), but for anonymous
 * visitors the app itself falls back to `authMode: AWS_IAM`, signing
 * requests with temporary credentials obtained from the Cognito Identity
 * Pool's unauthenticated-identity flow — this is exactly what every
 * anonymous browser tab does when it loads the public page, not a bypass of
 * anything. This module replicates that same anonymous access path.
 */
const AWS_REGION = "us-east-1";
const COGNITO_IDENTITY_POOL_ID = "us-east-1:17c696bc-53e1-49a2-991f-f1b65f752fda";
const COGNITO_IDENTITY_HOST = "cognito-identity.us-east-1.amazonaws.com";

export type SenapredAwsCredentials = {
  accessKeyId: string;
  secretKey: string;
  sessionToken: string;
  /** Unix seconds. */
  expiration: number;
};

let cachedCredentials: SenapredAwsCredentials | null = null;

async function cognitoIdentityCall<T>(target: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://${COGNITO_IDENTITY_HOST}/`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Cognito ${target} responded ${response.status}: ${text}`);
  return JSON.parse(text) as T;
}

async function requestAnonymousCredentials(): Promise<SenapredAwsCredentials> {
  const { IdentityId } = await cognitoIdentityCall<{ IdentityId: string }>("GetId", {
    IdentityPoolId: COGNITO_IDENTITY_POOL_ID,
  });
  const { Credentials } = await cognitoIdentityCall<{
    Credentials: { AccessKeyId: string; SecretKey: string; SessionToken: string; Expiration: number };
  }>("GetCredentialsForIdentity", { IdentityId });

  return {
    accessKeyId: Credentials.AccessKeyId,
    secretKey: Credentials.SecretKey,
    sessionToken: Credentials.SessionToken,
    expiration: Credentials.Expiration,
  };
}

/** Cached in-module until ~60s before expiry, same TTL-cache shape as `iocSlsmfAdapter.ts`. */
export async function getAnonymousAwsCredentials(): Promise<SenapredAwsCredentials> {
  const nowSeconds = Date.now() / 1000;
  if (cachedCredentials && cachedCredentials.expiration - 60 > nowSeconds) {
    return cachedCredentials;
  }
  cachedCredentials = await requestAnonymousCredentials();
  return cachedCredentials;
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * Hand-rolled AWS Signature Version 4 for a single POST request. No AWS SDK
 * dependency — this repo's other adapters are all bare-`fetch`, and pulling
 * in the SDK for one signing routine would be a disproportionate dependency.
 */
export function signAppSyncRequest(params: {
  url: string;
  body: string;
  credentials: SenapredAwsCredentials;
  service?: string;
  region?: string;
}): Record<string, string> {
  const { url, body, credentials, service = "appsync", region = AWS_REGION } = params;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const parsedUrl = new URL(url);

  const headersToSign: Record<string, string> = {
    host: parsedUrl.host,
    "content-type": "application/json",
    "x-amz-date": amzDate,
    "x-amz-security-token": credentials.sessionToken,
  };
  const sortedHeaderNames = Object.keys(headersToSign).sort();
  const canonicalHeaders = sortedHeaderNames.map((name) => `${name}:${headersToSign[name]}\n`).join("");
  const signedHeaders = sortedHeaderNames.join(";");

  const canonicalRequest = [
    "POST",
    parsedUrl.pathname || "/",
    parsedUrl.search.replace(/^\?/, ""),
    canonicalHeaders,
    signedHeaders,
    sha256Hex(body),
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac(`AWS4${credentials.secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");

  return {
    ...headersToSign,
    Authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
