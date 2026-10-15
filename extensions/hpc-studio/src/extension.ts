/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SidecarSupervisor, SidecarStatus } from './sidecar';
import { BackendClient } from './client';
import { HPCStatusBarItem } from './statusBar';
import { Structure3DEditorProvider } from './editors/structure3dEditor';
import { ClustersTreeDataProvider, ClusterTreeItem } from './views/clustersView';
import { SlurmQueueTreeDataProvider, SlurmJobTreeItem } from './views/slurmQueueView';
import { SftpExplorerTreeDataProvider, SftpTreeItem } from './views/sftpExplorerView';
import { AntigravityAgentBridge } from './agent/antigravityAgent';

let supervisor: SidecarSupervisor | null = null;
let client: BackendClient | null = null;
let agentBridge: AntigravityAgentBridge | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<{
	supervisor: SidecarSupervisor;
	client: BackendClient;
	clustersProvider: ClustersTreeDataProvider;
	slurmQueueProvider: SlurmQueueTreeDataProvider;
	sftpExplorerProvider: SftpExplorerTreeDataProvider;
}> {
	supervisor = new SidecarSupervisor();
	context.subscriptions.push(supervisor);

	client = new BackendClient(
		() => supervisor?.baseUrl ?? null,
		() => supervisor?.token ?? null
	);
	context.subscriptions.push(client);

	const statusBar = new HPCStatusBarItem(supervisor);
	context.subscriptions.push(statusBar);

	// Connect WebSocket when running, disconnect when stopped
	context.subscriptions.push(
		supervisor.onDidChangeStatus((status) => {
			if (status === SidecarStatus.RUNNING) {
				client?.connectWebSocket();
			} else {
				client?.disconnectWebSocket();
			}
		})
	);

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.startSidecar', async () => {
			try {
				await supervisor?.start();
				vscode.window.showInformationMessage(
					`HPC Studio backend started successfully (${supervisor?.baseUrl})`
				);
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				vscode.window.showErrorMessage(`Failed to start HPC Studio backend: ${msg}`, 'Show Logs').then((res) => {
					if (res === 'Show Logs') {
						supervisor?.showOutputChannel();
					}
				});
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.stopSidecar', async () => {
			try {
				await supervisor?.stop();
				vscode.window.showInformationMessage('HPC Studio backend stopped.');
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				vscode.window.showErrorMessage(`Failed to stop HPC Studio backend: ${msg}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.restartSidecar', async () => {
			try {
				await supervisor?.restart();
				vscode.window.showInformationMessage(
					`HPC Studio backend restarted successfully (${supervisor?.baseUrl})`
				);
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				vscode.window.showErrorMessage(`Failed to restart HPC Studio backend: ${msg}`, 'Show Logs').then((res) => {
					if (res === 'Show Logs') {
						supervisor?.showOutputChannel();
					}
				});
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.checkStatus', async () => {
			if (!supervisor) {
				return;
			}
			const details = supervisor.getDetails();

			if (details.status === SidecarStatus.RUNNING) {
				try {
					const health = await client?.getHealth();
					const info = [
						`Status: Online (${details.host}:${details.port})`,
						`PID: ${details.pid}`,
						`Version: ${health?.version ?? details.version ?? 'unknown'}`,
						`Uptime: ${health?.uptime_seconds ? `${health.uptime_seconds}s` : 'unknown'}`,
						`Python: ${health?.system.python ?? 'unknown'}`,
						`Platform: ${health?.system.platform ?? ''} (${health?.system.machine ?? ''})`,
						`Workspace: ${details.workspace ?? 'default'}`,
					].join('\n');

					vscode.window.showInformationMessage(`HPC Studio Backend Status:\n${info}`, 'Open API Docs').then((choice) => {
						if (choice === 'Open API Docs' && supervisor?.baseUrl) {
							vscode.env.openExternal(vscode.Uri.parse(`${supervisor.baseUrl}/docs`));
						}
					});
				} catch (err: unknown) {
					const msg = err instanceof Error ? err.message : String(err);
					vscode.window.showWarningMessage(`Backend is running but health check failed: ${msg}`);
				}
			} else {
				vscode.window.showInformationMessage(
					`HPC Studio Backend is ${details.status}.${details.error ? ` Reason: ${details.error}` : ''}`,
					'Start Backend',
					'Show Logs'
				).then((choice) => {
					if (choice === 'Start Backend') {
						vscode.commands.executeCommand('hpc-studio.startSidecar');
					} else if (choice === 'Show Logs') {
						supervisor?.showOutputChannel();
					}
				});
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.showQuickMenu', () => {
			return statusBar.showQuickMenu();
		})
	);

	// Register 3D Structure Viewer Custom Editor
	context.subscriptions.push(
		Structure3DEditorProvider.register(context)
	);

	// Register 3D Structure Viewer commands
	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.openIn3DViewer', async (uri?: vscode.Uri) => {
			const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
			if (targetUri) {
				await vscode.commands.executeCommand(
					'vscode.openWith',
					targetUri,
					Structure3DEditorProvider.viewType,
					vscode.ViewColumn.Active
				);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.open3DSideBySide', async (uri?: vscode.Uri) => {
			const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
			if (targetUri) {
				await vscode.commands.executeCommand(
					'vscode.openWith',
					targetUri,
					Structure3DEditorProvider.viewType,
					vscode.ViewColumn.Beside
				);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.reopenAsText', async (uri?: vscode.Uri) => {
			const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
			if (targetUri) {
				await vscode.commands.executeCommand(
					'vscode.openWith',
					targetUri,
					'default',
					vscode.ViewColumn.Active
				);
			}
		})
	);

	// Register Activity Bar Tree Data Providers & Views
	const clustersProvider = new ClustersTreeDataProvider(context);
	context.subscriptions.push(clustersProvider);
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('hpc-studio.clustersView', clustersProvider)
	);

	const slurmQueueProvider = new SlurmQueueTreeDataProvider(
		() => client,
		() => clustersProvider.getActiveCluster()
	);
	context.subscriptions.push(slurmQueueProvider);
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('hpc-studio.slurmQueueView', slurmQueueProvider)
	);

	const sftpExplorerProvider = new SftpExplorerTreeDataProvider(() => client);
	context.subscriptions.push(sftpExplorerProvider);
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('hpc-studio.sftpExplorerView', sftpExplorerProvider)
	);

	// Register Cluster Commands
	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.refreshClusters', () => {
			clustersProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.connectClusterTerminal', (item?: ClusterTreeItem) => {
			clustersProvider.connectClusterTerminal(item);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.pingCluster', async (item?: ClusterTreeItem) => {
			await clustersProvider.pingCluster(item);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.addCluster', async () => {
			await clustersProvider.addCluster();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.openTunnel', async (item?: ClusterTreeItem) => {
			await clustersProvider.openTunnel(item);
		})
	);

	// Register Slurm Queue Commands
	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.refreshSlurmQueue', async () => {
			await slurmQueueProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.submitJob', async () => {
			await slurmQueueProvider.submitJob();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.cancelJob', async (item?: SlurmJobTreeItem) => {
			await slurmQueueProvider.cancelJob(item);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.followJobLog', (item?: SlurmJobTreeItem) => {
			slurmQueueProvider.followJobLog(item);
		})
	);

	// Register SFTP Commands
	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.refreshSftp', () => {
			sftpExplorerProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.uploadFile', async (item?: SftpTreeItem) => {
			await sftpExplorerProvider.uploadFile(item);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hpc-studio.downloadFile', async (item?: SftpTreeItem) => {
			await sftpExplorerProvider.downloadFile(item);
		})
	);

	// Register Antigravity Agent Command
	agentBridge = new AntigravityAgentBridge();
	context.subscriptions.push(agentBridge);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'hpc-studio.invokeAntigravityAgent',
			async (prompt: string, sessionId?: string, workingDir?: string) => {
				if (!agentBridge) {
					agentBridge = new AntigravityAgentBridge();
					context.subscriptions.push(agentBridge);
				}
				return agentBridge.invoke(prompt, sessionId, workingDir);
			}
		)
	);

	// Auto-start backend if enabled
	const config = vscode.workspace.getConfiguration('hpc-studio');
	const autoStart = config.get<boolean>('autoStartSidecar', true);
	if (autoStart) {
		supervisor.start().catch((err: unknown) => {
			const msg = err instanceof Error ? err.message : String(err);
			supervisor?.showOutputChannel();
			vscode.window.showErrorMessage(`HPC Studio backend auto-start failed: ${msg}`);
		});
	}

	return {
		supervisor,
		client,
		clustersProvider,
		slurmQueueProvider,
		sftpExplorerProvider,
	};
}

export async function deactivate(): Promise<void> {
	if (agentBridge) {
		agentBridge.dispose();
		agentBridge = null;
	}
	if (client) {
		client.dispose();
		client = null;
	}
	if (supervisor) {
		await supervisor.stop();
		supervisor.dispose();
		supervisor = null;
	}
}
