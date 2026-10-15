/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Custom Editor Provider for 3D molecular and crystal structures (.cif, .xyz).
 * Implements vscode.CustomTextEditorProvider to support reactive live synchronization
 * with the underlying text document.
 */
export class Structure3DEditorProvider implements vscode.CustomTextEditorProvider {

	public static readonly viewType = 'hpc-studio.structure3dViewer';

	constructor(private readonly context: vscode.ExtensionContext) {}

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new Structure3DEditorProvider(context);
		const providerRegistration = vscode.window.registerCustomEditorProvider(
			Structure3DEditorProvider.viewType,
			provider,
			{
				webviewOptions: {
					retainContextWhenHidden: true
				},
				supportsMultipleEditorsPerDocument: false
			}
		);
		return providerRegistration;
	}

	/**
	 * Entry point called when a matching file (.cif, .xyz) is opened in the custom editor.
	 */
	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		// Setup Webview options and security policy
		const mediaUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'structure3d');
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [mediaUri]
		};

		// Set initial HTML content
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);

		// Synchronize document updates reactively
		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() === document.uri.toString()) {
				webviewPanel.webview.postMessage({
					type: 'update',
					text: document.getText(),
					filename: this.getFilename(document.uri)
				});
			}
		});

		// Listen to messages from webview
		const messageSubscription = webviewPanel.webview.onDidReceiveMessage(async (message) => {
			switch (message.command) {
				case 'ready': {
					webviewPanel.webview.postMessage({
						type: 'init',
						text: document.getText(),
						filename: this.getFilename(document.uri)
					});
					break;
				}
				case 'openAsText': {
					await this.openDocumentAsText(document.uri, webviewPanel.viewColumn);
					break;
				}
				case 'generateQEInput': {
					await this.generateQEInput(document, message.structure);
					break;
				}
				case 'alert': {
					vscode.window.showInformationMessage(message.text);
					break;
				}
			}
		});

		webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
			messageSubscription.dispose();
		});
	}

	private getFilename(uri: vscode.Uri): string {
		const parts = uri.path.split('/');
		return parts[parts.length - 1] || uri.fsPath;
	}

	/**
	 * Switches the active view column to the standard text editor for the file.
	 */
	private async openDocumentAsText(resource: vscode.Uri, viewColumn: vscode.ViewColumn | undefined): Promise<void> {
		await vscode.commands.executeCommand('vscode.openWith', resource, 'default', viewColumn);
	}

	/**
	 * Generates a template Quantum ESPRESSO input file (.in) from the structure data.
	 */
	private async generateQEInput(_document: vscode.TextDocument, structure: any): Promise<void> {
		if (!structure || !structure.atoms || structure.atoms.length === 0) {
			vscode.window.showWarningMessage('No atomic structure found to generate Quantum ESPRESSO input.');
			return;
		}

		const atoms: Array<{ element: string; x: number; y: number; z: number; fract?: [number, number, number] }> = structure.atoms;
		const cell = structure.cell;
		const uniqueSpecies = Array.from(new Set(atoms.map((a) => a.element)));

		let qeContent = `&CONTROL\n`;
		qeContent += `  calculation = 'scf',\n`;
		qeContent += `  restart_mode = 'from_scratch',\n`;
		qeContent += `  prefix = '${structure.title ? structure.title.toLowerCase().replace(/[^a-z0-9_]/g, '_') : 'structure'}',\n`;
		qeContent += `  pseudo_dir = './pseudo/',\n`;
		qeContent += `  outdir = './tmp/',\n`;
		qeContent += `/\n`;
		qeContent += `&SYSTEM\n`;
		qeContent += `  ibrav = ${cell ? 0 : 0},\n`;
		qeContent += `  nat = ${atoms.length},\n`;
		qeContent += `  ntyp = ${uniqueSpecies.length},\n`;
		qeContent += `  ecutwfc = 45.0,\n`;
		qeContent += `  ecutrho = 360.0,\n`;
		qeContent += `/\n`;
		qeContent += `&ELECTRONS\n`;
		qeContent += `  conv_thr = 1.0d-8,\n`;
		qeContent += `  mixing_beta = 0.7,\n`;
		qeContent += `/\n\n`;

		qeContent += `ATOMIC_SPECIES\n`;
		for (const sp of uniqueSpecies) {
			qeContent += `  ${sp.padEnd(4)} 1.000  ${sp}.pbe-n-kjpaw_psl.1.0.0.UPF\n`;
		}
		qeContent += `\n`;

		if (cell && cell.vectors) {
			qeContent += `CELL_PARAMETERS (angstrom)\n`;
			for (const vec of cell.vectors) {
				qeContent += `  ${vec[0].toFixed(6).padStart(12)} ${vec[1].toFixed(6).padStart(12)} ${vec[2].toFixed(6).padStart(12)}\n`;
			}
			qeContent += `\n`;

			qeContent += `ATOMIC_POSITIONS (crystal)\n`;
			for (const a of atoms) {
				const fx = a.fract ? a.fract[0] : 0;
				const fy = a.fract ? a.fract[1] : 0;
				const fz = a.fract ? a.fract[2] : 0;
				qeContent += `  ${a.element.padEnd(4)} ${fx.toFixed(6).padStart(10)} ${fy.toFixed(6).padStart(10)} ${fz.toFixed(6).padStart(10)}\n`;
			}
		} else {
			qeContent += `ATOMIC_POSITIONS (angstrom)\n`;
			for (const a of atoms) {
				qeContent += `  ${a.element.padEnd(4)} ${a.x.toFixed(6).padStart(10)} ${a.y.toFixed(6).padStart(10)} ${a.z.toFixed(6).padStart(10)}\n`;
			}
		}

		qeContent += `\nK_POINTS (automatic)\n`;
		qeContent += `  4 4 4 1 1 1\n`;

		// Open in an untitled document editor side-by-side
		const doc = await vscode.workspace.openTextDocument({
			language: 'quantum-espresso-input',
			content: qeContent
		});
		await vscode.window.showTextDocument(doc, {
			viewColumn: vscode.ViewColumn.Beside,
			preview: false
		});
		vscode.window.showInformationMessage('Generated Quantum ESPRESSO Input from 3D structure.');
	}

	/**
	 * Generates HTML with strict Content Security Policy and local URIs.
	 */
	private getHtmlForWebview(webview: vscode.Webview, document: vscode.TextDocument): string {
		const mediaUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'structure3d');
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'viewer.css'));
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'viewer.js'));

		const nonce = getNonce();
		const filename = this.getFilename(document.uri);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>HPC Studio 3D Structure Viewer</title>
	<link rel="stylesheet" href="${styleUri}">
