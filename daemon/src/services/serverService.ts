import Docker from 'dockerode';
import { EventEmitter } from 'events';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const IMAGE = 'itzg/minecraft-server';

export const serverEvents = new EventEmitter();

export async function startMinecraftServer(serverName: string): Promise<string> {
    serverEvents.emit('log', { serverName, message: `[${serverName}] Pulling image ${IMAGE}... this may take a few minutes.\n` });

    await new Promise((resolve, reject) => {
        docker.pull(IMAGE, (err: any, stream: any) => {
            if (err) return reject(err);

            docker.modem.followProgress(stream,
                (onFinishErr: any, output: any) => {
                    if (onFinishErr) return reject(onFinishErr);
                    serverEvents.emit('log', { serverName, message: `[${serverName}] Image pulled successfully!\n` });
                    resolve(output);
                },
                (event: any) => {
                    // Stream download progress
                    if (event.status && event.progress) {
                        serverEvents.emit('log', { serverName, message: `[${serverName}] ${event.status}: ${event.progress}\n` });
                    }
                }
            );
        });
    });

    serverEvents.emit('log', { serverName, message: `\n[${serverName}] Creating container...\n` });

    const container = await docker.createContainer({
        name: serverName,
        Image: IMAGE,
        Env: ['EULA=TRUE', 'VERSION=1.21.11'],
        HostConfig: {
            PortBindings: {
                '25565/tcp': [{ HostPort: '25565' }]
            }
        },
        Tty: true
    });

    await container.start();

    serverEvents.emit('log', { serverName, message: `[${serverName}] Container started. Tailing logs...\n` });

    const logStream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true
    });

    logStream.on('data', (chunk: Buffer) => {
        serverEvents.emit('log', { serverName, message: chunk.toString('utf8') });
    });

    return container.id;
}

export async function stopMinecraftServer(serverName: string): Promise<boolean> {
    serverEvents.emit('log', { serverName, message: `\n[${serverName}] Stopping container...\n` });

    try {
        const container = docker.getContainer(serverName);
        // The itzg/minecraft-server handles SIGTERM to gracefully shut down the Minecraft server
        await container.stop({ t: 60 }); // Give it up to 60 seconds to save chunks and shutdown
        serverEvents.emit('log', { serverName, message: `[${serverName}] Container stopped successfully.\n` });
        return true;
    } catch (error: any) {
        serverEvents.emit('log', { serverName, message: `[${serverName}] Error stopping container: ${error.message}\n` });
        throw error;
    }
}

export async function deleteMinecraftServer(serverName: string): Promise<boolean> {
    serverEvents.emit('log', { serverName, message: `\n[${serverName}] Deleting server container and associated volumes...\n` });

    try {
        const container = docker.getContainer(serverName);

        // Remove container (force=true forcefully kills it if it's running, v=true removes anonymous volumes)
        await container.remove({ force: true, v: true });
        serverEvents.emit('log', { serverName, message: `[${serverName}] Container ${serverName} and its volumes removed successfully.\n` });

        return true;
    } catch (error: any) {
        serverEvents.emit('log', { serverName, message: `[${serverName}] Error deleting server: ${error.message}\n` });
        throw error;
    }
}
