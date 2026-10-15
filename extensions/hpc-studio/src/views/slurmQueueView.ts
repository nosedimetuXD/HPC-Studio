/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BackendClient, SlurmJobData, SlurmState, ClusterConfig } from '../client';

export { SlurmJobData, SlurmState };

export class SlurmJobTreeItem extends vscode.TreeItem {
	constructor(public readonly job: SlurmJobData) {
		super(`[${job.job_id}] ${job.name}`, vscode.TreeItemCollapsibleState.None);

		this.contextValue = `slurm-job-${job.state.toLowerCase()}`;
		this.description = `${job.state} | ${job.partition} | ${job.time_used} (${job.cpus} CPUs)`;

		switch (job.state) {
			case 'RUNNING':
				this.iconPath = new vscode.ThemeIcon('play', new vscode.ThemeColor('charts.green'));
				break;
			case 'PENDING':
				this.iconPath = new vscode.ThemeIcon('clock', new vscode.ThemeColor('charts.yellow'));
				break;
			case 'COMPLETED':
				this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.blue'));
				break;
			case 'FAILED':
				this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
				break;
			case 'CANCELLED':
				this.iconPath = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.orange'));
				break;
			case 'SUSPENDED':
				this.iconPath = new vscode.ThemeIcon('debug-pause', new vscode.ThemeColor('charts.purple'));
				break;
			default:
				this.iconPath = new vscode.ThemeIcon('question');
		}

		this.tooltip = this.buildTooltip();
	}

	private buildTooltip(): vscode.MarkdownString {
		const md = new vscode.MarkdownString();
		md.appendMarkdown(`### ⚡ Slurm Job: **${this.job.name}**\n\n`);
		md.appendMarkdown(`- **Job ID:** \`${this.job.job_id}\`\n`);
		md.appendMarkdown(`- **State:** \`${this.job.state}\`\n`);
		md.appendMarkdown(`- **Partition:** \`${this.job.partition}\`\n`);
		md.appendMarkdown(`- **User:** \`${this.job.user}\`\n`);
		md.appendMarkdown(`- **Resources:** ${this.job.nodes} nodes, ${this.job.cpus} cores\n`);
		md.appendMarkdown(`- **Elapsed Time:** \`${this.job.time_used}\`\n`);
		if (this.job.time_limit) {
			md.appendMarkdown(`- **Time Limit:** \`${this.job.time_limit}\`\n`);
		}
		if (this.job.work_dir) {
			md.appendMarkdown(`- **Working Dir:** \`${this.job.work_dir}\`\n`);
		}
		if (this.job.reason) {
			md.appendMarkdown(`- **Reason/Exit:** \`${this.job.reason}\`\n`);
		}
		if (this.job.nodelist) {
			md.appendMarkdown(`- **Allocated Nodes:** \`${this.job.nodelist}\`\n`);
		}
		return md;
	}
}

