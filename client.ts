type WebSocketMessageHandler = (conn: WebSocket, message: Message) => void;
type ConnectionCallback = (client: Huclient) => void;

interface MessageData {
    method: string;
    args: unknown;
}

export class Message {
    method: string;
    args: unknown;

    constructor(method: string, args: unknown) {
        this.method = method;
        this.args = args;
    }
}

export class Huclient {
    host: string;
    path: string;
    conn: WebSocket | null;
    handlers: Map<string, WebSocketMessageHandler>;
    onConnected: ConnectionCallback | null;
    onDisconnected: ConnectionCallback | null;
    reconnectAttempts: number;
    maxReconnectAttempts: number;
    connectPromise: Promise<Huclient> | null;

    constructor(host: string, path: string) {
        this.host = host;
        this.path = path;
        this.conn = null;
        this.handlers = new Map<string, WebSocketMessageHandler>();
        this.onConnected = null;
        this.onDisconnected = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.connectPromise = null;
    }

    setOnConnected(callback: ConnectionCallback): this {
        this.onConnected = callback;
        return this;
    }

    setOnDisconnected(callback: ConnectionCallback): this {
        this.onDisconnected = callback;
        return this;
    }

    connect(): Promise<Huclient> {
        if (this.connectPromise) {
            return this.connectPromise;
        }

        const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const connUrl = `${protocol}//${this.host}${this.path}`;
        
        this.connectPromise = new Promise<Huclient>((resolve, reject) => {
            try {
                this.conn = new WebSocket(connUrl);

                this.conn.onopen = () => {
                    console.log('[huclient] CONNECTION ESTABLISHED');
                    this.reconnectAttempts = 0;
                    
                    this.on('close', (conn, message) => {
                        console.log('[huclient] CONNECTION CLOSED: ' + JSON.stringify(message.args));
                    });
                    
                    if (this.onConnected) {
                        this.onConnected(this);
                    }
                    resolve(this);
                };

                this.conn.onmessage = (event: MessageEvent) => {
                    const raw = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
                    console.log('[huclient] RAW: len = ' + raw.length + ' | data = ' + raw);
                    
                    try {
                        const msg: MessageData = JSON.parse(raw);
                        console.log('[huclient] ' + JSON.stringify(msg));
                        
                        const handler = this.handlers.get(msg.method);
                        if (handler) {
                            handler(this.conn!, new Message(msg.method, msg.args));
                        }
                    } catch (err) {
                        console.error('[huclient] PARSE ERR:', err);
                    }
                };

                this.conn.onerror = (error: Event) => {
                    console.error('[huclient] WS ERROR:', error);
                    this.connectPromise = null;
                    reject(error);
                };

                this.conn.onclose = (event: CloseEvent) => {
                    console.log('[huclient] PROTOCOL CLOSE: code=' + event.code + ', text=' + event.reason);
                    
                    if (this.onDisconnected) {
                        this.onDisconnected(this);
                    }
                    
                    this.connectPromise = null;
                    
                    if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        console.log('[huclient] Reconnect attempt ' + this.reconnectAttempts + '...');
                        setTimeout(() => {
                            this.connect().catch(() => {});
                        }, 3000);
                    }
                };

            } catch (err) {
                console.error('[huclient] CONNECT ERR:', err);
                this.connectPromise = null;
                reject(err);
            }
        });

        return this.connectPromise;
    }

    sendMessage(method: string, args: unknown): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this.conn || this.conn.readyState !== WebSocket.OPEN) {
                const err = new Error('Connection not open');
                console.error('[huclient] ' + err.message);
                reject(err);
                return;
            }

            const rawArgs = JSON.stringify(args);
            const message = new Message(method, JSON.parse(rawArgs));
            const content = JSON.stringify({
                method: message.method,
                args: message.args
            });

            console.log('[huclient] SENDING: ' + content);
            
            try {
                this.conn.send(content);
                resolve();
            } catch (err) {
                console.error('[huclient] SEND ERR:', err);
                reject(err);
            }
        });
    }

    sendAndReceive(method: string, args: Record<string, unknown>, timeout: number = 30000): Promise<unknown> {
        return new Promise<unknown>((resolve, reject) => {
            const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            const handler: WebSocketMessageHandler = (conn, message) => {
                this.off('response_' + requestId);
                clearTimeout(timer);
                resolve(message.args);
            };
            
            this.on('response_' + requestId, handler);
            
            const timer = setTimeout(() => {
                this.off('response_' + requestId);
                reject(new Error('Request timeout'));
            }, timeout);
            
            this.sendMessage(method, Object.assign({}, args, { requestId }))
                .catch(err => {
                    this.off('response_' + requestId);
                    clearTimeout(timer);
                    reject(err);
                });
        });
    }

    waitForMessage(method: string, timeout: number = 30000): Promise<Message> {
        return new Promise<Message>((resolve, reject) => {
            const handler: WebSocketMessageHandler = (conn, message) => {
                this.off(method);
                clearTimeout(timer);
                resolve(message);
            };
            
            this.on(method, handler);
            
            const timer = setTimeout(() => {
                this.off(method);
                reject(new Error('Wait timeout'));
            }, timeout);
        });
    }

    on(method: string, callback: WebSocketMessageHandler): this {
        this.handlers.set(method, callback);
        return this;
    }

    off(method: string, callback?: WebSocketMessageHandler): this {
        if (callback) {
            const existing = this.handlers.get(method);
            if (existing === callback) {
                this.handlers.delete(method);
            }
        } else {
            this.handlers.delete(method);
        }
        return this;
    }

    isConnected(): boolean {
        return this.conn !== null && this.conn.readyState === WebSocket.OPEN;
    }

    ready(): Promise<Huclient> {
        if (this.isConnected()) {
            return Promise.resolve(this);
        }
        if (this.connectPromise) {
            return this.connectPromise;
        }
        return this.connect();
    }

    close(code: number = 1000, reason: string = ''): Promise<void> {
        return new Promise<void>((resolve) => {
            if (!this.conn) {
                resolve();
                return;
            }
            
            if (this.conn.readyState === WebSocket.CLOSING || this.conn.readyState === WebSocket.CLOSED) {
                resolve();
                return;
            }
            
            const onClose = () => {
                resolve();
            };
            
            this.conn.addEventListener('close', onClose, { once: true });
            
            this.sendMessage('close', '')
                .catch(() => {})
                .finally(() => {
                    if (this.conn!.readyState === WebSocket.OPEN) {
                        this.conn!.close(code, reason);
                    } else {
                        onClose();
                    }
                });
        });
    }

    forceClose(code: number = 1000, reason: string = ''): Promise<void> {
        return new Promise<void>((resolve) => {
            if (this.conn && this.conn.readyState === WebSocket.OPEN) {
                this.conn.addEventListener('close', () => resolve(), { once: true });
                this.conn.close(code, reason);
            } else {
                resolve();
            }
        });
    }
}

export default Huclient;