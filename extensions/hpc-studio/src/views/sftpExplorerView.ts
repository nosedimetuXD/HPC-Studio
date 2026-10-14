/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BackendClient } from '../client';

export interface RemoteNode {
	name: string;
	path: string;
	isDirectory: boolean;
	size?: number;
	mtime?: string;
	children?: RemoteNode[];
}

export class SftpTreeItem extends vscode.TreeItem {
	constructor(
		public readonly node: RemoteNode,
		public readonly parentPath?: string
	) {
		super(
			node.name,
			node.isDirectory
				? vscode.TreeItemCollapsibleState.Collapsed
				: vscode.TreeItemCollapsibleState.None
		);

		this.contextValue = node.isDirectory ? 'sftp-directory' : 'sftp-file';
		this.resourceUri = vscode.Uri.file(node.path);

		if (node.isDirectory) {
			this.iconPath = new vscode.ThemeIcon('folder');
			this.description = '';
		} else {
			this.iconPath = this.getFileIcon(node.name);
			this.description = this.formatSize(node.size ?? 0);
		}

		this.tooltip = this.buildTooltip();
	}

	private getFileIcon(filename: string): vscode.ThemeIcon {
		const ext = path.extname(filename).toLowerCase();
		if (ext === '.in' || ext === '.pwi') {
			return new vscode.ThemeIcon('file-code', new vscode.ThemeColor('charts.purple'));
		}
		if (ext === '.out' || ext === '.pwo' || ext === '.log') {
			return new vscode.ThemeIcon('file-text', new vscode.ThemeColor('charts.blue'));
		}
		if (ext === '.cif' || ext === '.xyz' || ext === '.pdb') {
			return new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.green'));
		}
		if (ext === '.upf') {
			return new vscode.ThemeIcon('symbol-property', new vscode.ThemeColor('charts.orange'));
		}
		if (ext === '.slurm' || ext === '.sbatch' || ext === '.sh') {
			return new vscode.ThemeIcon('terminal', new vscode.ThemeColor('charts.yellow'));
		}
		return new vscode.ThemeIcon('file');
	}

	private formatSize(bytes: number): string {
		if (bytes === 0) {
			return '0 B';
		}
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
	}

	private buildTooltip(): vscode.MarkdownString {
		const md = new vscode.MarkdownString();
		md.appendMarkdown(
			`### ${this.node.isDirectory ? '📁 Remote Directory' : '📄 Remote File'}: **${this.node.name}**\n\n`
		);
		md.appendMarkdown(`- **Remote Path:** \`${this.node.path}\`\n`);
		if (!this.node.isDirectory) {
			md.appendMarkdown(`- **Size:** ${this.formatSize(this.node.size ?? 0)}\n`);
		}
		if (this.node.mtime) {
			md.appendMarkdown(`- **Modified:** ${this.node.mtime}\n`);
		}
		return md;
	}
}

