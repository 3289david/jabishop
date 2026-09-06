// 이 파일은 Next.js 서버 액션/라우트 핸들러뿐 아니라 별도 프로세스로 돌아가는
// 디스코드 봇(src/bot/**)에서도 그대로 불러써서 재사용한다. "use client" 컴포넌트에서는
// 절대 import하지 말 것 - 그 용도로 걸어두던 server-only 가드는 봇 런타임과 호환되지 않아 제거했다.
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";

// 업로드 파일은 public/ 밖의 uploads/ 디렉터리에 저장하고,
// 다운로드는 항상 소유권을 검증하는 라우트 핸들러를 통해서만 내려준다.
const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

export type UploadKind = "artworks" | "previews" | "attachments";

export async function saveUploadedFile(file: File, kind: UploadKind): Promise<string> {
  const ext = path.extname(file.name) || "";
  const key = `${kind}/${randomUUID()}${ext}`;
  const fullPath = path.join(UPLOAD_ROOT, key);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(fullPath, buffer);
  return key;
}

export function resolveUploadPath(key: string): string {
  const normalized = path.normalize(key).replace(/^([.]{2}[/\\])+/, "");
  return path.join(UPLOAD_ROOT, normalized);
}

export async function readUploadedFile(key: string): Promise<Buffer> {
  return fs.readFile(resolveUploadPath(key));
}

export async function deleteUploadedFile(key: string): Promise<void> {
  await fs.unlink(resolveUploadPath(key)).catch(() => {});
}

export function guessContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
  };
  return map[ext] || "application/octet-stream";
}
