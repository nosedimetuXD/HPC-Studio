/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface HealthResponse {
	status: string;
	version: string;
	uptime_seconds: number;
	pid: number;
	started_at: string;
	system: {
		platform: string;
		release: string;
		machine: string;
		python: string;
	};
}

export interface WorkspaceResponse {
	workspace_path: string;
	exists: boolean;
	is_directory: boolean;
	stats: {
		top_level_files: number;
		top_level_directories: number;
		listed_entries: number;
	};
	environment: {
		python_executable: string;
		is_virtual_env: boolean;
		slurm_available: boolean;
		ssh_available: boolean;
		git_repo: boolean;
		cwd: string;
	};
	entries: Array<{
		name: string;
		is_dir: boolean;
		size: number;
		modified_at: number;
	}>;
}

export interface WebSocketMessage<T = unknown> {
	type: string;
	payload: T;
	timestamp?: number;
}

export type WebSocketListener = (message: WebSocketMessage) => void;

export class BackendClient {
	private _ws: WebSocket | null = null;
	private _wsListeners = new Set<WebSocketListener>();
	private _reconnectTimeout: NodeJS.Timeout | null = null;
	private _isClosedIntentionally = false;

	constructor(
		private readonly _getBaseUrl: () => string | null,
		private readonly _getToken: () => string | null
	) {}

	private _getAuthHeaders(): Record<string, string> {
		const token = this._getToken();
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};
		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}
		return headers;
	}

	async getHealth(): Promise<HealthResponse> {
		const baseUrl = this._getBaseUrl();
		if (!baseUrl) {
			throw new Error('HPC Studio backend is not running.');
		}

		const response = await fetch(`${baseUrl}/api/health`, {
			method: 'GET',
			headers: this._getAuthHeaders(),
		});

		if (!response.ok) {
			throw new Error(`Health check failed with status: ${response.status} ${response.statusText}`);
		}

		return (await response.json()) as HealthResponse;
	}

	async getWorkspace(): Promise<WorkspaceResponse> {
		const baseUrl = this._getBaseUrl();
		if (!baseUrl) {
			throw new Error('HPC Studio backend is not running.');
		}

		const response = await fetch(`${baseUrl}/api/workspace`, {
			method: 'GET',
			headers: this._getAuthHeaders(),
		});

		if (!response.ok) {
			throw new Error(`Workspace request failed with status: ${response.status} ${response.statusText}`);
		}

		return (await response.json()) as WorkspaceResponse;
	}

	async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
		const baseUrl = this._getBaseUrl();
		if (!baseUrl) {
			throw new Error('HPC Studio backend is not running.');
		}

		const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
		const headers = {
			...this._getAuthHeaders(),
			...(options.headers as Record<string, string> | undefined),
		};

		const response = await fetch(`${baseUrl}${normalizedEndpoint}`, {
			...options,
			headers,
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Request to ${endpoint} failed (${response.status}): ${errorText}`);
		}

		return (await response.json()) as T;
	}

	connectWebSocket(): void {
		this._isClosedIntentionally = false;
		if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
			return;
		}

		const baseUrl = this._getBaseUrl();
		const token = this._getToken();
		if (!baseUrl) {
			return;
		}

		try {
			const wsUrl = baseUrl.replace(/^http/, 'ws');
			const endpoint = token ? `${wsUrl}/ws/events?token=${encodeURIComponent(token)}` : `${wsUrl}/ws/events`;
			const ws = new WebSocket(endpoint);

			ws.onopen = () => {
				// Connected
			};

			ws.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data.toString()) as WebSocketMessage;
					for (const listener of this._wsListeners) {
						try {
							listener(data);
						} catch {
							// Ignore individual listener errors
						}
					}
				} catch {
					// Invalid JSON payload ignored
				}
			};

			ws.onerror = () => {
				// Error handled in close
			};

			ws.onclose = () => {
				this._ws = null;
				if (!this._isClosedIntentionally) {
					this._scheduleWsReconnect();
				}
			};

			this._ws = ws;
		} catch {
			this._scheduleWsReconnect();
		}
	}

	private _scheduleWsReconnect(): void {
		if (this._reconnectTimeout) {
			clearTimeout(this._reconnectTimeout);
		}
		this._reconnectTimeout = setTimeout(() => {
			this._reconnectTimeout = null;
			if (!this._isClosedIntentionally && this._getBaseUrl()) {
				this.connectWebSocket();
			}
		}, 3000);
	}

	sendWebSocketMessage(message: WebSocketMessage): boolean {
		if (this._ws && this._ws.readyState === WebSocket.OPEN) {
			this._ws.send(JSON.stringify(message));
			return true;
		}
		return false;
	}

	addWebSocketListener(listener: WebSocketListener): () => void {
		this._wsListeners.add(listener);
		return () => {
			this._wsListeners.delete(listener);
		};
	}

	disconnectWebSocket(): void {
		this._isClosedIntentionally = true;
		if (this._reconnectTimeout) {
			clearTimeout(this._reconnectTimeout);
			this._reconnectTimeout = null;
		}
		if (this._ws) {
			try {
				this._ws.close();
			} catch {
				// Ignore close error
			}
			this._ws = null;
		}
	}

	dispose(): void {
		this.disconnectWebSocket();
		this._wsListeners.clear();
	}
}
