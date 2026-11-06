import type { Message } from "./types";

export async function loadMessages(): Promise<Message[]> {
  const response = await fetch("asset:/messages.json");
  return JSON.parse(await response.text()) as Message[];
}
