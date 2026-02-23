# huclient.ts

A TypeScript WebSocket client for browser and Node.js applications.

Fully compatible with [Go-husocket](https://github.com/XeshSufferer/husocket) and uses the same format as [Go-huclient](https://github.com/XeshSufferer/husocket).

## Description

`huclient.ts` is a TypeScript implementation of a WebSocket client compatible with `husocket`. Key features:

- Promise-based API
- Auto-reconnection on disconnect
- `sendAndReceive` and `waitForMessage` methods for RPC patterns
- Fluent interface (method chaining)
- Built-in logging for debugging

## Installation

```bash
npm install github:XeshSufferer/huclient.ts
# or
pnpm add github:XeshSufferer/huclient.ts
```

## Dependencies

- `tsx` (for running examples)
- Standard `WebSocket` API (browser / Node.js 18+)

## Quick Start

```typescript
import Huclient from 'huclient.ts';

const client = new Huclient('localhost:3000', '/ws');

// Event handlers
client
  .setOnConnected((c) => console.log('Connected'))
  .setOnDisconnected((c) => console.log('Disconnected'))
  .on('server_event', (conn, msg) => {
    console.log('Received:', msg.args);
  });

// Connect
await client.connect();

// Send a message
await client.sendMessage('client_event', { text: 'Hello' });

// RPC request with response waiting
const response = await client.sendAndReceive('rpc_method', {
  param: 'value'
}, 5000); // 5 second timeout

// Close connection
await client.close();
```

## API

### Huclient Class

| Method | Description |
|--------|-------------|
| `constructor(host: string, path: string)` | Create a new instance |
| `connect(): Promise<Huclient>` | Connect to the server |
| `sendMessage(method: string, args: unknown): Promise<void>` | Send a message |
| `sendAndReceive(method, args, timeout?): Promise<unknown>` | RPC: send message and wait for response |
| `waitForMessage(method, timeout?): Promise<Message>` | Wait for a specific message |
| `on(method, callback): this` | Register an event handler |
| `off(method, callback?): this` | Remove an event handler |
| `setOnConnected(callback): this` / `setOnDisconnected(callback): this` | Lifecycle callbacks |
| `isConnected(): boolean` | Check connection status |
| `ready(): Promise<Huclient>` | Ensure connection is established before use |
| `close(code?, reason?): Promise<void>` / `forceClose(...)` | Close the connection |

### Interfaces

```typescript
interface MessageData {
  method: string;
  args: unknown;
}

class Message {
  method: string;
  args: unknown;
}

type WebSocketMessageHandler = (conn: WebSocket, message: Message) => void;
type ConnectionCallback = (client: Huclient) => void;
```


## Logging

All events are logged to the console with the `[huclient]` prefix. For production environments, it is recommended to suppress output by overriding `console` methods.

## License
MIT