</head>
<body>
	<div id="loading-overlay">
		<div class="spinner"></div>
		<div>Loading 3D Structure...</div>
	</div>

	<!-- Top Toolbar -->
	<header class="toolbar">
		<div class="toolbar-title">
			<svg class="toolbar-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
				<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.2a5.8 5.8 0 1 1 0 11.6 5.8 5.8 0 0 1 0-11.6zM8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/>
			</svg>
			<span>HPC 3D</span>
		</div>
		<button id="btn-toggle-cell" class="toolbar-btn active" title="Toggle Unit Cell Box">
			<svg class="toolbar-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
				<path d="M8.2 1.14a.5.5 0 0 0-.4 0l-6 3a.5.5 0 0 0-.3.45v6.82a.5.5 0 0 0 .3.45l6 3a.5.5 0 0 0 .4 0l6-3a.5.5 0 0 0 .3-.45V4.59a.5.5 0 0 0-.3-.45l-6-3zM8 2.12l5 2.5-5 2.5-5-2.5 5-2.5zM2.5 5.74l5 2.5v5.02l-5-2.5V5.74zm6 7.52V8.24l5-2.5v5.02l-5 2.5z"/>
			</svg>
			<span>Unit Cell</span>
		</button>
		<button id="btn-toggle-bonds" class="toolbar-btn active" title="Toggle Atomic Bonds">
			<svg class="toolbar-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
				<path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1 1 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4 4 0 0 1-.128-1.287z"/>
				<path d="M6.586 4.672A3 3 0 0 0 7.414 10.5l.586-.586a1 1 0 0 0 .154-.199 2 2 0 0 1-.86-3.337L9.12 4.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 0 0-4.243-4.243L6.586 4.672z"/>
			</svg>
			<span>Bonds</span>
		</button>
		<button id="btn-toggle-labels" class="toolbar-btn" title="Toggle Atom Labels">
			<svg class="toolbar-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
				<path d="M2 2a1 1 0 0 1 1-1h4.586a1 1 0 0 1 .707.293l6.414 6.414a1 1 0 0 1 0 1.414l-4.586 4.586a1 1 0 0 1-1.414 0L2.293 8.293A1 1 0 0 1 2 7.586V2zm3.5 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>
			</svg>
			<span>Labels</span>
		</button>
		<button id="btn-reset-cam" class="toolbar-btn" title="Reset Camera View">
			<svg class="toolbar-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
				<path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12zm0-2a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0-2a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
			</svg>
			<span>Reset</span>
		</button>
		<div class="toolbar-sep"></div>
		<button id="btn-view-text" class="toolbar-btn" title="Switch to Plain Text Editor">
			<svg class="toolbar-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
				<path d="M4 0h5.5v1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h1V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm6 0v4h4L10 0zM5 8h6v1H5V8zm0 2h4v1H5v-1zm0-4h3v1H5V6z"/>
			</svg>
			<span>Text</span>
		</button>
		<button id="btn-gen-qe" class="toolbar-btn primary" title="Generate Quantum ESPRESSO input file">
			<svg class="toolbar-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
				<path d="M7.5 1v5.5H3.75l5.25 8.5V9.5h3.75L7.5 1z"/>
			</svg>
			<span>Generate QE Input</span>
		</button>
	</header>

	<!-- Distance Measurement Banner -->
	<div id="distance-banner"></div>

	<!-- 3D Canvas Viewport -->
	<div id="viewport-container" tabindex="0"></div>

	<!-- Structure Overview Stats Panel -->
	<div id="stats-panel" class="overlay-panel">
		<div class="stats-title" id="stats-filename">${escapeHtml(filename)}</div>
		<div class="stats-row">
			<span>Formula:</span>
			<span class="stats-value" id="stats-formula">-</span>
		</div>
		<div class="stats-row">
			<span>Atoms:</span>
			<span class="stats-value" id="stats-atom-count">-</span>
		</div>
		<div class="stats-row" id="stats-cell-row">
			<span>Cell:</span>
			<span class="stats-value" id="stats-cell">-</span>
		</div>
	</div>

	<!-- Atom Detail Card -->
	<div id="atom-card" class="overlay-panel">
		<div class="card-header">
			<div class="card-title">
				<span id="atom-card-element" class="element-pill">C</span>
				<span id="atom-card-index">#1</span>
			</div>
			<div id="atom-card-close" class="card-close" title="Close">✕</div>
		</div>
		<div class="card-body">
			<div class="stats-row">
				<span>Cartesian:</span>
				<pre class="stats-value" id="atom-card-coords" style="margin:0;"></pre>
			</div>
			<div class="stats-row">
				<span>Fractional:</span>
				<span class="stats-value" id="atom-card-fract"></span>
			</div>
		</div>
	</div>

	<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function escapeHtml(unsafe: string): string {
	return unsafe
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}
