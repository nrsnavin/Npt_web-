import { useEffect, useState } from 'react';
import { files } from '../api/endpoints.js';
import { useNearViewport } from '../hooks/useNearViewport.js';

/**
 * An image the browser cannot fetch on its own.
 *
 * Sample photos are as confidential as the samples they are of, so the file route checks the
 * caller against the record before sending a byte. A plain `<img src>` sends no Authorization
 * header, so the picture is fetched through the API client and shown from an object URL
 * instead. The URL is revoked when the image goes away, or a long session leaks every photo
 * anyone has ever opened.
 *
 * The fetch waits until the image is near the viewport, which is the only lazy loading that
 * works here. `loading="lazy"` on the `<img>` defers nothing when the source is a blob URL —
 * by the time that element exists the bytes are already downloaded. A sample with forty
 * photographs on its log was pulling all forty on open, before the reader had scrolled past
 * the third; on phone photographs that is a hundred megabytes to look at one entry.
 *
 * `eager` opts out, for the one place it should not defer: a photo opened full size in a
 * modal is the thing the reader just asked for.
 *
 * The same shape works unchanged if the store moves to S3 with presigned URLs — only
 * `files.blob` would change.
 */
export default function AuthedImage({ attachmentKey, alt, className = '', onClick, eager = false }) {
  const [holder, near] = useNearViewport();
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  const wanted = eager || near;

  useEffect(() => {
    if (!wanted) return undefined;

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
  }, [attachmentKey, wanted]);

  if (failed) {
    return (
      <div className={`grid place-items-center bg-line/[0.04] text-xs text-steel-500 ${className}`}>
        Photo unavailable
      </div>
    );
  }

  // The skeleton holds the space so a feed does not jump as each photo arrives — and so the
  // observer has something with the right height to watch before the picture exists.
  if (!url) return <div ref={holder} className={`skeleton ${className}`} />;

  return <img ref={holder} src={url} alt={alt} onClick={onClick} className={className} />;
}
