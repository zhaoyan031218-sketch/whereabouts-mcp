const DEFAULT_PROTOCOL_VERSION = "2024-11-05";

async function handleMcpHttpRequest({ res, bodyText, toolHost }) {
  let message = null;
  try {
    message = JSON.parse(String(bodyText || ""));
  } catch {
    writeJson(res, 400, rpcError(null, -32700, "Parse error"));
    return;
  }
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    writeJson(res, 400, rpcError(null, -32600, "Invalid Request"));
    return;
  }

  const id = message.id;
  const method = typeof message.method === "string" ? message.method : "";
  const params = message.params || {};

  // Notifications (e.g. notifications/initialized) carry no id; per the
  // Streamable HTTP spec they are acknowledged with 202 and an empty body.
  if (id === undefined || id === null) {
    res.writeHead(202);
    res.end();
    return;
  }

  try {
    if (method === "initialize") {
      writeJson(res, 200, rpcResult(id, {
        protocolVersion: params.protocolVersion || DEFAULT_PROTOCOL_VERSION,
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: "whereabouts-mcp",
          version: "0.1.0",
        },
      }));
      return;
    }

    if (method === "ping") {
      writeJson(res, 200, rpcResult(id, {}));
      return;
    }

    if (method === "tools/list") {
      writeJson(res, 200, rpcResult(id, { tools: toolHost.listTools() }));
      return;
    }

    if (method === "tools/call") {
      const toolName = typeof params.name === "string" ? params.name : "";
      const args = params.arguments && typeof params.arguments === "object"
        ? params.arguments
        : {};
      const result = await toolHost.invokeTool(toolName, args);
      writeJson(res, 200, rpcResult(id, {
        content: [
          {
            type: "text",
            text: formatToolResult(result),
          },
        ],
      }));
      return;
    }

    writeJson(res, 200, rpcError(id, -32601, `Method not found: ${method}`));
  } catch (error) {
    writeJson(res, 200, rpcResult(id, {
      content: [
        {
          type: "text",
          text: error instanceof Error ? error.message : String(error || "unknown error"),
        },
      ],
      isError: true,
    }));
  }
}

function formatToolResult(result) {
  if (!result || typeof result !== "object") {
    return String(result || "");
  }
  if (result.text && result.data) {
    return `${result.text}\n${JSON.stringify(result.data, null, 2)}`;
  }
  if (result.text) {
    return String(result.text);
  }
  return JSON.stringify(result, null, 2);
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body, "utf8"),
  });
  res.end(body);
}

module.exports = { handleMcpHttpRequest };
