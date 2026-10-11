import { files as filesApi } from '../api/endpoints.js';

/**
 * The PDF sent with a department task, opened in a new tab. The file route needs the session,
 * so the file is fetched first and handed to the tab as a local URL.
 */
export default function TaskPdfLink({ file, className = '' }) {
  if (!file?.key) return null;
  const open = async () => {
    const url = URL.createObjectURL(await filesApi.blob(file.key));
    window.open(url, '_blank', 'noopener');
    /* Held long enough for the new tab to read it; revoking at once shows a blank tab. */
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  return (
    <button type="button" className={`text-xs font-semibold text-accent hover:underline ${className}`} onClick={open}>
      PDF: {file.filename || 'attachment'}
    </button>
  );
}
