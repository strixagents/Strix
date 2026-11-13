import type { Metadata } from "next";
import { DownloadPage } from "@/components/DownloadPage";

export const metadata: Metadata = {
  title: "Download Strix — the app for every device",
  description: "Install Strix as an app on iPhone, Android, Windows and macOS: its own icon and window, always up to date, straight from your browser.",
};

export default function Page() {
  return <DownloadPage />;
}
