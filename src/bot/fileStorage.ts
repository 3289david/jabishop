import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";

// lib/storage.ts와 동일한 업로드 디렉터리를 공유하지만, 그 파일은 Next.js 전용
// "server-only" 가드가 걸려 있어 봇 프로세스(순수 Node)에서 그대로 import할 수 없다.
// 그래서 봇에서 필요한 최소 기능만 별도로 둔다. 저장 위치는 반드시 동일해야 한다.
const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

export type UploadKind = "artworks" | "previews" | "attachments";

export async function saveBufferToUploads(buffer: Buffer, originalName: string, kind: UploadKind): Promise<string> {
  const ext = path.extname(originalName) || "";
  const key = `${kind}/${randomUUID()}${ext}`;
  const fullPath = path.join(UPLOAD_ROOT, key);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);
  return key;
}

// lib/storage.ts의 isUploadKey()와 동일 - 일괄 등록(TXT)으로 링크/텍스트를 그대로
// fileKey에 넣은 재고는 디스크에 없으므로 파일로 읽으면 안 된다.
export function isUploadKey(key: string): boolean {
  return /^(artworks|previews|attachments)\//.test(key);
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
