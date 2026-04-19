import express, { type Request, type Response } from 'express';
import axios from 'axios';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

const PORT = 3000;
const DAEMON_SOCKET = '/tmp/mineeo-daemon.sock';

// Create an Axios instance pre-configured to talk to the unix socket
const daemonApi = axios.create({
    socketPath: DAEMON_SOCKET,
    baseURL: 'http://localhost', // Required by Axios to be a valid URL, logic resolves via socketPath
});

/**
 * START a Minecraft Server
 */
app.post('/api/servers/start', async (req: Request, res: Response) => {
    const { name, version } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Server name is required' });
    }

    try {
        const response = await daemonApi.post('/start', null, {
            params: { name, version: version || 'LATEST' }
        });

        res.json({
            message: 'Server starting',
            daemonResponse: response.data
        });
    } catch (error: any) {
        res.status(500).json({
            error: 'Failed to communicate with runtime daemon',
            details: error.message
        });
    }
});

/**
 * STOP a Minecraft Server
 */
app.post('/api/servers/stop', async (req: Request, res: Response) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Server name is required' });
    }

    try {
        const response = await daemonApi.post('/stop', null, {
            params: { name }
        });
        res.json({
            message: 'Server stopping',
            daemonResponse: response.data
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to stop server', details: error.message });
    }
});

/**
 * DELETE a Minecraft Server
 */
app.delete('/api/servers/delete', async (req: Request, res: Response) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Server name is required' });
    }

    try {
        const response = await daemonApi.delete('/server', {
            params: { name }
        });
        res.json({
            message: 'Server deleted',
            daemonResponse: response.data
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to delete server', details: error.message });
    }
});

/**
 * Helper to proxy websocket logs to your standard terminal. 
 * Note: In a complete frontend/backend system, the backend would proxy WS requests from the browser directly to the daemon.
 */
function watchLogs(serverName: string) {
    console.log(`Connecting to daemon websocket for logs on ${serverName}...`);
    // Connect to unix socket via ws+unix protocol
    const ws = new WebSocket(`ws+unix://${DAEMON_SOCKET}:/logs/${serverName}`);

    ws.on('message', (data) => {
        process.stdout.write(data.toString());
    });

    ws.on('error', (err) => {
        console.error(`WebSocket Error [${serverName}]:`, err.message);
    });

    ws.on('close', () => {
        console.log(`Log stream closed for ${serverName}`);
    });
}

const server = app.listen(PORT, () => {
    console.log(`MineeO Backend running on http://localhost:${PORT}`);
    console.log('You can now use these endpoints: POST /api/servers/start, POST /api/servers/stop, DELETE /api/servers/delete');
});

// Create a WebSocket Server attached to the Express HTTP Server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket, req: any) => {
    const match = req.url?.match(/^\/api\/logs\/(.+)$/);
    if (!match) {
        ws.close(1008, 'Invalid endpoint. Please connect to /api/logs/<server-name>');
        return;
    }

    const targetServerName = match[1];
    console.log(`Client requested logs for ${targetServerName}. Bridging to daemon...`);

    // Connect to the actual unix socket websocket endpoint on our daemon
    const daemonWs = new WebSocket(`ws+unix://${DAEMON_SOCKET}:/logs/${targetServerName}`);

    daemonWs.on('message', (data) => {
        // Forward daemon log chunk to the connected web client
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    });

    daemonWs.on('error', (err) => {
        console.error(`Daemon WS Error for ${targetServerName}:`, err.message);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(`\n[BACKEND ERROR] Lost connection to daemon component: ${err.message}\n`);
            ws.close();
        }
    });

    daemonWs.on('close', () => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(`\n[BACKEND] Daemon closed stream.\n`);
            ws.close();
        }
    });

    ws.on('close', () => {
        // Stop stream from daemon if user closes their browser
        if (daemonWs.readyState === WebSocket.OPEN) {
            daemonWs.close();
        }
    });
});
