/** Single-path icons for the dock, so they inherit currentColor and stay consistent. */
const PATHS = {
  todo: 'M9 11l3 3 5-5M4 6h2m-2 6h2m-2 6h2M9 6h11M9 18h11',
  note: 'M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v9l-6 6H5a1 1 0 0 1-1-1V5Zm16 9h-5a1 1 0 0 0-1 1v5',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Zm13-4a6 6 0 0 1 0 10M6 14v5h3',
  bell: 'M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M13.7 21a2 2 0 0 1-3.4 0',
  close: 'M18 6 6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7',
  pin: 'M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z',
  check: 'm5 12 5 5L20 7',
  /* Ask Jarvis: a speech bubble with a spark in it. */
  spark: 'M20 12a8 8 0 0 1-11.6 7.1L4 20l.9-4.4A8 8 0 1 1 20 12ZM12 8.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z',
  send: 'M4 12h13m0 0-5-5m5 5-5 5',
};

export default function DockIcon({ name, className = 'h-[1.05rem] w-[1.05rem]' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
