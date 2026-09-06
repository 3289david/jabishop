import * as OTPAuth from "otpauth";

export function generateTotpSecret() {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function totpUri(secret: string, loginId: string) {
  const totp = new OTPAuth.TOTP({
    issuer: "자비샵 관리자",
    label: loginId,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.toString();
}

export function verifyTotp(secret: string, token: string) {
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}
