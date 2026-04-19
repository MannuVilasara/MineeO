import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const IMAGE = 'itzg/minecraft-server';

export async function startMinecraftServer(serverName: string): Promise<string> {
    console.log(`[${serverName}] Pulling image ${IMAGE}... this may take a few minutes.`);

    await new Promise((resolve, reject) => {
        docker.pull(IMAGE, (err: any, stream: any) => {
            if (err) return reject(err);

            docker.modem.followProgress(stream,
                (onFinishErr: any, output: any) => {
                    if (onFinishErr) return reject(onFinishErr);
                    console.log(`[${serverName}] Image pulled successfully!`);
                    resolve(output);
                },
                (event: any) => {
                    // Log download progress
                    if (event.status && event.progress) {
                        process.stdout.write(`\r[${serverName}] ${event.status}: ${event.progress}`);
                    }
                }
            );
        });
    });

    console.log(`\n[${serverName}] Creating container...`);

    const container = await docker.createContainer({
        name: serverName,
        Image: IMAGE,
        Env: ['EULA=TRUE', 'TYPE=PAPER'],
        HostConfig: {
            PortBindings: {
                '25565/tcp': [{ HostPort: '25565' }]
            }
        },
        Tty: true
    });

    await container.start();

    const logStream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true
    });

    logStream.on('data', (chunk: Buffer) => {
        console.log(`[${serverName}] ${chunk.toString('utf8').trimEnd()}`);
    });

    return container.id;
}
