/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import * as readline from 'readline';

export enum SidecarStatus {
	STOPPED = 'STOPPED',
	STARTING = 'STARTING',
	RUNNING = 'RUNNING',
	ERROR = 'ERROR',
}

export interface SidecarDetails {
	status: SidecarStatus;
	host: string | null;
	port: number | null;
	token: string | null;
	pid: number | null;
	version: string | null;
	workspace: string | null;
	error?: string;
}

interface HandshakePayload {
	status: string;
	host: string;
	port: number;
	token: string;
	workspace: string;
	pid: number;
	version: string;
}

export class SidecarSupervisor implements vscode.Disposable {
	private _status: SidecarStatus = SidecarStatus.STOPPED;
	private _process: cp.ChildProcess | null = null;
	private _host: string | null = null;
	private _port: number | null = null;
	private _token: string | null = null;
	private _pid: number | null = null;
	private _version: string | null = null;
	private _workspace: string | null = null;
	private _lastError: string | null = null;

	private _outputChannel: vscode.OutputChannel;
	private _statusChangeEmitter = new vscode.EventEmitter<SidecarStatus>();
	readonly onDidChangeStatus = this._statusChangeEmitter.event;

	private _healthCheckTimer: NodeJS.Timeout | null = null;
	private _autoRestart = true;
	private _restartAttempts = 0;
	private readonly _maxRestartAttempts = 5;
	private _restartCooldownTimer: NodeJS.Timeout | null = null;

	constructor() {
		this._outputChannel = vscode.window.createOutputChannel('HPC Studio Backend');
	}

	get status(): SidecarStatus {
		return this._status;
	}

	get host(): string | null {
		return this._host;
	}

	get port(): number | null {
		return this._port;
	}

	get token(): string | null {
		return this._token;
	}

	get baseUrl(): string | null {
		if (this._status === SidecarStatus.RUNNING && this._host && this._port) {
			return `http://${this._host}:${this._port}`;
		}
		return null;
	}

	getDetails(): SidecarDetails {
		return {
			status: this._status,
			host: this._host,
			port: this._port,
			token: this._token,
			pid: this._pid,
			version: this._version,
			workspace: this._workspace,
			error: this._lastError ?? undefined,
		};
	}

	private _setStatus(newStatus: SidecarStatus, error?: string): void {
		this._status = newStatus;
		if (error !== undefined) {
			this._lastError = error;
		}
		this._statusChangeEmitter.fire(newStatus);
	}

	private _log(msg: string): void {
		const timestamp = new Date().toISOString();
		this._outputChannel.appendLine(`[${timestamp}] ${msg}`);
	}

	showOutputChannel(): void {
		this._outputChannel.show(true);
	}

	/**
	 * Detects the Python executable based on priority:
	 * 1. User setting `hpc-studio.pythonPath`
	 * 2. Virtual environment in current workspace (.venv/bin/python)
	 * 3. Virtual environment in sibling /home/nosedimetuxd/Proyectos/HPC Studio/.venv/bin/python
	 * 4. System python3 / python
	 */
	findPythonPath(): string {
		const config = vscode.workspace.getConfiguration('hpc-studio');
		const configuredPath = config.get<string>('pythonPath', '').trim();
		if (configuredPath && fs.existsSync(configuredPath)) {
			return configuredPath;
		}

		const isWindows = process.platform === 'win32';
		const pyRelative = isWindows ? path.join('Scripts', 'python.exe') : path.join('bin', 'python');

		// Check workspace folders
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders) {
			for (const folder of workspaceFolders) {
				const venvPy = path.join(folder.uri.fsPath, '.venv', pyRelative);
				if (fs.existsSync(venvPy)) {
					return venvPy;
				}
			}
		}

		// Check sibling HPC Studio project directories
		const candidateDirs = [
			path.join('/home/nosedimetuxd/Proyectos/HPC Studio', '.venv', pyRelative),
			path.join('/home/nosedimetuxd/Proyectos/HPC-Studio', '.venv', pyRelative),
		];
		for (const candidate of candidateDirs) {
			if (fs.existsSync(candidate)) {
				return candidate;
			}
		}

