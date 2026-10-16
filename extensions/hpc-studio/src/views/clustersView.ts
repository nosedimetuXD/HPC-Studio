/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';
import { ClusterConfig } from '../client';

export { ClusterConfig } from '../client';

export const QUANTUM_MOBILE_PRESET: ClusterConfig = {
	name: 'Quantum Mobile (VirtualBox)',
	hostname: '127.0.0.1',
	port: 2222,
	user: 'max',
	description: 'Local simulation VM for materials science (Quantum ESPRESSO, AiiDA, Slurm)',
};

export type ClusterItemType = 'cluster' | 'cluster-detail';

export class ClusterTreeItem extends vscode.TreeItem {
	public latencyMs: number | null = null;
	public isOnline: boolean | null = null;

	constructor(
		public readonly cluster: ClusterConfig,
		public readonly itemType: ClusterItemType = 'cluster',
		public readonly detailKey?: string,
		public readonly detailValue?: string
	) {
		super(
			itemType === 'cluster' ? cluster.name : `${detailKey}: ${detailValue}`,
			itemType === 'cluster'
				? vscode.TreeItemCollapsibleState.Collapsed
				: vscode.TreeItemCollapsibleState.None
		);

		if (itemType === 'cluster') {
			this.contextValue = 'cluster-node';
			const userInfo = cluster.user ? `${cluster.user}@` : '';
			const portInfo = cluster.port && cluster.port !== 22 ? `:${cluster.port}` : '';
			this.description = `${userInfo}${cluster.hostname}${portInfo}`;
			const isVM = cluster.hostname === '127.0.0.1' && cluster.port === 2222;
			this.iconPath = new vscode.ThemeIcon(isVM ? 'vm' : 'server');
			this.updateTooltip();
		} else {
			this.contextValue = 'cluster-detail';
			if (detailKey === 'Host') {
				this.iconPath = new vscode.ThemeIcon('globe');
			} else if (detailKey === 'User') {
				this.iconPath = new vscode.ThemeIcon('account');
			} else if (detailKey === 'Port') {
				this.iconPath = new vscode.ThemeIcon('plug');
			} else if (detailKey === 'Latency') {
				this.iconPath = new vscode.ThemeIcon('pulse');
			} else if (detailKey === 'Key') {
				this.iconPath = new vscode.ThemeIcon('key');
			} else {
				this.iconPath = new vscode.ThemeIcon('info');
			}
		}
	}

	public setPingResult(latencyMs: number, online: boolean): void {
		this.latencyMs = latencyMs;
		this.isOnline = online;
		const userInfo = this.cluster.user ? `${this.cluster.user}@` : '';
		const portInfo = this.cluster.port && this.cluster.port !== 22 ? `:${this.cluster.port}` : '';
		this.description = `${userInfo}${this.cluster.hostname}${portInfo} (${latencyMs}ms)`;
		const isVM = this.cluster.hostname === '127.0.0.1' && this.cluster.port === 2222;
		if (isVM) {
			this.iconPath = online
				? new vscode.ThemeIcon('vm-running', new vscode.ThemeColor('charts.green'))
				: new vscode.ThemeIcon('vm', new vscode.ThemeColor('charts.red'));
		} else {
			this.iconPath = online
				? new vscode.ThemeIcon('server-process', new vscode.ThemeColor('charts.green'))
				: new vscode.ThemeIcon('server', new vscode.ThemeColor('charts.red'));
		}
		this.updateTooltip();
	}

	private updateTooltip(): void {
		const md = new vscode.MarkdownString();
		md.appendMarkdown(`### 🖥️ Cluster: **${this.cluster.name}**\n\n`);
		md.appendMarkdown(`- **HostName:** \`${this.cluster.hostname}\`\n`);
		md.appendMarkdown(`- **User:** \`${this.cluster.user || 'current user'}\`\n`);
		md.appendMarkdown(`- **Port:** \`${this.cluster.port || 22}\`\n`);
		if (this.cluster.identityFile) {
			md.appendMarkdown(`- **Identity Key:** \`${this.cluster.identityFile}\`\n`);
		}
		if (this.cluster.proxyJump) {
			md.appendMarkdown(`- **ProxyJump:** \`${this.cluster.proxyJump}\`\n`);
		}
		if (this.latencyMs !== null) {
			const status = this.isOnline ? 'Online' : 'Unreachable';
			md.appendMarkdown(`- **Status:** ${status} (${this.latencyMs} ms)\n`);
		}
		if (this.cluster.description) {
			md.appendMarkdown(`\n*${this.cluster.description}*`);
		}
		this.tooltip = md;
	}
}

