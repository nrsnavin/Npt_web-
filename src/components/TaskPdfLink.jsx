import { files as filesApi } from '../api/endpoints.js';
import AuthedImage from './AuthedImage.jsx';

/**
 * The file sent with a department task — a PDF, or a photo of the PO or drawing — opened in a new
 * tab. The file route needs the session, so the file is fetched first and handed to the tab as a
 * local URL. A photo shows as a picture on the task, so the department sees it without opening it;
 * one a browser cannot draw (an iPhone's HEIC on a desk) is opened or downloaded like the PDF.
 */
const DRAWN = ['image/jpeg', 'image/pjpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
export const isTaskPhoto = (file) => String(file?.mimeType || '').startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(file?.filename || '');

export default function TaskPdfLink({ file, className = '' }) {
  if (!file?.key) return null;
  const open = async () => {
    const url = URL.createObjectURL(await filesApi.blob(file.key));
    window.open(url, '_blank', 'noopener');
    /* Held long enough for the new tab to read it; revoking at once shows a blank tab. */
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const photo = isTaskPhoto(file);
  if (photo && (DRAWN.includes(file.mimeType) || !file.mimeType)) {
    return (
      <figure className={`max-w-xs ${className}`}>
        <AuthedImage attachmentKey={file.key} alt={`Photo sent with the task: ${file.filename || 'photo'}`} className="block max-h-56 w-full cursor-zoom-in rounded-lg border border-line/10 object-contain" onClick={open} />
        <figcaption className="mt-1">
          <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={open}>Photo: {file.filename || 'attachment'}</button>
        </figcaption>
      </figure>
    );
  }
  return (
    <button type="button" className={`text-xs font-semibold text-accent hover:underline ${className}`} onClick={open}>
      {photo ? 'Photo' : 'PDF'}: {file.filename || 'attachment'}
    </button>
  );
}
