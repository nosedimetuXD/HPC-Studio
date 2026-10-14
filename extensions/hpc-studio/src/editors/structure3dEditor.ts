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
			<span style="font-size: 14px;">⚛️</span>
			<span>HPC 3D</span>
		</div>
		<button id="btn-toggle-cell" class="toolbar-btn active" title="Toggle Unit Cell Box">
			<span>📦 Unit Cell</span>
		</button>
		<button id="btn-toggle-bonds" class="toolbar-btn active" title="Toggle Atomic Bonds">
			<span>🔗 Bonds</span>
		</button>
		<button id="btn-toggle-labels" class="toolbar-btn" title="Toggle Atom Labels">
			<span>🏷️ Labels</span>
		</button>
		<button id="btn-reset-cam" class="toolbar-btn" title="Reset Camera View">
			<span>🎯 Reset</span>
		</button>
		<div class="toolbar-sep"></div>
		<button id="btn-view-text" class="toolbar-btn" title="Switch to Plain Text Editor">
			<span>📄 View as Text</span>
		</button>
		<button id="btn-gen-qe" class="toolbar-btn primary" title="Generate Quantum ESPRESSO input file">
			<span>⚡ Generate QE Input</span>
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
