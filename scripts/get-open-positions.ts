/**
 * Fetch all open positions from eToro API.
 *
 * Requires ETORO_API_KEY and ETORO_USER_KEY in .env.
 * Get keys from eToro: Settings > Trading > API Key Management.
 */

const BASE_URL = "https://public-api.etoro.com";

function getHeaders(): Record<string, string> {
  const apiKey = process.env.ETORO_API_KEY;
  const userKey = process.env.ETORO_USER_KEY;

  if (!apiKey || !userKey) {
    throw new Error(
      "Missing ETORO_API_KEY and ETORO_USER_KEY. Add them to .env"
    );
  }

  return {
    "x-api-key": apiKey,
    "x-user-key": userKey,
    "x-request-id": crypto.randomUUID(),
    "Content-Type": "application/json",
  };
}

async function getOpenPositions() {
  const res = await fetch(`${BASE_URL}/api/v1/trading/info/portfolio`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eToro API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    clientPortfolio?: {
      positions?: Array<{
        positionId: number;
        instrumentId: number;
        openRate: number;
        units: number;
        amount: number;
        isBuy: boolean;
        openDateTime: string;
        leverage: number;
      }>;
      credit?: number;
    };
  };

  const positions = data.clientPortfolio?.positions ?? [];
  const credit = data.clientPortfolio?.credit;

  return { positions, credit };
}

const { positions, credit } = await getOpenPositions();

console.log("Open positions:", positions.length);
if (credit != null) {
  console.log("Available credit: $", credit);
}
console.log(JSON.stringify(positions, null, 2));
