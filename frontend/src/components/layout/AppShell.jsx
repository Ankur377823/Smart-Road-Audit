import Navbar from "./Navbar";

/** Standard page frame for signed-in pages: navbar plus a centred content column. */
function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">{children}</main>
    </div>
  );
}

export default AppShell;
