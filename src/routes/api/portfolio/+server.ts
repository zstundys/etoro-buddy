import { json } from "@sveltejs/kit";
import { fetchPortfolio } from "$lib/etoro-api";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ request }) => {
  const apiKey = request.headers.get("x-etoro-api-key");
  const userKey = request.headers.get("x-etoro-user-key");

  if (!apiKey || !userKey) {
    return json({ error: "Missing API keys" }, { status: 400 });
  }

  try {
    const portfolio = await fetchPortfolio({ apiKey, userKey });
    return json(portfolio);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load portfolio";
    return json({ error: message }, { status: 502 });
  }
};
