import { NextRequest, NextResponse } from "next/server";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { authenticate } from "@/lib/api";
import { createTickraMcpServer } from "@/lib/mcp";

// Stateless: jeder Request bekommt einen frischen, an den User gebundenen Server.
// Funktioniert lokal (localhost) und später unverändert für Cloud-Agenten.
async function handle(request: NextRequest) {
  const user = await authenticate(request);
  if (user instanceof NextResponse) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="tickra"' } }
    );
  }

  const handler = createMcpHandler(() => createTickraMcpServer(user), { responseMode: "json" });
  try {
    return await handler.fetch(request, {
      authInfo: { token: "", clientId: user.id, scopes: [] },
    });
  } finally {
    await handler.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
