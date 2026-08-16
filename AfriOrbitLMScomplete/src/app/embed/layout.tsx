/**
 * Minimal layout for embedded surfaces.
 *
 * Note this does NOT import the main globals.css — the embed keeps its own
 * small stylesheet so the payload stays light and nothing about the app's
 * authenticated UI leaks into a third-party page.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        background: 'transparent',
      }}
    >
      {children}
    </div>
  );
}
