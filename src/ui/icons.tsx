const paths = {
  select: "M6 3l12 9-5.5 1.2L15 19l-2.4 1.1-2.6-5.7L6 18z",
  rect: "M4 5h16v14H4z",
  polygon: "M4 9 11 4l9 5-2 10H7z",
  brush: "M4 4h5v5H4zM9 9h5v5H9zM14 9h5v5h-5zM14 14h5v5h-5z",
  eye: "M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  eyeOff:
    "M3 3l18 18M10.6 6.1A10.6 10.6 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3 3.6M6.6 6.6C3.8 8.3 2 12 2 12s3.6 6 10 6c1.6 0 3-.4 4.3-1",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  unlock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2",
  rotL: "M4 4v5h5M4.6 9A8 8 0 1 1 6 16.5",
  rotR: "M20 4v5h-5M19.4 9A8 8 0 1 0 18 16.5",
  flipH: "M12 3v18M9 7 4 12l5 5zM15 7l5 5-5 5z",
  flipV: "M3 12h18M7 9l5-5 5 5zM7 15l5 5 5-5z",
  dup: "M8 8h12v12H8zM4 16V4h12",
  copy: "M9 9h11v11H9zM5 15V5h10",
  paste: "M8 4h8v3H8zM6 6H5v15h14V6h-1M9 12h6M9 16h6",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  up: "M12 19V5M6 11l6-6 6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
  group: "M3 6h7l2 2h9v11H3z",
  ungroup: "M3 6h7l2 2h9v11H3zM9 13h6",
  chair: "M7 4h10v8H7zM6 12h12v3H6zM7 15v5M17 15v5",
  merge: "M4 4h9v9H4zM11 11h9v9h-9z",
  palette:
    "M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5S13 18 13 17s.7-1.5 1.7-1.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
};

export type IconName = keyof typeof paths;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
