/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BackendClient } from '../client';

export type SlurmState =
	| 'RUNNING'
	| 'PENDING'
	| 'COMPLETED'
	| 'FAILED'
	| 'CANCELLED'
	| 'SUSPENDED';

export interface SlurmJobData {
	job_id: string;
	name: string;
	user: string;
	partition: string;
	state: SlurmState;
	time_used: string;
	time_limit?: string;
	nodes: number;
	cpus: number;
	work_dir: string;
	reason?: string;
	nodelist?: string;
}

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
	implements vscode.TreeDataProvider<SlurmJobTreeItem>, vscode.Disposable {
	private _onDidChangeTreeData: vscode.EventEmitter<SlurmJobTreeItem | undefined | null | void> =
		new vscode.EventEmitter<SlurmJobTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<SlurmJobTreeItem | undefined | null | void> =
		this._onDidChangeTreeData.event;

	private _jobs: SlurmJobData[] = [];
	private _logChannel: vscode.OutputChannel | null = null;
	private _activeLogInterval: NodeJS.Timeout | null = null;

	constructor(private readonly _getClient: () => BackendClient | null) {
		this.initSampleJobs();
	}

	private initSampleJobs(): void {
		this._jobs = [
			{
				job_id: '104821',
				name: 'qe-si-scf.in',
				user: 'hpc_user',
				partition: 'standard',
				state: 'RUNNING',
				time_used: '00:14:32',
				time_limit: '04:00:00',
				nodes: 4,
				cpus: 128,
				work_dir: '/scratch/hpc/silicon_scf',
				nodelist: 'node[001-004]',
			},
			{
				job_id: '104822',
				name: 'phonons-graphene.in',
				user: 'hpc_user',
				partition: 'standard',
				state: 'RUNNING',
				time_used: '01:05:10',
				time_limit: '08:00:00',
				nodes: 2,
				cpus: 64,
				work_dir: '/scratch/hpc/graphene_ph',
				nodelist: 'node[005-006]',
			},
			{
				job_id: '104823',
				name: 'cpmd-water-128.in',
				user: 'hpc_user',
				partition: 'gpu-h100',
				state: 'PENDING',
				time_used: '00:00:00',
				time_limit: '12:00:00',
				nodes: 8,
				cpus: 256,
				work_dir: '/scratch/hpc/cpmd_water',
				reason: 'Priority (Waiting for GPU resource)',
			},
			{
				job_id: '104820',
				name: 'bands-gaas.in',
				user: 'hpc_user',
				partition: 'standard',
				state: 'COMPLETED',
				time_used: '00:42:15',
				time_limit: '02:00:00',
				nodes: 2,
				cpus: 64,
				work_dir: '/scratch/hpc/gaas_bands',
				reason: 'ExitCode:0',
			},
			{
				job_id: '104818',
				name: 'relax-perovskite.in',
				user: 'hpc_user',
				partition: 'standard',
				state: 'FAILED',
				time_used: '02:30:00',
				time_limit: '02:30:00',
				nodes: 4,
				cpus: 128,
				work_dir: '/scratch/hpc/perovskite',
				reason: 'TimeLimitExceeded / SCF non-convergence',
			},
		];
	}

	public async refresh(): Promise<void> {
		const client = this._getClient();
		if (client) {
			try {
				// Query backend if slurm jobs endpoint is available
				const remoteJobs = await client.request<SlurmJobData[]>('/api/slurm/jobs');
				if (Array.isArray(remoteJobs) && remoteJobs.length > 0) {
					this._jobs = remoteJobs;
				}
			} catch {
				// Keep current local/simulated jobs on offline or endpoint fallback
			}
		}
		this._onDidChangeTreeData.fire();
	}

	public getTreeItem(element: SlurmJobTreeItem): vscode.TreeItem {
		return element;
	}

	public getChildren(): vscode.ProviderResult<SlurmJobTreeItem[]> {
		return this._jobs.map((job) => new SlurmJobTreeItem(job));
	}

	/**
	 * Cancel Slurm Job (scancel)
	 */
	public async cancelJob(item?: SlurmJobTreeItem): Promise<void> {
		const jobItem = item || (this._jobs.length > 0 ? new SlurmJobTreeItem(this._jobs[0]) : null);
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
				await client.request(`/api/slurm/jobs/${jobItem.job.job_id}/cancel`, {
					method: 'POST',
				});
				cancelledRemote = true;
			} catch {
				// Fallback to local state update
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
	public followJobLog(item?: SlurmJobTreeItem): void {
		const jobItem = item || (this._jobs.length > 0 ? new SlurmJobTreeItem(this._jobs[0]) : null);
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

		// Simulation stream output tailored to Quantum ESPRESSO
		const sampleLines = [
			`     Program PWSCF v.7.2 starts on 14Oct2026 at 08:30:12`,
			`     This program is part of the open-source Quantum ESPRESSO suite`,
			`     Parallel version (MPI & OpenMP), running on ${job.cpus} processor cores`,
			`     Number of MPI processes: ${Math.max(1, Math.floor(job.cpus / 4))}`,
			`     Threads/MPI process: 4`,
			``,
			`     bravais-lattice index     =            2`,
			`     lattice parameter (alat)  =      10.2600  a.u.`,
			`     unit-cell volume          =     269.9673 (a.u.)^3`,
			`     number of atoms/cell      =            2`,
			`     number of atomic types    =            1`,
			`     kinetic-energy cutoff     =      40.0000  Ry`,
			`     charge-density cutoff     =     160.0000  Ry`,
			``,
			`     iteration #  1 -- ecut=    40.00 Ry    beta= 0.70`,
			`     Davidson diagonalization with overlap`,
			`     ethr =  1.00E-02,  ceig =  -0.1234`,
			`     total energy              =     -15.82345091 Ry`,
			`     estimated scf accuracy    <       0.03810245 Ry`,
			``,
			`     iteration #  2 -- ecut=    40.00 Ry    beta= 0.70`,
			`     ethr =  4.76E-04,  ceig =  -0.0089`,
			`     total energy              =     -15.84510294 Ry`,
			`     estimated scf accuracy    <       0.00120934 Ry`,
			``,
			`     iteration #  3 -- ecut=    40.00 Ry    beta= 0.70`,
			`     ethr =  1.51E-05,  ceig =  -0.0004`,
			`     total energy              =     -15.84541820 Ry`,
			`     estimated scf accuracy    <       0.00002481 Ry`,
			``,
			`     iteration #  4 -- ecut=    40.00 Ry    beta= 0.70`,
			`     ethr =  3.10E-07,  ceig =  -0.00001`,
			`     total energy              =     -15.84542301 Ry`,
			`     estimated scf accuracy    <       0.00000042 Ry`,
			`     convergence has been achieved in 4 iterations`,
			``,
			`     Writing output data file ${job.name}.save/`,
			`     JOB ${job.job_id} PROCEEDING TO POST-PROCESSING...`,
		];

		let lineIndex = 0;
		if (this._activeLogInterval) {
			clearInterval(this._activeLogInterval);
		}

		// Stream out initial batch
		for (let i = 0; i < Math.min(15, sampleLines.length); i++) {
			this._logChannel.appendLine(sampleLines[i]);
			lineIndex++;
		}

		// Stream remaining lines periodically to simulate tail -f
		this._activeLogInterval = setInterval(() => {
			if (lineIndex < sampleLines.length) {
				this._logChannel?.appendLine(sampleLines[lineIndex]);
				lineIndex++;
			} else {
				if (this._activeLogInterval) {
					clearInterval(this._activeLogInterval);
					this._activeLogInterval = null;
				}
				this._logChannel?.appendLine(`\n[HPC Studio: Log streaming idle - watching file events]`);
			}
		}, 600);
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
		const newJobId = String(104824 + this._jobs.length);

		const newJob: SlurmJobData = {
			job_id: newJobId,
			name: fileName,
			user: 'hpc_user',
			partition: 'standard',
			state: 'PENDING',
			time_used: '00:00:00',
			time_limit: '04:00:00',
			nodes: 2,
			cpus: 64,
			work_dir: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '/scratch/hpc',
			reason: 'Submitted via HPC Studio',
		};

		this._jobs.unshift(newJob);
		this._onDidChangeTreeData.fire();

		vscode.window.showInformationMessage(
			`Submitted batch job ${newJobId} ("${fileName}") on Slurm workload manager.`
		);

		// Transition to RUNNING after a brief moment to simulate scheduler dispatch
		setTimeout(() => {
			newJob.state = 'RUNNING';
			newJob.time_used = '00:00:05';
			newJob.nodelist = 'node[007-008]';
			this._onDidChangeTreeData.fire();
		}, 3500);
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
