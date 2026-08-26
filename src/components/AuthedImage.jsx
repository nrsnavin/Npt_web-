import { useEffect, useState } from 'react';
import { files } from '../api/endpoints.js';

/**
 * An image the browser cannot fetch on its own.
 *
 * Sample photos are as confidential as the samples they are of, so the file route checks the
 * caller against the record before sending a byte. A plain `<img src>` sends no Authorization
 * header, so the picture is fetched through the API client and shown from an object URL
 * instead. The URL is revoked when the image goes away, or a long session leaks every photo
 * anyone has ever opened.
 *
 * The same shape works unchanged if the store moves to S3 with presigned URLs — only
 * `files.blob` would change.
 */
export default function AuthedImage({ attachmentKey, alt, className = '', onClick }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;

    setUrl(null);
    setFailed(false);

    files
      .blob(attachmentKey)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentKey]);

  if (failed) {
    return (
      <div className={`grid place-items-center bg-line/[0.04] text-xs text-steel-500 ${className}`}>
        Photo unavailable
      </div>
    );
  }

  // The skeleton holds the space so a feed does not jump as each photo arrives.
  if (!url) return <div className={`skeleton ${className}`} />;

  return (
    <img
      src={url}
      alt={alt}
      onClick={onClick}
      className={className}
      loading="lazy"
    />
  );
}
