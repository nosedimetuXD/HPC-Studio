/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SidecarSupervisor, SidecarStatus } from './sidecar';

export class HPCStatusBarItem implements vscode.Disposable {
	private _item: vscode.StatusBarItem;
	private _disposables: vscode.Disposable[] = [];

	constructor(private readonly _sidecar: SidecarSupervisor) {
		this._item = vscode.window.createStatusBarItem(
			'hpc-studio.statusBar',
			vscode.StatusBarAlignment.Right,
			100
		);
		this._item.name = 'HPC Studio Backend Status';
		this._item.command = 'hpc-studio.showQuickMenu';

		this._disposables.push(
			this._sidecar.onDidChangeStatus((status) => {
				this._updateStatus(status);
			})
		);

		this._updateStatus(this._sidecar.status);
		this._item.show();
	}

	private _updateStatus(status: SidecarStatus): void {
		switch (status) {
			case SidecarStatus.STARTING:
				this._item.text = '$(sync~spin) HPC Backend: Starting...';
				this._item.tooltip = 'HPC Studio backend is starting up... Click for options';
				this._item.backgroundColor = undefined;
				break;

			case SidecarStatus.RUNNING: {
				const port = this._sidecar.port ? `:${this._sidecar.port}` : '';
				this._item.text = `$(server-process) HPC Backend: Online (${port})`;
				this._item.tooltip = `HPC Studio backend is active at ${this._sidecar.baseUrl}\nClick for options and diagnostics`;
				this._item.backgroundColor = undefined;
				break;
			}

			case SidecarStatus.ERROR:
				this._item.text = '$(error) HPC Backend: Error';
				this._item.tooltip = `HPC Studio backend encountered an error: ${this._sidecar.getDetails().error ?? 'Unknown error'}\nClick to view options`;
				this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
				break;

			case SidecarStatus.STOPPED:
			default:
				this._item.text = '$(error) HPC Backend: Offline';
				this._item.tooltip = 'HPC Studio backend is currently offline. Click to start or configure.';
				this._item.backgroundColor = undefined;
				break;
		}
	}

	async showQuickMenu(): Promise<void> {
		const status = this._sidecar.status;
		const details = this._sidecar.getDetails();

		interface MenuItem extends vscode.QuickPickItem {
			action: () => Thenable<unknown> | void;
		}

		const items: MenuItem[] = [];

		if (status === SidecarStatus.RUNNING) {
			items.push({
				label: '$(info) Show Backend Status',
				description: `${details.host}:${details.port} (PID ${details.pid})`,
				action: () => vscode.commands.executeCommand('hpc-studio.checkStatus'),
			});
			items.push({
				label: '$(debug-restart) Restart Backend Server',
				description: 'Gracefully restart Python sidecar process',
				action: () => vscode.commands.executeCommand('hpc-studio.restartSidecar'),
			});
			items.push({
				label: '$(stop-circle) Stop Backend Server',
				description: 'Terminate Python sidecar process',
				action: () => vscode.commands.executeCommand('hpc-studio.stopSidecar'),
			});
		} else if (status === SidecarStatus.STARTING) {
			items.push({
				label: '$(sync~spin) Starting Backend...',
				description: 'Process is currently launching',
				action: () => this._sidecar.showOutputChannel(),
			});
		} else {
			items.push({
				label: '$(play) Start Backend Server',
				description: 'Launch Python sidecar process',
				action: () => vscode.commands.executeCommand('hpc-studio.startSidecar'),
			});
		}

		items.push({
			label: '$(output) Show Backend Logs',
			description: 'Open output channel with live logs',
			action: () => this._sidecar.showOutputChannel(),
		});

		items.push({
			label: '$(gear) Configure HPC Studio',
			description: 'Open Settings for interpreter and ports',
			action: () => vscode.commands.executeCommand('workbench.action.openSettings', 'hpc-studio'),
		});

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: `HPC Studio Backend (${status})`,
		});

		if (selected) {
			await selected.action();
		}
	}

	dispose(): void {
		this._item.dispose();
		for (const d of this._disposables) {
			d.dispose();
		}
		this._disposables = [];
	}
}
