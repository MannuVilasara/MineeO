import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import { startMinecraftServer } from './services/serverService.js';

const app = express();

app.get('/', (req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'MineeO Daemon is running with TypeScript & ESM!' });
});

app.post('/start', async (req: Request, res: Response) => {
    try {
        const id = await startMinecraftServer('mineeo-server-01');
        res.json({ status: 'ok', containerId: id });
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
