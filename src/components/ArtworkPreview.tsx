import { isUploadKey } from "@/lib/storage";

const IMAGE_URL_RE = /^(https?:\/\/|data:image\/)/i;

export function ArtworkPreview({
  artworkId,
  previewKey,
  fileKey,
  title,
  className = "",
}: {
  artworkId: string;
  previewKey: string | null;
  fileKey: string;
  title: string;
  className?: string;
}) {
  const value = previewKey || fileKey;

  if (isUploadKey(value)) {
    return (
      <img
        src={`/api/files/preview/${artworkId}`}
        alt={title}
        className={`object-cover rounded-lg border border-neutral-200 ${className}`}
      />
    );
  }

  if (IMAGE_URL_RE.test(value)) {
    return (
      <img
        src={value}
        alt={title}
        className={`object-cover rounded-lg border border-neutral-200 ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center text-center text-xs text-neutral-500 bg-neutral-50 rounded-lg border border-neutral-200 p-2 overflow-auto ${className}`}
    >
      {value}
    </div>
  );
}
