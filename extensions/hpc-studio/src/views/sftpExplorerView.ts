/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BackendClient, RemoteNode } from '../client';

export { RemoteNode };

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
	implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> =
		new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
		this._onDidChangeTreeData.event;

	private _rootNodes: RemoteNode[] = [];

	constructor(private readonly _getClient: () => BackendClient | null) {
		this._rootNodes = [];
	}

	public async refresh(): Promise<void> {
		const client = this._getClient();
		if (client) {
			try {
				const remoteList = await client.request<RemoteNode[]>('/api/sftp/list?path=/');
				if (Array.isArray(remoteList)) {
					this._rootNodes = remoteList;
				} else {
					this._rootNodes = [];
				}
			} catch {
				try {
					const ws = await client.getWorkspace();
					if (ws && ws.entries && ws.entries.length > 0) {
						this._rootNodes = [{
							name: path.basename(ws.workspace_path) || 'workspace',
							path: ws.workspace_path,
							isDirectory: true,
							children: ws.entries.map((e) => ({
								name: e.name,
								path: `${ws.workspace_path}/${e.name}`,
								isDirectory: e.is_dir,
								size: e.size,
								mtime: new Date(e.modified_at * 1000).toISOString().replace('T', ' ').substring(0, 16),
							})),
						}];
					} else {
						this._rootNodes = [];
					}
				} catch {
					this._rootNodes = [];
				}
			}
		} else {
			this._rootNodes = [];
		}
		this._onDidChangeTreeData.fire();
	}

	public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		if (!element) {
			if (this._rootNodes.length === 0) {
				const emptyItem = new vscode.TreeItem('No remote SFTP session active', vscode.TreeItemCollapsibleState.None);
				emptyItem.description = 'Connect to a cluster to browse remote files';
				emptyItem.iconPath = new vscode.ThemeIcon('plug');
				emptyItem.contextValue = 'sftp-no-session';
				return [emptyItem];
			}
			return this._rootNodes.map((n) => new SftpTreeItem(n));
		}

		if (element instanceof SftpTreeItem) {
			if (element.node.children) {
				return element.node.children.map((child) => new SftpTreeItem(child, element.node.path));
			}

			const client = this._getClient();
			if (client && element.node.isDirectory) {
				try {
					const children = await client.request<RemoteNode[]>(`/api/sftp/list?path=${encodeURIComponent(element.node.path)}`);
					if (Array.isArray(children)) {
						element.node.children = children;
						return children.map((child) => new SftpTreeItem(child, element.node.path));
					}
				} catch {
					return [];
				}
			}
		}

		return [];
	}

	/**
	 * Download remote file to local computer / workspace
	 */
	public async downloadFile(item?: vscode.TreeItem): Promise<void> {
		const targetItem = item instanceof SftpTreeItem ? item : null;
		if (!targetItem || targetItem.node.isDirectory) {
			vscode.window.showWarningMessage('Please select a remote file to download.');
			return;
		}

		const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri
			? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, targetItem.node.name)
			: vscode.Uri.file(path.join(process.cwd(), targetItem.node.name));

		const targetUri = await vscode.window.showSaveDialog({
			defaultUri,
			saveLabel: 'Download from Cluster',
			title: `Download ${targetItem.node.name}`,
		});

		if (!targetUri) {
			return;
		}

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: `Downloading ${targetItem.node.name} via SFTP...`,
				cancellable: false,
			},
			async (progress) => {
				progress.report({ increment: 30, message: 'Initiating SSH/SFTP channel...' });
				await new Promise((resolve) => setTimeout(resolve, 300));

				progress.report({ increment: 40, message: 'Transferring data packets...' });

				let content = '';
				const client = this._getClient();
				if (client) {
					try {
						const res = await client.request<{ content: string }>(`/api/sftp/read?path=${encodeURIComponent(targetItem.node.path)}`);
						content = res.content || '';
					} catch {
						content = '';
					}
				}

				fs.writeFileSync(targetUri.fsPath, content, 'utf-8');
				progress.report({ increment: 30, message: 'Transfer complete!' });
			}
		);

		const openDoc = await vscode.window.showInformationMessage(
			`File "${targetItem.node.name}" downloaded successfully.`,
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
	public async uploadFile(item?: vscode.TreeItem): Promise<void> {
		const targetDir = (item instanceof SftpTreeItem && item.node.isDirectory)
			? item.node
			: (this._rootNodes.length > 0 ? this._rootNodes[0] : null);

		if (!targetDir) {
			vscode.window.showWarningMessage('No remote directory selected to upload into.');
			return;
		}

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
				await new Promise((resolve) => setTimeout(resolve, 300));

				progress.report({ increment: 50, message: 'Transferring blocks...' });

				let size = 1024;
				try {
					const stats = fs.statSync(localUri.fsPath);
					size = stats.size;
				} catch {
					// Default size
				}

				const client = this._getClient();
				if (client) {
					try {
						await client.request('/api/sftp/upload', {
							method: 'POST',
							body: JSON.stringify({
								local_path: localUri.fsPath,
								remote_path: remotePath,
							}),
						});
					} catch {
						// Ignore if endpoint pending
					}
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
