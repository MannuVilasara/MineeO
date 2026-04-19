import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { startMinecraftServer, stopMinecraftServer, deleteMinecraftServer, serverEvents } from './services/serverService.js';

const app = express();

app.get('/', (req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'MineeO Daemon is running with TypeScript & ESM!' });
});

app.post('/start', async (req: Request, res: Response) => {
    const reqServerName = req.query.name ? String(req.query.name) : 'mineeo-server-test';
    try {
        const id = await startMinecraftServer(reqServerName);
        res.json({ status: 'ok', containerId: id });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.post('/stop', async (req: Request, res: Response) => {
    const reqServerName = req.query.name ? String(req.query.name) : 'mineeo-server-test';
    try {
        await stopMinecraftServer(reqServerName);
        res.json({ status: 'ok', message: `Server ${reqServerName} stopped successfully` });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.delete('/server', async (req: Request, res: Response) => {
    const reqServerName = req.query.name ? String(req.query.name) : 'mineeo-server-test';
    try {
        await deleteMinecraftServer(reqServerName);
        res.json({ status: 'ok', message: `Server ${reqServerName} deleted successfully` });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

const socketPath = '/tmp/mineeo-daemon.sock';

// Clean up existing socket file if it exists
if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
}

// Start the server on the unix socket
const server = app.listen(socketPath, () => {
    console.log(`MineeO Daemon listening on unix socket: ${socketPath}`);
    // Allow read/write access to the socket
    fs.chmodSync(socketPath, '0777');
});

// Set up the WebSocket Server attached to the Express app
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket, req: any) => {
    // Expected WS endpoint: /logs/<server-name>
    const match = req.url?.match(/^\/logs\/(.+)$/);
    if (!match) {
        ws.close(1008, 'Invalid endpoint');
        return;
    }

    const targetServerName = match[1];

    // Log forwarder
    const logListener = (event: { serverName: string, message: string }) => {
        if (event.serverName === targetServerName) {
            ws.send(event.message);
        }
    };

    serverEvents.on('log', logListener);
    ws.send(`\n> Connected to livestream for ${targetServerName}\n`);

    ws.on('close', () => {
        serverEvents.removeListener('log', logListener);
    });
});

// Handle graceful shutdown on SIGINT (Ctrl+C)
process.on('SIGINT', () => {
    console.log('\nShutting down MineeO Daemon...');
    server.close(() => {
        if (fs.existsSync(socketPath)) {
            fs.unlinkSync(socketPath);
        }
        process.exit(0);
    });
});
