export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { warmUp } = await import("./lib/rhchain");
  // don't block server start
  setTimeout(() => warmUp(), 500);
}