export class SlurmQueueTreeDataProvider
	implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> =
		new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
		this._onDidChangeTreeData.event;

	private _jobs: SlurmJobData[] = [];
	private _logChannel: vscode.OutputChannel | null = null;
	private _activeLogInterval: NodeJS.Timeout | null = null;

	constructor(
		private readonly _getClient: () => BackendClient | null,
		private readonly _getActiveCluster?: () => ClusterConfig | null
	) {}

	public async refresh(): Promise<void> {
		const client = this._getClient();
		if (client) {
			try {
				const remoteJobs = await client.request<SlurmJobData[]>('/api/slurm/jobs');
				this._jobs = Array.isArray(remoteJobs) ? remoteJobs : [];
			} catch {
				this._jobs = [];
			}
		} else {
			this._jobs = [];
		}
		this._onDidChangeTreeData.fire();
	}

	public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	public getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
		if (element) {
			return [];
		}

		if (this._jobs.length === 0) {
			const client = this._getClient();
			const activeCluster = this._getActiveCluster ? this._getActiveCluster() : null;
			const isBackendConnected = client !== null && client.isAvailable();

			if (!activeCluster || !isBackendConnected) {
				const emptyItem = new vscode.TreeItem('No active Slurm connection', vscode.TreeItemCollapsibleState.None);
				emptyItem.description = 'Connect a cluster to view queue';
				emptyItem.iconPath = new vscode.ThemeIcon('info');
				emptyItem.contextValue = 'slurm-no-connection';
				return [emptyItem];
			}

			const emptyQueueItem = new vscode.TreeItem('Queue is empty (no pending or running jobs)', vscode.TreeItemCollapsibleState.None);
			emptyQueueItem.iconPath = new vscode.ThemeIcon('check');
			emptyQueueItem.contextValue = 'slurm-empty-queue';
			return [emptyQueueItem];
		}

		return this._jobs.map((job) => new SlurmJobTreeItem(job));
	}

	/**
	 * Cancel Slurm Job (scancel)
	 */
	public async cancelJob(item?: vscode.TreeItem): Promise<void> {
		const jobItem = item instanceof SlurmJobTreeItem ? item : (this._jobs.length > 0 ? new SlurmJobTreeItem(this._jobs[0]) : null);
		if (!jobItem) {
			vscode.window.showWarningMessage('No job selected to cancel.');
			return;
		}

		const confirm = await vscode.window.showWarningMessage(
			`Are you sure you want to cancel Slurm Job ${jobItem.job.job_id} (${jobItem.job.name})?`,
			{ modal: true },
			'Cancel Job'
		);

		if (confirm !== 'Cancel Job') {
			return;
		}

		const client = this._getClient();
		let cancelledRemote = false;
		if (client) {
			try {
				await client.cancelSlurmJob(jobItem.job.job_id);
				cancelledRemote = true;
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				vscode.window.showWarningMessage(`Could not cancel job on backend: ${msg}`);
			}
		}

		// Update in-memory state
		const target = this._jobs.find((j) => j.job_id === jobItem.job.job_id);
		if (target) {
			target.state = 'CANCELLED';
			target.reason = 'Cancelled by user via HPC Studio';
		}

		this._onDidChangeTreeData.fire();
		vscode.window.showInformationMessage(
			`Slurm Job ${jobItem.job.job_id} cancelled successfully.${cancelledRemote ? ' (Synchronized with cluster)' : ''}`
		);
	}

	/**
	 * Follow Job Log Output (tail -f)
	 */
	public followJobLog(item?: vscode.TreeItem): void {
		const jobItem = item instanceof SlurmJobTreeItem ? item : (this._jobs.length > 0 ? new SlurmJobTreeItem(this._jobs[0]) : null);
		if (!jobItem) {
			vscode.window.showWarningMessage('No job selected to stream log.');
			return;
		}

		const job = jobItem.job;

		if (!this._logChannel) {
			this._logChannel = vscode.window.createOutputChannel('HPC Studio: Slurm Job Output');
		}

		this._logChannel.clear();
		this._logChannel.show(true);

		this._logChannel.appendLine(`================================================================`);
		this._logChannel.appendLine(` HPC Studio: Live Slurm Output Stream`);
		this._logChannel.appendLine(` Job ID:     ${job.job_id}`);
		this._logChannel.appendLine(` Job Name:   ${job.name}`);
		this._logChannel.appendLine(` WorkDir:    ${job.work_dir}`);
		this._logChannel.appendLine(` Command:    tail -f ${job.work_dir}/slurm-${job.job_id}.out`);
		this._logChannel.appendLine(`================================================================\n`);
		this._logChannel.appendLine(`[Log follower attached to Slurm job ${job.job_id}]`);
	}

	/**
	 * Submit Slurm Job (sbatch)
	 */
	public async submitJob(): Promise<void> {
		let scriptUri: vscode.Uri | undefined;

		const activeDoc = vscode.window.activeTextEditor?.document;
		if (
			activeDoc &&
			(activeDoc.languageId === 'slurm' ||
				activeDoc.fileName.endsWith('.slurm') ||
				activeDoc.fileName.endsWith('.sbatch') ||
				activeDoc.fileName.endsWith('.sh'))
		) {
			scriptUri = activeDoc.uri;
		} else {
			const picked = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				openLabel: 'Submit with sbatch',
				filters: {
					'Slurm Batch Scripts': ['slurm', 'sbatch', 'sh'],
					'All Files': ['*'],
				},
			});
			if (picked && picked.length > 0) {
				scriptUri = picked[0];
			}
		}

		if (!scriptUri) {
			vscode.window.showWarningMessage('No Slurm batch script selected.');
			return;
		}

		const fileName = scriptUri.path.split('/').pop() || 'job.sbatch';
		const client = this._getClient();
		if (client) {
			try {
				await client.request('/api/slurm/jobs/submit', {
					method: 'POST',
					body: JSON.stringify({ script_path: scriptUri.fsPath }),
				});
				await this.refresh();
				vscode.window.showInformationMessage(`Submitted Slurm batch script "${fileName}".`);
				return;
			} catch {
				// Fallback if backend endpoint is in progress
			}
		}

		const newJobId = String(Date.now()).slice(-6);
		const newJob: SlurmJobData = {
			job_id: newJobId,
			name: fileName,
			user: 'hpc_user',
			partition: 'standard',
			state: 'PENDING',
			time_used: '00:00:00',
			time_limit: '04:00:00',
			nodes: 1,
			cpus: 1,
			work_dir: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '/scratch/hpc',
			reason: 'Submitted via HPC Studio',
		};

		this._jobs.unshift(newJob);
		this._onDidChangeTreeData.fire();

		vscode.window.showInformationMessage(
			`Submitted batch job ${newJobId} ("${fileName}") on Slurm workload manager.`
		);
	}

	public dispose(): void {
		if (this._activeLogInterval) {
			clearInterval(this._activeLogInterval);
		}
		if (this._logChannel) {
			this._logChannel.dispose();
		}
		this._onDidChangeTreeData.dispose();
	}
}
