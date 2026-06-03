import { redirect } from "next/navigation";

/** Legacy route — Ask Agent is available from the global side panel on every page. */
export default function AskPage() {
  redirect("/");
}
