export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { warmUp } = await import("./lib/rhchain");
  const { startRadar } = await import("./lib/radar");
  // don't block server start
  setTimeout(() => {
    warmUp();
    // Rug Radar watches pools every 2 minutes from the moment the server starts
    setTimeout(() => startRadar(), 15_000);
    // build the smart-money leaderboard in the background (low-priority data lane)
    setTimeout(() => import("./lib/smartmoney").then((m) => m.getSmartMoney()).catch(() => {}), 30_000);
  }, 500);
}