		// Fallback to system python3 or python
		return 'python3';
	}

	/**
	 * Starts the Python backend sidecar server.
	 */
	async start(): Promise<void> {
		if (this._status === SidecarStatus.RUNNING || this._status === SidecarStatus.STARTING) {
			return;
		}

		this._autoRestart = true;
		this._setStatus(SidecarStatus.STARTING);
		this._log('Starting HPC Studio backend sidecar...');

		const pythonExecutable = this.findPythonPath();
		this._log(`Using Python executable: ${pythonExecutable}`);

		const config = vscode.workspace.getConfiguration('hpc-studio');
		const host = config.get<string>('serverHost', '127.0.0.1');
		const port = config.get<number>('serverPort', 0);
		const logLevel = config.get<string>('logLevel', 'info');

		// Determine workspace directory
		let workspaceDir = process.cwd();
		if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
			workspaceDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
		}

		const args = [
			'-m',
			'hpc_studio.server.cli',
			'--host',
			host,
			'--port',
			port.toString(),
			'--workspace',
			workspaceDir,
			'--log-level',
			logLevel,
		];

		// If Python is from sibling HPC Studio or workspace, ensure PYTHONPATH includes src
		const env = { ...process.env };
		const hpcStudioSrc = '/home/nosedimetuxd/Proyectos/HPC Studio/src';
		if (fs.existsSync(hpcStudioSrc)) {
			if (env.PYTHONPATH) {
				env.PYTHONPATH = `${hpcStudioSrc}:${env.PYTHONPATH}`;
			} else {
				env.PYTHONPATH = hpcStudioSrc;
			}
		}

		try {
			const child = cp.spawn(pythonExecutable, args, {
				env,
				stdio: ['pipe', 'pipe', 'pipe'],
			});

			this._process = child;
			this._pid = child.pid ?? null;

			// Handle startup handshake with a promise
			await this._waitForHandshake(child);

			this._log(`Backend successfully started on ${this._host}:${this._port} (PID: ${this._pid})`);
			this._setStatus(SidecarStatus.RUNNING);
			this._restartAttempts = 0;
			this._startHealthChecker();
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			this._log(`Failed to start backend: ${errorMessage}`);
			this._setStatus(SidecarStatus.ERROR, errorMessage);
			this._cleanupProcess();
			throw err;
		}
	}

	private _waitForHandshake(child: cp.ChildProcess): Promise<void> {
		return new Promise((resolve, reject) => {
			let isHandshakeComplete = false;
			const timeoutDurationMs = 15000;

			const timer = setTimeout(() => {
				if (!isHandshakeComplete) {
					isHandshakeComplete = true;
					reject(new Error(`Timeout (${timeoutDurationMs}ms) waiting for backend handshake announcement.`));
				}
			}, timeoutDurationMs);

			if (!child.stdout || !child.stderr) {
				clearTimeout(timer);
				reject(new Error('Child process stdio is not available.'));
				return;
			}

			const rlOut = readline.createInterface({ input: child.stdout });
			rlOut.on('line', (line: string) => {
				this._log(`[stdout] ${line}`);
				if (line.includes('[HPC_SIDECAR_READY]')) {
					try {
						const jsonStr = line.slice(line.indexOf('{'));
						const handshake = JSON.parse(jsonStr) as HandshakePayload;
						this._host = handshake.host;
						this._port = handshake.port;
						this._token = handshake.token;
						this._workspace = handshake.workspace;
						this._pid = handshake.pid;
						this._version = handshake.version;

						if (!isHandshakeComplete) {
							// Wait until the TCP port actually accepts connections
							this._waitForPortReady(handshake.host, handshake.port, 10000)
								.then(() => {
									if (!isHandshakeComplete) {
										isHandshakeComplete = true;
										clearTimeout(timer);
										resolve();
									}
								})
								.catch((err) => {
									if (!isHandshakeComplete) {
										isHandshakeComplete = true;
										clearTimeout(timer);
										reject(err);
									}
								});
						}
					} catch (parseError) {
						this._log(`Failed to parse handshake JSON: ${parseError}`);
					}
				}
			});

			const rlErr = readline.createInterface({ input: child.stderr });
			rlErr.on('line', (line: string) => {
				this._log(`[stderr] ${line}`);
			});

			child.on('error', (err: Error) => {
				this._log(`Process error: ${err.message}`);
				if (!isHandshakeComplete) {
					isHandshakeComplete = true;
					clearTimeout(timer);
					reject(err);
				}
			});

			child.on('exit', (code: number | null, signal: string | null) => {
				this._log(`Process exited with code ${code}, signal ${signal}`);
				this._stopHealthChecker();

				if (!isHandshakeComplete) {
					isHandshakeComplete = true;
					clearTimeout(timer);
					reject(new Error(`Backend process terminated unexpectedly (code: ${code}, signal: ${signal})`));
					return;
				}

				this._handleUnexpectedExit(code, signal);
			});
		});
	}

	private _waitForPortReady(host: string, port: number, timeoutMs: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const startTime = Date.now();

			const tryConnect = () => {
				const socket = new net.Socket();
				let isResolved = false;

				socket.setTimeout(500);

				socket.on('connect', () => {
					isResolved = true;
					socket.destroy();
					resolve();
				});

				const retryOrReject = () => {
					if (isResolved) {
						return;
					}
					socket.destroy();
					if (Date.now() - startTime >= timeoutMs) {
						reject(new Error(`Timeout waiting for port ${host}:${port} to open.`));
					} else {
						setTimeout(tryConnect, 100);
					}
				};

				socket.on('error', retryOrReject);
				socket.on('timeout', retryOrReject);

				socket.connect(port, host);
			};

			tryConnect();
		});
	}

	private _handleUnexpectedExit(code: number | null, signal: string | null): void {
		this._cleanupProcess();

		if (this._status === SidecarStatus.RUNNING || this._status === SidecarStatus.STARTING) {
			const errorMsg = `Backend process exited unexpectedly (code: ${code}, signal: ${signal})`;
			this._setStatus(SidecarStatus.ERROR, errorMsg);

			if (this._autoRestart && this._restartAttempts < this._maxRestartAttempts) {
				this._restartAttempts++;
				const delay = Math.min(1000 * Math.pow(2, this._restartAttempts - 1), 10000);
				this._log(`Attempting automatic restart (${this._restartAttempts}/${this._maxRestartAttempts}) in ${delay}ms...`);
				this._restartCooldownTimer = setTimeout(() => {
					this._restartCooldownTimer = null;
					this.start().catch((e) => {
						this._log(`Auto-restart failed: ${e.message}`);
					});
				}, delay);
			} else if (this._restartAttempts >= this._maxRestartAttempts) {
				vscode.window.showErrorMessage(
					'HPC Studio backend crashed repeatedly and could not be restarted. Please check backend logs.',
					'Show Logs'
				).then((selection) => {
					if (selection === 'Show Logs') {
						this.showOutputChannel();
					}
				});
			}
		}
	}

	private _startHealthChecker(): void {
		this._stopHealthChecker();
		this._healthCheckTimer = setInterval(async () => {
			if (this._status !== SidecarStatus.RUNNING || !this.baseUrl) {
				return;
			}
			try {
				const headers: Record<string, string> = {};
				if (this._token) {
					headers['Authorization'] = `Bearer ${this._token}`;
				}
				const response = await fetch(`${this.baseUrl}/api/health`, {
					method: 'GET',
					headers,
					signal: AbortSignal.timeout(3000),
				});
				if (!response.ok) {
					this._log(`Health check returned status: ${response.status}`);
				}
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				this._log(`Health check failed: ${msg}`);
			}
		}, 10000);
	}

	private _stopHealthChecker(): void {
		if (this._healthCheckTimer) {
			clearInterval(this._healthCheckTimer);
			this._healthCheckTimer = null;
		}
	}

	private _cleanupProcess(): void {
		this._stopHealthChecker();
		if (this._restartCooldownTimer) {
			clearTimeout(this._restartCooldownTimer);
			this._restartCooldownTimer = null;
		}
		this._process = null;
		this._host = null;
		this._port = null;
		this._token = null;
		this._pid = null;
		this._version = null;
	}

	/**
	 * Stops the backend process gracefully (SIGTERM, then SIGKILL if unresponsive).
	 */
	async stop(): Promise<void> {
		this._autoRestart = false;
		this._stopHealthChecker();

		if (this._restartCooldownTimer) {
			clearTimeout(this._restartCooldownTimer);
			this._restartCooldownTimer = null;
		}

		if (!this._process) {
			this._setStatus(SidecarStatus.STOPPED);
			return;
		}

		this._log('Stopping HPC Studio backend...');
		const child = this._process;
		this._cleanupProcess();

		return new Promise<void>((resolve) => {
			let killed = false;

			const forceKillTimer = setTimeout(() => {
				if (!killed) {
					try {
						this._log('Process did not terminate gracefully, sending SIGKILL...');
						child.kill('SIGKILL');
					} catch {
						// Ignored
					}
					killed = true;
					this._setStatus(SidecarStatus.STOPPED);
					resolve();
				}
			}, 3000);

			child.once('exit', () => {
				if (!killed) {
					killed = true;
					clearTimeout(forceKillTimer);
					this._log('Backend process stopped cleanly.');
					this._setStatus(SidecarStatus.STOPPED);
					resolve();
				}
			});

			try {
				child.kill('SIGTERM');
			} catch {
				killed = true;
				clearTimeout(forceKillTimer);
				this._setStatus(SidecarStatus.STOPPED);
				resolve();
			}
		});
	}

	/**
	 * Restarts the backend server.
	 */
	async restart(): Promise<void> {
		this._log('Restarting HPC Studio backend...');
		await this.stop();
		await this.start();
	}

	dispose(): void {
		this.stop().catch(() => {});
		this._statusChangeEmitter.dispose();
		this._outputChannel.dispose();
	}
}