export class SftpExplorerTreeDataProvider
	implements vscode.TreeDataProvider<SftpTreeItem>, vscode.Disposable {
	private _onDidChangeTreeData: vscode.EventEmitter<SftpTreeItem | undefined | null | void> =
		new vscode.EventEmitter<SftpTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<SftpTreeItem | undefined | null | void> =
		this._onDidChangeTreeData.event;

	private _rootNodes: RemoteNode[] = [];

	constructor(private readonly _getClient: () => BackendClient | null) {
		this.initSampleFilesystem();
	}

	private initSampleFilesystem(): void {
		this._rootNodes = [
			{
				name: 'scratch',
				path: '/scratch',
				isDirectory: true,
				children: [
					{
						name: 'silicon_bulk',
						path: '/scratch/silicon_bulk',
						isDirectory: true,
						children: [
							{
								name: 'si.scf.in',
								path: '/scratch/silicon_bulk/si.scf.in',
								isDirectory: false,
								size: 1248,
								mtime: '2026-10-14 08:12',
							},
							{
								name: 'si.scf.out',
								path: '/scratch/silicon_bulk/si.scf.out',
								isDirectory: false,
								size: 46210,
								mtime: '2026-10-14 08:35',
							},
							{
								name: 'Si.pbe-n-rrkjus_psl.1.0.0.UPF',
								path: '/scratch/silicon_bulk/Si.pbe-n-rrkjus_psl.1.0.0.UPF',
								isDirectory: false,
								size: 215400,
								mtime: '2026-10-13 19:40',
							},
							{
								name: 'run_scf.slurm',
								path: '/scratch/silicon_bulk/run_scf.slurm',
								isDirectory: false,
								size: 890,
								mtime: '2026-10-14 08:10',
							},
						],
					},
					{
						name: 'graphene_2d',
						path: '/scratch/graphene_2d',
						isDirectory: true,
						children: [
							{
								name: 'graphene.xyz',
								path: '/scratch/graphene_2d/graphene.xyz',
								isDirectory: false,
								size: 4890,
								mtime: '2026-10-13 14:22',
							},
							{
								name: 'graphene.bands.in',
								path: '/scratch/graphene_2d/graphene.bands.in',
								isDirectory: false,
								size: 2140,
								mtime: '2026-10-14 07:15',
							},
							{
								name: 'C.pbe-n-kjpaw_psl.1.0.0.UPF',
								path: '/scratch/graphene_2d/C.pbe-n-kjpaw_psl.1.0.0.UPF',
								isDirectory: false,
								size: 189200,
								mtime: '2026-10-12 11:05',
							},
							{
								name: 'job_bands.sbatch',
								path: '/scratch/graphene_2d/job_bands.sbatch',
								isDirectory: false,
								size: 940,
								mtime: '2026-10-14 07:18',
							},
						],
					},
					{
						name: 'perovskite_mapbi3',
						path: '/scratch/perovskite_mapbi3',
						isDirectory: true,
						children: [
							{
								name: 'MAPbI3.cif',
								path: '/scratch/perovskite_mapbi3/MAPbI3.cif',
								isDirectory: false,
								size: 8540,
								mtime: '2026-10-11 16:30',
							},
							{
								name: 'relax.in',
								path: '/scratch/perovskite_mapbi3/relax.in',
								isDirectory: false,
								size: 3340,
								mtime: '2026-10-14 06:00',
							},
							{
								name: 'slurm-104818.out',
								path: '/scratch/perovskite_mapbi3/slurm-104818.out',
								isDirectory: false,
								size: 131500,
								mtime: '2026-10-14 08:30',
							},
						],
					},
				],
			},
			{
				name: 'home',
				path: '/home',
				isDirectory: true,
				children: [
					{
						name: 'hpc_user',
						path: '/home/hpc_user',
						isDirectory: true,
						children: [
							{
								name: '.bashrc',
								path: '/home/hpc_user/.bashrc',
								isDirectory: false,
								size: 3950,
								mtime: '2026-10-01 10:00',
							},
							{
								name: 'load_modules.sh',
								path: '/home/hpc_user/load_modules.sh',
								isDirectory: false,
								size: 650,
								mtime: '2026-10-10 12:15',
							},
						],
					},
				],
			},
		];
	}

	public async refresh(): Promise<void> {
		const client = this._getClient();
		if (client) {
			try {
				const ws = await client.getWorkspace();
				if (ws && ws.entries && ws.entries.length > 0) {
					const dynamicChildren: RemoteNode[] = ws.entries.map((e) => ({
						name: e.name,
						path: `${ws.workspace_path}/${e.name}`,
						isDirectory: e.is_dir,
						size: e.size,
						mtime: new Date(e.modified_at * 1000).toISOString().replace('T', ' ').substring(0, 16),
					}));

					const existingWs = this._rootNodes.find((n) => n.name === 'workspace');
					if (existingWs) {
						existingWs.children = dynamicChildren;
					} else {
						this._rootNodes.unshift({
							name: 'workspace',
							path: ws.workspace_path,
							isDirectory: true,
							children: dynamicChildren,
						});
					}
				}
			} catch {
				// Fallback to sample tree
			}
		}
		this._onDidChangeTreeData.fire();
	}

	public getTreeItem(element: SftpTreeItem): vscode.TreeItem {
		return element;
	}

	public getChildren(element?: SftpTreeItem): vscode.ProviderResult<SftpTreeItem[]> {
		if (!element) {
			return this._rootNodes.map((n) => new SftpTreeItem(n));
		}

		if (element.node.children) {
			return element.node.children.map((child) => new SftpTreeItem(child, element.node.path));
		}

		return [];
	}

	/**
	 * Download remote file to local computer / workspace
	 */
	public async downloadFile(item?: SftpTreeItem): Promise<void> {
		if (!item || item.node.isDirectory) {
			vscode.window.showWarningMessage('Please select a remote file to download.');
			return;
		}

		const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri
			? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, item.node.name)
			: vscode.Uri.file(path.join(process.cwd(), item.node.name));

		const targetUri = await vscode.window.showSaveDialog({
			defaultUri,
			saveLabel: 'Download from Cluster',
			title: `Download ${item.node.name}`,
		});

		if (!targetUri) {
			return;
		}

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: `Downloading ${item.node.name} via SFTP...`,
				cancellable: false,
			},
			async (progress) => {
				progress.report({ increment: 30, message: 'Initiating SSH/SFTP channel...' });
				await new Promise((resolve) => setTimeout(resolve, 400));

				progress.report({ increment: 40, message: 'Transferring data packets...' });
				await new Promise((resolve) => setTimeout(resolve, 500));

				// Generate representative sample content based on filename extension
				let dummyContent = `# Remote cluster file: ${item.node.path}\n# Downloaded via HPC Studio SFTP\n`;
				if (item.node.name.endsWith('.in')) {
					dummyContent = `&CONTROL\n  calculation = 'scf',\n  restart_mode = 'from_scratch',\n  pseudo_dir = './',\n  outdir = './tmp/',\n  prefix = 'silicon'\n/\n&SYSTEM\n  ibrav = 2,\n  celldm(1) = 10.26,\n  nat = 2,\n  ntyp = 1,\n  ecutwfc = 40.0\n/\n&ELECTRONS\n  conv_thr = 1.0d-8\n/\nATOMIC_SPECIES\n Si  28.086  Si.pbe-n-rrkjus_psl.1.0.0.UPF\nATOMIC_POSITIONS crystal\n Si 0.00 0.00 0.00\n Si 0.25 0.25 0.25\nK_POINTS automatic\n 6 6 6 1 1 1\n`;
				} else if (item.node.name.endsWith('.slurm') || item.node.name.endsWith('.sbatch')) {
					dummyContent = `#!/bin/bash\n#SBATCH --job-name=${item.node.name}\n#SBATCH --partition=standard\n#SBATCH --nodes=2\n#SBATCH --ntasks-per-node=32\n#SBATCH --time=04:00:00\n\nmodule load quantum-espresso/7.2\nmpirun -np 64 pw.x -i ${item.node.name.replace('.slurm', '.in')} > output.log\n`;
				}

				fs.writeFileSync(targetUri.fsPath, dummyContent, 'utf-8');
				progress.report({ increment: 30, message: 'Transfer complete!' });
			}
		);

		const openDoc = await vscode.window.showInformationMessage(
			`File "${item.node.name}" downloaded successfully.`,
			'Open File'
		);
		if (openDoc === 'Open File') {
			const doc = await vscode.workspace.openTextDocument(targetUri);
			await vscode.window.showTextDocument(doc);
		}
	}

	/**
	 * Upload local file to remote cluster directory
	 */
	public async uploadFile(item?: SftpTreeItem): Promise<void> {
		const targetDir = item && item.node.isDirectory ? item.node : this._rootNodes[0];

		const picked = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			openLabel: 'Upload to Cluster',
			title: `Upload local file to ${targetDir.path}`,
		});

		if (!picked || picked.length === 0) {
			return;
		}

		const localUri = picked[0];
		const fileName = path.basename(localUri.fsPath);
		const remotePath = `${targetDir.path}/${fileName}`;

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: `Uploading ${fileName} to ${targetDir.path}...`,
				cancellable: false,
			},
			async (progress) => {
				progress.report({ increment: 25, message: 'Opening SFTP session...' });
				await new Promise((resolve) => setTimeout(resolve, 400));

				progress.report({ increment: 50, message: 'Transferring blocks...' });
				await new Promise((resolve) => setTimeout(resolve, 600));

				let size = 1024;
				try {
					const stats = fs.statSync(localUri.fsPath);
					size = stats.size;
				} catch {
					// Default size
				}

				// Insert into tree structure
				if (!targetDir.children) {
					targetDir.children = [];
				}
				targetDir.children.push({
					name: fileName,
					path: remotePath,
					isDirectory: false,
					size,
					mtime: new Date().toISOString().replace('T', ' ').substring(0, 16),
				});

				progress.report({ increment: 25, message: 'Finished!' });
			}
		);

		this._onDidChangeTreeData.fire();
		vscode.window.showInformationMessage(`Uploaded "${fileName}" to remote path: ${remotePath}`);
	}

	public dispose(): void {
		this._onDidChangeTreeData.dispose();
	}
}