export class ClustersTreeDataProvider
	implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> =
		new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
		this._onDidChangeTreeData.event;

	private _clusters: ClusterTreeItem[] = [];
	private _activeCluster: ClusterConfig | null = null;
	private _disposables: vscode.Disposable[] = [];

	constructor(private readonly _context: vscode.ExtensionContext) {
		this.loadClusters();
		// Watch configuration changes
		this._disposables.push(
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration('hpc-studio.clusters')) {
					this.loadClusters();
				}
			})
		);
	}

	public getActiveCluster(): ClusterConfig | null {
		return this._activeCluster || (this._clusters.length > 0 ? this._clusters[0].cluster : null);
	}

	public setActiveCluster(cluster: ClusterConfig): void {
		this._activeCluster = cluster;
		this._context.workspaceState.update('activeClusterName', cluster.name);
		this._onDidChangeTreeData.fire();
	}

	public refresh(): void {
		this.loadClusters();
	}

	public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	public getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
		if (!element) {
			if (this._clusters.length === 0) {
				const qmItem = new vscode.TreeItem(
					'Connect to Quantum Mobile (VirtualBox / Docker)...',
					vscode.TreeItemCollapsibleState.None
				);
				qmItem.iconPath = new vscode.ThemeIcon('vm');
				qmItem.command = {
					command: 'hpc-studio.addQuantumMobile',
					title: 'Connect to Quantum Mobile (VirtualBox / Docker)...',
				};
				qmItem.tooltip = 'Quick connect to local Quantum Mobile VM or Docker container (127.0.0.1:2222, user: max)';
				qmItem.contextValue = 'add-quantum-mobile-prompt';

				const customItem = new vscode.TreeItem(
					'Add Custom Remote Cluster...',
					vscode.TreeItemCollapsibleState.None
				);
				customItem.iconPath = new vscode.ThemeIcon('add');
				customItem.command = {
					command: 'hpc-studio.addCluster',
					title: 'Add Custom Remote Cluster...',
				};
				customItem.tooltip = 'Click to add a custom remote HPC cluster (SSH).';
				customItem.contextValue = 'add-cluster-prompt';

				return [qmItem, customItem];
			}
			return this._clusters;
		}

		// Children for an individual cluster (details list)
		if (element instanceof ClusterTreeItem && element.itemType === 'cluster') {
			const c = element.cluster;
			const details: ClusterTreeItem[] = [];

			details.push(new ClusterTreeItem(c, 'cluster-detail', 'Host', c.hostname));
			details.push(new ClusterTreeItem(c, 'cluster-detail', 'User', c.user || os.userInfo().username));
			details.push(new ClusterTreeItem(c, 'cluster-detail', 'Port', String(c.port || 22)));
			if (element.latencyMs !== null) {
				details.push(new ClusterTreeItem(c, 'cluster-detail', 'Latency', `${element.latencyMs} ms`));
			}
			if (c.identityFile) {
				details.push(new ClusterTreeItem(c, 'cluster-detail', 'Key', c.identityFile));
			}
			if (c.proxyJump) {
				details.push(new ClusterTreeItem(c, 'cluster-detail', 'ProxyJump', c.proxyJump));
			}

			return details;
		}

		return [];
	}

	private loadClusters(): void {
		const result: ClusterConfig[] = [];

		// 1. Read ~/.ssh/config if available
		const sshClusters = this.parseSSHConfig();
		result.push(...sshClusters);

		// 2. Read from VS Code configuration
		const config = vscode.workspace.getConfiguration('hpc-studio');
		const configuredClusters = config.get<ClusterConfig[]>('clusters', []);
		for (const cc of configuredClusters) {
			// Avoid duplicate names
			if (!result.some((r) => r.name.toLowerCase() === cc.name.toLowerCase())) {
				result.push(cc);
			}
		}

		this._clusters = result.map((c) => new ClusterTreeItem(c));
		const savedName = this._context.workspaceState.get<string>('activeClusterName');
		const savedMatch = savedName ? this._clusters.find((c) => c.cluster.name === savedName) : null;
		if (savedMatch) {
			this._activeCluster = savedMatch.cluster;
		} else if (this._clusters.length > 0) {
			this._activeCluster = this._clusters[0].cluster;
		} else {
			this._activeCluster = null;
		}
		this._onDidChangeTreeData.fire();
	}

	private parseSSHConfig(): ClusterConfig[] {
		const sshConfigPath = path.join(os.homedir(), '.ssh', 'config');
		if (!fs.existsSync(sshConfigPath)) {
			return [];
		}

		try {
			const content = fs.readFileSync(sshConfigPath, 'utf-8');
			const lines = content.split(/\r?\n/);
			const clusters: ClusterConfig[] = [];
			let currentCluster: Partial<ClusterConfig> | null = null;

			for (const rawLine of lines) {
				const line = rawLine.trim();
				if (!line || line.startsWith('#')) {
					continue;
				}

				const matchHost = line.match(/^Host\s+(.+)$/i);
				if (matchHost) {
					if (currentCluster && currentCluster.name && currentCluster.hostname) {
						clusters.push(this.finalizeSSHCluster(currentCluster));
					}

					const hostPattern = matchHost[1].trim();
					// Skip global wildcards
					if (hostPattern === '*' || hostPattern.includes('*')) {
						currentCluster = null;
						continue;
					}

					currentCluster = {
						name: hostPattern,
						hostname: hostPattern,
					};
					continue;
				}

				if (!currentCluster) {
					continue;
				}

				const parts = line.split(/\s+/);
				const directive = parts[0].toLowerCase();
				const value = parts.slice(1).join(' ').replace(/^["']|["']$/g, '');

				switch (directive) {
					case 'hostname':
						currentCluster.hostname = value;
						break;
					case 'user':
						currentCluster.user = value;
						break;
					case 'port':
						currentCluster.port = parseInt(value, 10) || 22;
						break;
					case 'identityfile':
						currentCluster.identityFile = value;
						break;
					case 'proxyjump':
						currentCluster.proxyJump = value;
						break;
				}
			}

			if (currentCluster && currentCluster.name && currentCluster.hostname) {
				clusters.push(this.finalizeSSHCluster(currentCluster));
			}

			return clusters;
		} catch (err) {
			console.error('Error parsing ~/.ssh/config:', err);
			return [];
		}
	}

	private finalizeSSHCluster(c: Partial<ClusterConfig>): ClusterConfig {
		return {
			name: c.name || 'Remote Cluster',
			hostname: c.hostname || 'localhost',
			user: c.user,
			port: c.port || 22,
			identityFile: c.identityFile,
			proxyJump: c.proxyJump,
			description: 'Discovered from ~/.ssh/config',
		};
	}

	/**
	 * Measure ping / latency to host and port using TCP handshake
	 */
	public async pingCluster(item?: ClusterTreeItem): Promise<void> {
		const targetItem = item || this._clusters[0];
		if (!targetItem) {
			vscode.window.showWarningMessage('No cluster selected to ping.');
			return;
		}

		const cluster = targetItem.cluster;
		const port = cluster.port || 22;
		const host = cluster.hostname;

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: `Pinging cluster ${cluster.name} (${host}:${port})...`,
				cancellable: false,
			},
			async () => {
				const start = Date.now();
				const socket = new net.Socket();
				let finished = false;

				const cleanup = () => {
					if (!finished) {
						finished = true;
						socket.destroy();
					}
				};

				return new Promise<void>((resolve) => {
					socket.setTimeout(2500);

					socket.connect(port, host, () => {
						const latency = Date.now() - start;
						cleanup();
						targetItem.setPingResult(latency, true);
						this._onDidChangeTreeData.fire(targetItem);
						vscode.window.showInformationMessage(
							`Cluster "${cluster.name}" is ONLINE (${latency} ms).`
						);
						resolve();
					});

					socket.on('timeout', () => {
						cleanup();
						targetItem.setPingResult(2500, false);
						this._onDidChangeTreeData.fire(targetItem);
						vscode.window.showWarningMessage(
							`Cluster "${cluster.name}" connection timed out (${host}:${port}).`
						);
						resolve();
					});

					socket.on('error', (err) => {
						cleanup();
						targetItem.setPingResult(0, false);
						this._onDidChangeTreeData.fire(targetItem);
						vscode.window.showErrorMessage(
							`Cluster "${cluster.name}" unreachable: ${err.message}`
						);
						resolve();
					});
				});
			}
		);
	}

	/**
	 * Open integrated terminal connected via SSH to the cluster
	 */
	public connectClusterTerminal(item?: ClusterTreeItem): void {
		const targetItem = item || this._clusters[0];
		if (!targetItem) {
			vscode.window.showWarningMessage('No cluster available to connect.');
			return;
		}

		const cluster = targetItem.cluster;
		const userPart = cluster.user ? `${cluster.user}@` : '';
		const portPart = cluster.port && cluster.port !== 22 ? ` -p ${cluster.port}` : '';
		const keyPart = cluster.identityFile ? ` -i "${cluster.identityFile}"` : '';
		const proxyPart = cluster.proxyJump ? ` -J "${cluster.proxyJump}"` : '';
		const sshCommand = `ssh ${userPart}${cluster.hostname}${portPart}${keyPart}${proxyPart}`;

		const terminalName = `HPC: ${cluster.name}`;
		const existingTerminal = vscode.window.terminals.find((t) => t.name === terminalName);
		const terminal = existingTerminal || vscode.window.createTerminal({ name: terminalName });

		terminal.show();
		terminal.sendText(`echo "=== Connecting to HPC Cluster: ${cluster.name} ==="`);
		if (cluster.hostname === '127.0.0.1' && cluster.port === 2222) {
			terminal.sendText(`echo "💡 Tip: Default Quantum Mobile credentials -> user: max, password: moritz"`);
		}
		terminal.sendText(sshCommand);
		this.setActiveCluster(cluster);
	}

	/**
	 * Open SSH Tunnel (port forwarding)
	 */
	public async openTunnel(item?: ClusterTreeItem): Promise<void> {
		const targetItem = item || this._clusters[0];
		if (!targetItem) {
			vscode.window.showWarningMessage('No cluster selected.');
			return;
		}

		const cluster = targetItem.cluster;
		const localPortInput = await vscode.window.showInputBox({
			prompt: 'Enter local port to bind (e.g. 8888 for Jupyter, 8080 for web server)',
			value: '8888',
			validateInput: (v) => (!isNaN(Number(v)) && Number(v) > 0 ? null : 'Enter a valid port number'),
		});
		if (!localPortInput) {
			return;
		}

		const remotePortInput = await vscode.window.showInputBox({
			prompt: `Enter remote port on ${cluster.name} to forward to`,
			value: localPortInput,
			validateInput: (v) => (!isNaN(Number(v)) && Number(v) > 0 ? null : 'Enter a valid port number'),
		});
		if (!remotePortInput) {
			return;
		}

		const userPart = cluster.user ? `${cluster.user}@` : '';
		const portPart = cluster.port && cluster.port !== 22 ? ` -p ${cluster.port}` : '';
		const tunnelCmd = `ssh -N -L ${localPortInput}:localhost:${remotePortInput} ${userPart}${cluster.hostname}${portPart}`;

		const terminal = vscode.window.createTerminal({
			name: `HPC Tunnel [${cluster.name}:${localPortInput}]`,
		});
		terminal.show();
		terminal.sendText(
			`echo "=== Establishing SSH Tunnel: localhost:${localPortInput} -> ${cluster.name}:${remotePortInput} ==="`
		);
		terminal.sendText(tunnelCmd);
		vscode.window.showInformationMessage(
			`SSH tunnel launched: localhost:${localPortInput} -> ${cluster.name}:${remotePortInput}`
		);
	}

	/**
	 * Add or connect to Quantum Mobile preset
	 */
	public async addQuantumMobile(): Promise<void> {
		const preset = { ...QUANTUM_MOBILE_PRESET };

		const isOnline = await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Checking Quantum Mobile VM connectivity (127.0.0.1:2222)...',
				cancellable: false,
			},
			async () => {
				return await this.testTcpPort(preset.hostname, preset.port || 2222, 2500);
			}
		);

		const savePreset = async (): Promise<ClusterTreeItem | undefined> => {
			const config = vscode.workspace.getConfiguration('hpc-studio');
			const existing = config.get<ClusterConfig[]>('clusters', []);
			const updated = [
				...existing.filter(
					(c) => c.name !== preset.name && !(c.hostname === preset.hostname && c.port === preset.port)
				),
				preset,
			];
			await config.update('clusters', updated, vscode.ConfigurationTarget.Global);
			this.loadClusters();
			const created = this._clusters.find((c) => c.cluster.name === preset.name);
			if (created) {
				this.setActiveCluster(created.cluster);
			}
			return created;
		};

		if (isOnline) {
			const item = await savePreset();
			const choice = await vscode.window.showInformationMessage(
				`Quantum Mobile VM detected ONLINE (127.0.0.1:2222)! Added to your clusters.`,
				'Connect Terminal Now',
				'View Setup Guide'
			);
			if (choice === 'Connect Terminal Now') {
				this.connectClusterTerminal(item);
			} else if (choice === 'View Setup Guide') {
				this.openQuantumMobileGuide();
			}
		} else {
			const choice = await vscode.window.showWarningMessage(
				`Quantum Mobile VM is not responding on 127.0.0.1:2222.\n\nMake sure the VM is running in VirtualBox with Port Forwarding (Host 2222 -> Guest 22) or Docker is running.`,
				{ modal: true },
				'Add Anyway',
				'Open Setup Guide'
			);

			if (choice === 'Add Anyway') {
				await savePreset();
				vscode.window.showInformationMessage(
					`Quantum Mobile preset added. Once your VM is started in VirtualBox, connect from the Remote Clusters view.`
				);
			} else if (choice === 'Open Setup Guide') {
				this.openQuantumMobileGuide();
			}
		}
	}

	private testTcpPort(host: string, port: number, timeoutMs = 2500): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			const socket = new net.Socket();
			let finished = false;

			const done = (result: boolean) => {
				if (!finished) {
					finished = true;
					socket.destroy();
					resolve(result);
				}
			};

			socket.setTimeout(timeoutMs);
			socket.once('connect', () => done(true));
			socket.once('timeout', () => done(false));
			socket.once('error', () => done(false));

			try {
				socket.connect(port, host);
			} catch {
				done(false);
			}
		});
	}

	private _guidePanel: vscode.WebviewPanel | null = null;

	/**
	 * Open the Quantum Mobile Setup and Troubleshooting Guide webview
	 */
	public openQuantumMobileGuide(): void {
		if (this._guidePanel) {
			this._guidePanel.reveal(vscode.ViewColumn.Active);
			return;
		}

		this._guidePanel = vscode.window.createWebviewPanel(
			'hpc-studio.quantumMobileGuide',
			'Quantum Mobile Setup Guide',
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			}
		);

		this._guidePanel.webview.html = this.getQuantumMobileGuideHtml();

		this._guidePanel.onDidDispose(() => {
			this._guidePanel = null;
		});

		this._guidePanel.webview.onDidReceiveMessage(async (message) => {
			switch (message.command) {
				case 'addQuantumMobile':
					await this.addQuantumMobile();
					break;
				case 'connectTerminal': {
					const qmItem = this._clusters.find(
						(c) => c.cluster.hostname === '127.0.0.1' && c.cluster.port === 2222
					);
					if (qmItem) {
						this.connectClusterTerminal(qmItem);
					} else {
						await this.addQuantumMobile();
					}
					break;
				}
				case 'openExternal':
					if (message.url) {
						vscode.env.openExternal(vscode.Uri.parse(message.url));
					}
					break;
			}
		});
	}

	private getQuantumMobileGuideHtml(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Quantum Mobile Setup Guide</title>
	<style>
		body {
			font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
			color: var(--vscode-editor-foreground);
			background-color: var(--vscode-editor-background);
			line-height: 1.6;
			padding: 24px;
			max-width: 900px;
			margin: 0 auto;
		}
		h1 {
			font-size: 1.8rem;
			font-weight: 600;
			margin-bottom: 6px;
			display: flex;
			align-items: center;
			gap: 10px;
			color: var(--vscode-foreground);
		}
		.subtitle {
			font-size: 1.05rem;
			color: var(--vscode-descriptionForeground);
			margin-bottom: 24px;
		}
		.badge-row {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			margin-bottom: 24px;
		}
		.badge {
			display: inline-block;
			padding: 3px 10px;
			border-radius: 12px;
			font-size: 0.8rem;
			font-weight: 500;
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
		}
		.card {
			background: var(--vscode-sideBar-background, rgba(127, 127, 127, 0.08));
			border: 1px solid var(--vscode-widget-border, rgba(127, 127, 127, 0.2));
			border-radius: 8px;
			padding: 20px;
			margin-bottom: 24px;
		}
		.card h2 {
			font-size: 1.25rem;
			margin-top: 0;
			margin-bottom: 12px;
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.specs-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
			gap: 12px;
			margin-top: 14px;
		}
		.spec-item {
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-widget-border, rgba(127, 127, 127, 0.15));
			border-radius: 6px;
			padding: 10px 14px;
		}
		.spec-label {
			font-size: 0.78rem;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--vscode-descriptionForeground);
		}
		.spec-value {
			font-size: 1.05rem;
			font-weight: 600;
			color: var(--vscode-textLink-foreground);
			font-family: var(--vscode-editor-font-family, monospace);
		}
		pre, code {
			font-family: var(--vscode-editor-font-family, Consolas, Monaco, monospace);
		}
		pre {
			background: var(--vscode-textCodeBlock-background, rgba(0, 0, 0, 0.2));
			border: 1px solid var(--vscode-widget-border, rgba(127, 127, 127, 0.2));
			border-radius: 6px;
			padding: 12px 16px;
			overflow-x: auto;
			margin: 10px 0;
		}
		code {
			background: var(--vscode-textCodeBlock-background, rgba(0, 0, 0, 0.15));
			padding: 2px 5px;
			border-radius: 4px;
		}
		pre code {
			background: transparent;
			padding: 0;
		}
		ol, ul {
			padding-left: 20px;
		}
		li {
			margin-bottom: 8px;
		}
		.btn-group {
			display: flex;
			gap: 12px;
			margin-top: 16px;
			flex-wrap: wrap;
		}
		button {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 4px;
			padding: 8px 16px;
			font-size: 0.9rem;
			font-weight: 500;
			cursor: pointer;
			display: inline-flex;
			align-items: center;
			gap: 6px;
			transition: background-color 0.15s ease;
		}
		button:hover {
			background: var(--vscode-button-hoverBackground);
		}
		button.secondary {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
		button.secondary:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}
		.tip-box {
			border-left: 4px solid var(--vscode-charts-blue, #3794ff);
			background: var(--vscode-textBlockQuote-background, rgba(55, 148, 255, 0.1));
			padding: 12px 16px;
			margin: 16px 0;
			border-radius: 0 6px 6px 0;
		}
	</style>
</head>
<body>
	<h1>📦 Quantum Mobile Setup & Connectivity Guide</h1>
	<div class="subtitle">Quick setup guide for running Quantum ESPRESSO, AiiDA, and Slurm locally via VirtualBox, Docker, or WSL2.</div>

	<div class="badge-row">
		<span class="badge">Quantum ESPRESSO 7.x</span>
		<span class="badge">AiiDA</span>
		<span class="badge">Slurm Workload Manager</span>
		<span class="badge">Wannier90</span>
		<span class="badge">Yambo</span>
		<span class="badge">Fleur</span>
		<span class="badge">CP2K</span>
	</div>

	<div class="card">
		<h2>🔑 Default Connection Credentials</h2>
		<div class="specs-grid">
			<div class="spec-item">
				<div class="spec-label">Host</div>
				<div class="spec-value">127.0.0.1</div>
			</div>
			<div class="spec-item">
				<div class="spec-label">SSH Port Forward</div>
				<div class="spec-value">2222 &rarr; 22</div>
			</div>
			<div class="spec-item">
				<div class="spec-label">Username</div>
				<div class="spec-value">max</div>
			</div>
			<div class="spec-item">
				<div class="spec-label">Password</div>
				<div class="spec-value">moritz</div>
			</div>
		</div>
		<div class="btn-group">
			<button id="btnAddPreset">⚡ Test Connection & Add Preset</button>
			<button id="btnConnectTerminal" class="secondary">💻 Open SSH Terminal</button>
			<button id="btnOpenDocs" class="secondary">🌐 Official Materials Cloud Appliance</button>
		</div>
	</div>

	<div class="card">
		<h2>🖥️ VirtualBox Setup (Windows, macOS Intel, Linux)</h2>
		<ol>
			<li><strong>Download Quantum Mobile appliance:</strong> Get the latest <code>.ova</code> image from <a href="#" id="linkMcDownload">Materials Cloud Quantum Mobile</a>.</li>
			<li><strong>Import into VirtualBox:</strong> Open Oracle VirtualBox &rarr; <em>File</em> &rarr; <em>Import Appliance...</em> and select the <code>.ova</code> file.</li>
			<li><strong>Configure SSH Port Forwarding:</strong>
				<ul>
					<li>Select the imported VM &rarr; click <strong>Settings</strong> &rarr; <strong>Network</strong>.</li>
					<li>Ensure <strong>Adapter 1</strong> is attached to <strong>NAT</strong>.</li>
					<li>Click <strong>Advanced</strong> &rarr; <strong>Port Forwarding</strong>.</li>
					<li>Add a new rule:
						<ul>
							<li><strong>Name:</strong> <code>SSH</code></li>
							<li><strong>Protocol:</strong> <code>TCP</code></li>
							<li><strong>Host IP:</strong> <code>127.0.0.1</code></li>
							<li><strong>Host Port:</strong> <code>2222</code></li>
							<li><strong>Guest IP:</strong> <em>(leave blank)</em></li>
							<li><strong>Guest Port:</strong> <code>22</code></li>
						</ul>
					</li>
				</ul>
				<div class="tip-box">
					<strong>Terminal / CLI Shortcut (All OS):</strong> If you prefer the command line, run:
					<pre><code>VBoxManage modifyvm "quantum-mobile-24.04" --natpf1 "guestssh,tcp,127.0.0.1,2222,,22"</code></pre>
				</div>
			</li>
			<li><strong>Start the Virtual Machine:</strong> Click <strong>Start</strong> (or Headless Start). Wait for the boot process to complete.</li>
			<li><strong>Connect:</strong> Click <em>Test Connection & Add Preset</em> above or open an integrated terminal with <code>ssh max@127.0.0.1 -p 2222</code> (password: <code>moritz</code>).</li>
		</ol>
	</div>

	<div class="card">
		<h2>🐳 Docker Alternative (Linux, macOS Apple Silicon, Windows)</h2>
		<p>For Apple Silicon (M1/M2/M3/M4) or containerized workflows, you can run Quantum Mobile via Docker:</p>
		<pre><code>docker run -d --name quantum-mobile \\
  -p 2222:22 -p 8888:8888 \\
  -e USER_PASS=moritz \\
  materialscloud/quantum-mobile:latest</code></pre>
		<p>Once the container is healthy, SSH to port <code>2222</code> will route directly into the container.</p>
	</div>

	<div class="card">
		<h2>🐧 WSL2 Integration (Windows)</h2>
		<p>If you run Quantum ESPRESSO and Slurm inside Windows Subsystem for Linux (WSL2):</p>
		<ol>
			<li>Start SSH server inside WSL2: <code>sudo service ssh start</code></li>
			<li>If running on port 22 inside WSL2, forward port 2222 to port 22, or connect directly to <code>127.0.0.1:22</code>.</li>
		</ol>
	</div>

	<script>
		const vscode = acquireVsCodeApi();

		document.getElementById('btnAddPreset').addEventListener('click', () => {
			vscode.postMessage({ command: 'addQuantumMobile' });
		});

		document.getElementById('btnConnectTerminal').addEventListener('click', () => {
			vscode.postMessage({ command: 'connectTerminal' });
		});

		document.getElementById('btnOpenDocs').addEventListener('click', () => {
			vscode.postMessage({
				command: 'openExternal',
				url: 'https://materialscloud.org/work/quantum-mobile'
			});
		});

		document.getElementById('linkMcDownload').addEventListener('click', (e) => {
			e.preventDefault();
			vscode.postMessage({
				command: 'openExternal',
				url: 'https://materialscloud.org/work/quantum-mobile'
			});
		});
	</script>
</body>
</html>`;
	}

	/**
	 * Add custom cluster profile
	 */
	public async addCluster(): Promise<void> {
		const choice = await vscode.window.showQuickPick(
			[
				{
					label: '$(vm) Quantum Mobile (VirtualBox / Docker)',
					description: '127.0.0.1:2222 (user: max)',
					detail: 'Local simulation VM with Quantum ESPRESSO, AiiDA, and Slurm pre-installed',
					id: 'qm',
				},
				{
					label: '$(server) Custom Remote HPC Cluster',
					description: 'Hostname, User, Port & SSH Key',
					detail: 'Configure a remote supercomputing cluster via SSH login node',
					id: 'custom',
				},
			],
			{
				placeHolder: 'Select cluster configuration method',
			}
		);

		if (!choice) {
			return;
		}

		if (choice.id === 'qm') {
			return this.addQuantumMobile();
		}

		const name = await vscode.window.showInputBox({
			prompt: 'Cluster display name (e.g. Laboratory Supercomputer)',
			placeHolder: 'My HPC Cluster',
			validateInput: (v) => (v.trim().length > 0 ? null : 'Name cannot be empty'),
		});
		if (!name) {
			return;
		}

		const hostname = await vscode.window.showInputBox({
			prompt: 'Hostname or IP address of the cluster login node',
			placeHolder: 'login.cluster.hpc.edu',
			validateInput: (v) => (v.trim().length > 0 ? null : 'Hostname cannot be empty'),
		});
		if (!hostname) {
			return;
		}

		const user = await vscode.window.showInputBox({
			prompt: 'SSH Username (optional)',
			placeHolder: os.userInfo().username,
			value: os.userInfo().username,
		});

		const portStr = await vscode.window.showInputBox({
			prompt: 'SSH Port',
			value: '22',
			validateInput: (v) => (!isNaN(Number(v)) && Number(v) > 0 ? null : 'Enter a valid port number'),
		});
		const port = portStr ? parseInt(portStr, 10) : 22;

		const identityFile = await vscode.window.showInputBox({
			prompt: 'Path to Private Key file (optional, leave empty for default SSH keys)',
			placeHolder: '~/.ssh/id_rsa',
		});

		const newCluster: ClusterConfig = {
			name: name.trim(),
			hostname: hostname.trim(),
			user: user?.trim() || undefined,
			port,
			identityFile: identityFile?.trim() || undefined,
		};

		const config = vscode.workspace.getConfiguration('hpc-studio');
		const existing = config.get<ClusterConfig[]>('clusters', []);
		const updated = [...existing.filter((c) => c.name !== newCluster.name), newCluster];
		await config.update('clusters', updated, vscode.ConfigurationTarget.Global);

		this.loadClusters();
		vscode.window.showInformationMessage(`Cluster "${newCluster.name}" added successfully.`);
	}

	public dispose(): void {
		if (this._guidePanel) {
			this._guidePanel.dispose();
			this._guidePanel = null;
		}
		this._disposables.forEach((d) => d.dispose());
		this._onDidChangeTreeData.dispose();
	}
}
