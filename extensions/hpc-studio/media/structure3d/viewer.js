// @ts-check
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

// CPK Color and Radius Database
const ELEMENT_DATA = {
	H:  { color: 0xFFFFFF, hex: '#FFFFFF', radius: 0.32, covRadius: 0.31 },
	He: { color: 0xD9FFFF, hex: '#D9FFFF', radius: 0.35, covRadius: 0.28 },
	Li: { color: 0xCC80FF, hex: '#CC80FF', radius: 0.68, covRadius: 1.28 },
	Be: { color: 0xC2FF00, hex: '#C2FF00', radius: 0.50, covRadius: 0.96 },
	B:  { color: 0xFFB5B5, hex: '#FFB5B5', radius: 0.55, covRadius: 0.84 },
	C:  { color: 0x333333, hex: '#333333', radius: 0.55, covRadius: 0.76 },
	N:  { color: 0x3050F8, hex: '#3050F8', radius: 0.55, covRadius: 0.71 },
	O:  { color: 0xFF0D0D, hex: '#FF0D0D', radius: 0.50, covRadius: 0.66 },
	F:  { color: 0x90E050, hex: '#90E050', radius: 0.45, covRadius: 0.57 },
	Ne: { color: 0xB3E3F5, hex: '#B3E3F5', radius: 0.45, covRadius: 0.58 },
	Na: { color: 0xAB5CF2, hex: '#AB5CF2', radius: 0.75, covRadius: 1.66 },
	Mg: { color: 0x8AFF00, hex: '#8AFF00', radius: 0.65, covRadius: 1.41 },
	Al: { color: 0xBFA6A6, hex: '#BFA6A6', radius: 0.65, covRadius: 1.21 },
	Si: { color: 0xF0C870, hex: '#F0C870', radius: 0.65, covRadius: 1.11 },
	P:  { color: 0xFF8000, hex: '#FF8000', radius: 0.60, covRadius: 1.07 },
	S:  { color: 0xFFFF30, hex: '#FFFF30', radius: 0.60, covRadius: 1.05 },
	Cl: { color: 0x1FF01F, hex: '#1FF01F', radius: 0.60, covRadius: 1.02 },
	Ar: { color: 0x80D1E3, hex: '#80D1E3', radius: 0.55, covRadius: 1.06 },
	K:  { color: 0x8F40D4, hex: '#8F40D4', radius: 0.90, covRadius: 2.03 },
	Ca: { color: 0x3DFF00, hex: '#3DFF00', radius: 0.80, covRadius: 1.76 },
	Sc: { color: 0xE6E6E6, hex: '#E6E6E6', radius: 0.70, covRadius: 1.70 },
	Ti: { color: 0x7090A0, hex: '#7090A0', radius: 0.65, covRadius: 1.60 },
	V:  { color: 0xA6A6AB, hex: '#A6A6AB', radius: 0.65, covRadius: 1.53 },
	Cr: { color: 0x8A99C7, hex: '#8A99C7', radius: 0.65, covRadius: 1.39 },
	Mn: { color: 0x9C7AC7, hex: '#9C7AC7', radius: 0.65, covRadius: 1.39 },
	Fe: { color: 0xE06633, hex: '#E06633', radius: 0.65, covRadius: 1.32 },
	Co: { color: 0xF090A0, hex: '#F090A0', radius: 0.65, covRadius: 1.26 },
	Ni: { color: 0x50D050, hex: '#50D050', radius: 0.65, covRadius: 1.24 },
	Cu: { color: 0xC88033, hex: '#C88033', radius: 0.65, covRadius: 1.32 },
	Zn: { color: 0x7D80B0, hex: '#7D80B0', radius: 0.65, covRadius: 1.22 },
	Ga: { color: 0xC28F8F, hex: '#C28F8F', radius: 0.65, covRadius: 1.22 },
	Ge: { color: 0x668F8F, hex: '#668F8F', radius: 0.65, covRadius: 1.20 },
	As: { color: 0xBD80E3, hex: '#BD80E3', radius: 0.65, covRadius: 1.19 },
	Se: { color: 0xFFA100, hex: '#FFA100', radius: 0.65, covRadius: 1.20 },
	Br: { color: 0xA62929, hex: '#A62929', radius: 0.65, covRadius: 1.20 },
	Sr: { color: 0x00FF00, hex: '#00FF00', radius: 0.85, covRadius: 1.95 },
	Y:  { color: 0x94FFFF, hex: '#94FFFF', radius: 0.75, covRadius: 1.90 },
	Zr: { color: 0x00E0E0, hex: '#00E0E0', radius: 0.70, covRadius: 1.75 },
	Mo: { color: 0x54B5B5, hex: '#54B5B5', radius: 0.70, covRadius: 1.54 },
	Ru: { color: 0x248F8F, hex: '#248F8F', radius: 0.70, covRadius: 1.46 },
	Rh: { color: 0x0A788C, hex: '#0A788C', radius: 0.70, covRadius: 1.42 },
	Pd: { color: 0x006985, hex: '#006985', radius: 0.70, covRadius: 1.39 },
	Ag: { color: 0xC0C0C0, hex: '#C0C0C0', radius: 0.75, covRadius: 1.45 },
	Cd: { color: 0xFFD98F, hex: '#FFD98F', radius: 0.75, covRadius: 1.44 },
	In: { color: 0xA67573, hex: '#A67573', radius: 0.75, covRadius: 1.42 },
	Sn: { color: 0x668080, hex: '#668080', radius: 0.75, covRadius: 1.39 },
	Pt: { color: 0xD0D0E0, hex: '#D0D0E0', radius: 0.75, covRadius: 1.36 },
	Au: { color: 0xFFD123, hex: '#FFD123', radius: 0.75, covRadius: 1.36 },
	DEFAULT: { color: 0x999999, hex: '#999999', radius: 0.60, covRadius: 1.30 }
};

function getElementInfo(sym) {
	const s = (sym || '').trim();
	const key = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
	return ELEMENT_DATA[key] || ELEMENT_DATA[key.toUpperCase()] || ELEMENT_DATA.DEFAULT;
}

// Coordinate parsing functions
export function parseXYZ(text) {
	const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
	if (lines.length < 2) return null;
	const atomCount = parseInt(lines[0], 10);
	const comment = lines[1];
	const atoms = [];
	for (let i = 2; i < lines.length && atoms.length < (isNaN(atomCount) ? lines.length : atomCount); i++) {
		const parts = lines[i].split(/\s+/);
		if (parts.length >= 4) {
			const element = parts[0].replace(/[^a-zA-Z]/g, '');
			const x = parseFloat(parts[1]);
			const y = parseFloat(parts[2]);
			const z = parseFloat(parts[3]);
			if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
				atoms.push({
					element: element.charAt(0).toUpperCase() + element.slice(1).toLowerCase(),
					x, y, z,
					index: atoms.length
				});
			}
		}
	}
	return {
		title: comment || 'Molecular Structure (XYZ)',
		format: 'xyz',
		cell: null,
		atoms
	};
}

export function parseCIF(text) {
	let a = 1, b = 1, c = 1;
	let alpha = 90, beta = 90, gamma = 90;
	let title = '';

	const lines = text.split(/\r?\n/);
	let inLoop = false;
	let loopTags = [];
	let loopRows = [];

	function cleanVal(v) {
		if (!v) return 0;
		const s = v.replace(/\(.*?\)/g, '').trim();
		return parseFloat(s) || 0;
	}

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line || line.startsWith('#')) continue;

		if (line.toLowerCase().startsWith('data_')) {
			title = line.substring(5).trim();
			continue;
		}

		if (line.toLowerCase().startsWith('loop_')) {
			inLoop = true;
			loopTags = [];
			continue;
		}

		if (inLoop) {
			if (line.startsWith('_')) {
				loopTags.push(line.split(/\s+/)[0]);
			} else {
				const parts = line.split(/\s+/);
				if (parts.length >= loopTags.length) {
					loopRows.push(parts);
				}
			}
		} else {
			const parts = line.split(/\s+/);
			const tag = parts[0];
			const val = parts.slice(1).join(' ').replace(/['"]/g, '');
			if (tag === '_cell_length_a') a = cleanVal(val);
			else if (tag === '_cell_length_b') b = cleanVal(val);
			else if (tag === '_cell_length_c') c = cleanVal(val);
			else if (tag === '_cell_angle_alpha') alpha = cleanVal(val);
			else if (tag === '_cell_angle_beta') beta = cleanVal(val);
			else if (tag === '_cell_angle_gamma') gamma = cleanVal(val);
			else if (tag === '_chemical_name_common' || tag === '_chemical_name_systematic') {
				if (!title || title.startsWith('data_')) title = val;
			}
		}
	}

	const rad = Math.PI / 180;
	const alphaR = alpha * rad;
	const betaR = beta * rad;
	const gammaR = gamma * rad;

	const cosAlpha = Math.cos(alphaR);
	const cosBeta = Math.cos(betaR);
	const cosGamma = Math.cos(gammaR);
	const sinGamma = Math.sin(gammaR);

	const val = 1 - cosAlpha*cosAlpha - cosBeta*cosBeta - cosGamma*cosGamma + 2*cosAlpha*cosBeta*cosGamma;
	const omega = a * b * c * Math.sqrt(Math.max(0, val));

	const ax = a, ay = 0, az = 0;
	const bx = b * cosGamma, by = b * sinGamma, bz = 0;
	const cx = c * cosBeta;
	const cy = c * (cosAlpha - cosBeta * cosGamma) / (sinGamma || 1e-6);
	const cz = omega / (a * b * (sinGamma || 1e-6));

	const vA = [ax, ay, az];
	const vB = [bx, by, bz];
	const vC = [cx, cy, cz];

	const typeIdx = loopTags.indexOf('_atom_site_type_symbol');
	const labelIdx = loopTags.indexOf('_atom_site_label');
	const fxIdx = loopTags.indexOf('_atom_site_fract_x');
	const fyIdx = loopTags.indexOf('_atom_site_fract_y');
	const fzIdx = loopTags.indexOf('_atom_site_fract_z');

	const atoms = [];
	for (const row of loopRows) {
		let sym = '';
		if (typeIdx !== -1 && row[typeIdx]) {
			sym = row[typeIdx].replace(/[^a-zA-Z]/g, '');
		} else if (labelIdx !== -1 && row[labelIdx]) {
			sym = row[labelIdx].replace(/[^a-zA-Z]/g, '');
		}
		if (!sym) sym = 'X';
		sym = sym.charAt(0).toUpperCase() + sym.slice(1).toLowerCase();

		const fx = cleanVal(row[fxIdx]);
		const fy = cleanVal(row[fyIdx]);
		const fz = cleanVal(row[fzIdx]);

		const x = fx * vA[0] + fy * vB[0] + fz * vC[0];
		const y = fx * vA[1] + fy * vB[1] + fz * vC[1];
		const z = fx * vA[2] + fy * vB[2] + fz * vC[2];

		atoms.push({
			element: sym,
			x, y, z,
			fract: [fx, fy, fz],
			index: atoms.length
		});
	}

	return {
		title: title || 'Crystal Structure (CIF)',
		format: 'cif',
		cell: { a, b, c, alpha, beta, gamma, vectors: [vA, vB, vC], volume: omega },
		atoms
	};
}

// Main 3D App Controller
export class Structure3DApp {
	constructor(container, vscodeApi) {
		this.container = container;
		this.vscode = vscodeApi;

		this.currentStructure = null;
		this.currentRawText = '';
		this.selectedAtoms = []; // up to 2 atoms for measurement

		// Options
		this.showCell = true;
		this.showBonds = true;
		this.showLabels = false;

		// Three.js instances
		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x181818);

		this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
		this.camera.position.set(0, 0, 15);

		this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setPixelRatio(window.devicePixelRatio || 1);
		this.renderer.shadowMap.enabled = true;
		container.appendChild(this.renderer.domElement);

		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.08;

		// Lighting
		const ambient = new THREE.AmbientLight(0xffffff, 0.7);
		this.scene.add(ambient);

		const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
		dirLight1.position.set(10, 20, 15);
		this.scene.add(dirLight1);

		const dirLight2 = new THREE.DirectionalLight(0x99bbff, 0.4);
		dirLight2.position.set(-10, -10, -10);
		this.scene.add(dirLight2);

		// Groups for scene objects
		this.structureGroup = new THREE.Group();
		this.atomsGroup = new THREE.Group();
		this.bondsGroup = new THREE.Group();
		this.cellGroup = new THREE.Group();
		this.labelsGroup = new THREE.Group();
		this.selectionGroup = new THREE.Group();

		this.structureGroup.add(this.atomsGroup);
		this.structureGroup.add(this.bondsGroup);
		this.structureGroup.add(this.cellGroup);
		this.structureGroup.add(this.labelsGroup);
		this.structureGroup.add(this.selectionGroup);
		this.scene.add(this.structureGroup);

		// Raycasting
		this.raycaster = new THREE.Raycaster();
		this.mouse = new THREE.Vector2();
		this.atomMeshList = [];

		this.bindEvents();
		this.animate = this.animate.bind(this);
		requestAnimationFrame(this.animate);
	}

	bindEvents() {
		window.addEventListener('resize', () => {
			this.camera.aspect = window.innerWidth / window.innerHeight;
			this.camera.updateProjectionMatrix();
			this.renderer.setSize(window.innerWidth, window.innerHeight);
		});

		let pointerDownPos = { x: 0, y: 0 };
		this.renderer.domElement.addEventListener('pointerdown', (e) => {
			pointerDownPos = { x: e.clientX, y: e.clientY };
		});

		this.renderer.domElement.addEventListener('pointerup', (e) => {
			const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
			if (dist < 4) {
				this.onPointerClick(e);
			}
		});

		// UI Button hooks
		document.getElementById('btn-toggle-cell')?.addEventListener('click', (e) => {
			this.showCell = !this.showCell;
			this.cellGroup.visible = this.showCell;
			e.currentTarget.classList.toggle('active', this.showCell);
		});

		document.getElementById('btn-toggle-bonds')?.addEventListener('click', (e) => {
			this.showBonds = !this.showBonds;
			this.bondsGroup.visible = this.showBonds;
			e.currentTarget.classList.toggle('active', this.showBonds);
		});

		document.getElementById('btn-toggle-labels')?.addEventListener('click', (e) => {
			this.showLabels = !this.showLabels;
			this.labelsGroup.visible = this.showLabels;
			e.currentTarget.classList.toggle('active', this.showLabels);
		});

		document.getElementById('btn-reset-cam')?.addEventListener('click', () => {
			this.resetCamera();
		});

		document.getElementById('btn-view-text')?.addEventListener('click', () => {
			this.vscode?.postMessage({ command: 'openAsText' });
		});

		document.getElementById('btn-gen-qe')?.addEventListener('click', () => {
			this.vscode?.postMessage({ command: 'generateQEInput', structure: this.currentStructure });
		});

		document.getElementById('atom-card-close')?.addEventListener('click', () => {
			this.clearSelection();
		});
	}

	animate() {
		requestAnimationFrame(this.animate);
		this.controls.update();

		// Update 2D labels position or sprite facing
		if (this.showLabels && this.labelsGroup.children.length > 0) {
			for (const child of this.labelsGroup.children) {
				child.quaternion.copy(this.camera.quaternion);
			}
		}

		this.renderer.render(this.scene, this.camera);
	}

	loadDocument(text, filename) {
		this.currentRawText = text;
		const isXYZ = filename.endsWith('.xyz') || (!filename.endsWith('.cif') && text.trim().match(/^\d+\s*\n/));
		const structure = isXYZ ? parseXYZ(text) : parseCIF(text);

		if (!structure || structure.atoms.length === 0) {
			this.showError('Unable to parse atomic coordinates from file.');
			return;
		}

		this.currentStructure = structure;
		this.renderStructure(structure);
		this.updateStatsUI(structure, filename);

		document.getElementById('loading-overlay')?.classList.add('hidden');
	}

	renderStructure(structure) {
		// Clear previous meshes
		this.clearGroup(this.atomsGroup);
		this.clearGroup(this.bondsGroup);
		this.clearGroup(this.cellGroup);
		this.clearGroup(this.labelsGroup);
		this.clearGroup(this.selectionGroup);
		this.atomMeshList = [];
		this.selectedAtoms = [];
		this.hideCards();

		const atoms = structure.atoms;
		if (!atoms.length) return;

		// Calculate center of mass to center the structure
		let cx = 0, cy = 0, cz = 0;
		for (const a of atoms) {
			cx += a.x;
			cy += a.y;
			cz += a.z;
		}
		cx /= atoms.length;
		cy /= atoms.length;
		cz /= atoms.length;

		// Centered structure position
		const sphereGeo = new THREE.SphereGeometry(1, 32, 24);
		const materials = new Map();

		for (const atom of atoms) {
			const info = getElementInfo(atom.element);
			if (!materials.has(atom.element)) {
				materials.set(atom.element, new THREE.MeshStandardMaterial({
					color: info.color,
					roughness: 0.25,
					metalness: 0.15
				}));
			}

			const mesh = new THREE.Mesh(sphereGeo, materials.get(atom.element));
			const scale = info.radius;
			mesh.scale.set(scale, scale, scale);
			mesh.position.set(atom.x - cx, atom.y - cy, atom.z - cz);
			mesh.userData = { atom, cx, cy, cz };

			this.atomsGroup.add(mesh);
			this.atomMeshList.push(mesh);

			// Label Sprite
			const canvas = document.createElement('canvas');
			canvas.width = 128;
			canvas.height = 64;
			const ctx = canvas.getContext('2d');
			if (ctx) {
				ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
				ctx.beginPath();
				ctx.roundRect(14, 10, 100, 44, 8);
				ctx.fill();
				ctx.font = 'bold 24px monospace';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillStyle = '#ffffff';
				ctx.fillText(atom.element + (atom.index + 1), 64, 32);

				const texture = new THREE.CanvasTexture(canvas);
				const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
				const sprite = new THREE.Sprite(spriteMat);
				sprite.scale.set(1.4, 0.7, 1);
				sprite.position.set(atom.x - cx, atom.y - cy + scale + 0.35, atom.z - cz);
				this.labelsGroup.add(sprite);
			}
		}

		// Calculate Bonds
		this.buildBonds(atoms, cx, cy, cz);

		// Build Unit Cell if CIF
		if (structure.cell && structure.cell.vectors) {
			this.buildUnitCell(structure.cell.vectors, cx, cy, cz);
			document.getElementById('btn-toggle-cell')?.style.setProperty('display', 'inline-flex');
		} else {
			document.getElementById('btn-toggle-cell')?.style.setProperty('display', 'none');
		}

		this.labelsGroup.visible = this.showLabels;
		this.bondsGroup.visible = this.showBonds;
		this.cellGroup.visible = this.showCell;

		this.resetCamera();
	}

	buildBonds(atoms, cx, cy, cz) {
		const bondMat = new THREE.MeshStandardMaterial({
			color: 0xcccccc,
			roughness: 0.4,
			metalness: 0.2
		});
		const cylinderGeo = new THREE.CylinderGeometry(0.08, 0.08, 1, 16);

		for (let i = 0; i < atoms.length; i++) {
			const a1 = atoms[i];
			const info1 = getElementInfo(a1.element);
			for (let j = i + 1; j < atoms.length; j++) {
				const a2 = atoms[j];
				const info2 = getElementInfo(a2.element);

				const dx = a2.x - a1.x;
				const dy = a2.y - a1.y;
				const dz = a2.z - a1.z;
				const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

				// Max covalent distance threshold with tolerance
				const maxBondDist = (info1.covRadius + info2.covRadius) * 1.35;
				if (dist > 0.4 && dist <= Math.max(1.2, maxBondDist)) {
					// Draw Cylinder Bond
					const p1 = new THREE.Vector3(a1.x - cx, a1.y - cy, a1.z - cz);
					const p2 = new THREE.Vector3(a2.x - cx, a2.y - cy, a2.z - cz);

					const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
					const bondMesh = new THREE.Mesh(cylinderGeo, bondMat);

					bondMesh.position.copy(mid);
					bondMesh.scale.set(1, dist, 1);
					bondMesh.quaternion.setFromUnitVectors(
						new THREE.Vector3(0, 1, 0),
						new THREE.Vector3().subVectors(p2, p1).normalize()
					);

					this.bondsGroup.add(bondMesh);
				}
			}
		}
	}

	buildUnitCell(vectors, cx, cy, cz) {
		const [vA, vB, vC] = vectors.map(v => new THREE.Vector3(v[0], v[1], v[2]));
		const o = new THREE.Vector3(-cx, -cy, -cz);

		const p000 = o.clone();
		const p100 = o.clone().add(vA);
		const p010 = o.clone().add(vB);
		const p110 = o.clone().add(vA).add(vB);
		const p001 = o.clone().add(vC);
		const p101 = o.clone().add(vA).add(vC);
		const p011 = o.clone().add(vB).add(vC);
		const p111 = o.clone().add(vA).add(vB).add(vC);

		const linePoints = [
			// bottom
			p000, p100,  p100, p110,  p110, p010,  p010, p000,
			// top
			p001, p101,  p101, p111,  p111, p011,  p011, p001,
			// pillars
			p000, p001,  p100, p101,  p110, p111,  p010, p011
		];

		const geo = new THREE.BufferGeometry().setFromPoints(linePoints);
		const mat = new THREE.LineBasicMaterial({
			color: 0x4fc3f7,
			linewidth: 2,
			transparent: true,
			opacity: 0.85
		});
		const wireframe = new THREE.LineSegments(geo, mat);
		this.cellGroup.add(wireframe);
	}

	resetCamera() {
		if (this.atomMeshList.length === 0) return;
		const box = new THREE.Box3().setFromObject(this.structureGroup);
		const sphere = new THREE.Sphere();
		box.getBoundingSphere(sphere);

		const radius = Math.max(sphere.radius, 2.5);
		const fov = this.camera.fov * (Math.PI / 180);
		const dist = Math.abs(radius / Math.sin(fov / 2)) * 1.15;

		this.camera.position.set(0, dist * 0.35, dist);
		this.camera.lookAt(0, 0, 0);
		this.controls.target.set(0, 0, 0);
		this.controls.update();
	}

	onPointerClick(event) {
		this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
		this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

		this.raycaster.setFromCamera(this.mouse, this.camera);
		const intersects = this.raycaster.intersectObjects(this.atomMeshList);

		if (intersects.length > 0) {
			const clickedMesh = intersects[0].object;
			const atom = clickedMesh.userData.atom;
			this.selectAtom(atom, clickedMesh);
		} else {
			// Clicked in empty space -> clear selection if not holding Shift
			if (!event.shiftKey) {
				this.clearSelection();
			}
		}
	}

	selectAtom(atom, mesh) {
		// Toggle or append to selected list
		const existingIdx = this.selectedAtoms.findIndex(a => a.atom.index === atom.index);
		if (existingIdx !== -1) {
			this.selectedAtoms.splice(existingIdx, 1);
		} else {
			if (this.selectedAtoms.length >= 2) {
				this.selectedAtoms.shift(); // keep last 2
			}
			this.selectedAtoms.push({ atom, mesh });
		}

		this.updateSelectionVisuals();
	}

	updateSelectionVisuals() {
		this.clearGroup(this.selectionGroup);

		if (this.selectedAtoms.length === 0) {
			this.hideCards();
			return;
		}

		// Highlight rings around selected atoms
		for (const item of this.selectedAtoms) {
			const ringGeo = new THREE.RingGeometry(item.mesh.scale.x * 1.15, item.mesh.scale.x * 1.35, 32);
			const ringMat = new THREE.MeshBasicMaterial({
				color: 0xffff00,
				side: THREE.DoubleSide,
				transparent: true,
				opacity: 0.9
			});
			const ringMesh = new THREE.Mesh(ringGeo, ringMat);
			ringMesh.position.copy(item.mesh.position);
			ringMesh.lookAt(this.camera.position);
			this.selectionGroup.add(ringMesh);
		}

		// Single atom card: show the most recently selected atom
		const active = this.selectedAtoms[this.selectedAtoms.length - 1].atom;
		this.showAtomCard(active);

		// Two atoms: calculate and show bond distance
		if (this.selectedAtoms.length === 2) {
			const a1 = this.selectedAtoms[0].atom;
			const a2 = this.selectedAtoms[1].atom;
			const dx = a2.x - a1.x;
			const dy = a2.y - a1.y;
			const dz = a2.z - a1.z;
			const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

			// Draw distance line between them
			const p1 = this.selectedAtoms[0].mesh.position;
			const p2 = this.selectedAtoms[1].mesh.position;
			const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
			const lineMat = new THREE.LineDashedMaterial({
				color: 0xffeb3b,
				dashSize: 0.2,
				gapSize: 0.1,
				linewidth: 2
			});
			const line = new THREE.Line(lineGeo, lineMat);
			line.computeLineDistances();
			this.selectionGroup.add(line);

			this.showDistanceBanner(a1, a2, dist);
		} else {
			this.hideDistanceBanner();
		}
	}

	showAtomCard(atom) {
		const card = document.getElementById('atom-card');
		if (!card) return;

		const info = getElementInfo(atom.element);
		const pill = document.getElementById('atom-card-element');
		if (pill) {
			pill.textContent = atom.element;
			pill.style.backgroundColor = info.hex;
			// Adapt text color for contrast
			pill.style.color = (info.hex === '#FFFFFF' || info.hex === '#FFFF30') ? '#000' : '#fff';
		}

		const indexElem = document.getElementById('atom-card-index');
		if (indexElem) indexElem.textContent = `#${atom.index + 1}`;

		const coordsElem = document.getElementById('atom-card-coords');
		if (coordsElem) {
			coordsElem.textContent = `X: ${atom.x.toFixed(4)} Å\nY: ${atom.y.toFixed(4)} Å\nZ: ${atom.z.toFixed(4)} Å`;
		}

		const fractElem = document.getElementById('atom-card-fract');
		if (fractElem) {
			if (atom.fract) {
				fractElem.parentElement.style.display = 'flex';
				fractElem.textContent = `[${atom.fract[0].toFixed(4)}, ${atom.fract[1].toFixed(4)}, ${atom.fract[2].toFixed(4)}]`;
			} else {
				fractElem.parentElement.style.display = 'none';
			}
		}

		card.classList.add('visible');
	}

	showDistanceBanner(a1, a2, dist) {
		const banner = document.getElementById('distance-banner');
		if (!banner) return;
		banner.textContent = `📏 Distance (${a1.element}${a1.index + 1} ↔ ${a2.element}${a2.index + 1}): ${dist.toFixed(4)} Å`;
		banner.classList.add('visible');
	}

	hideDistanceBanner() {
		const banner = document.getElementById('distance-banner');
		banner?.classList.remove('visible');
	}

	clearSelection() {
		this.selectedAtoms = [];
		this.clearGroup(this.selectionGroup);
		this.hideCards();
	}

	hideCards() {
		document.getElementById('atom-card')?.classList.remove('visible');
		this.hideDistanceBanner();
	}

	updateStatsUI(structure, filename) {
		const nameElem = document.getElementById('stats-filename');
		if (nameElem) nameElem.textContent = filename || structure.title;

		const countElem = document.getElementById('stats-atom-count');
		if (countElem) countElem.textContent = structure.atoms.length.toString();

		const formulaElem = document.getElementById('stats-formula');
		if (formulaElem) {
			const counts = {};
			for (const a of structure.atoms) {
				counts[a.element] = (counts[a.element] || 0) + 1;
			}
			const formula = Object.entries(counts)
				.sort(([k1], [k2]) => k1.localeCompare(k2))
				.map(([k, v]) => `${k}${v > 1 ? v : ''}`)
				.join(' ');
			formulaElem.textContent = formula;
		}

		const cellRow = document.getElementById('stats-cell-row');
		const cellElem = document.getElementById('stats-cell');
		if (cellRow && cellElem) {
			if (structure.cell) {
				cellRow.style.display = 'flex';
				const { a, b, c, alpha, beta, gamma } = structure.cell;
				cellElem.textContent = `${a.toFixed(2)} × ${b.toFixed(2)} × ${c.toFixed(2)} Å (${alpha}°, ${beta}°, ${gamma}°)`;
			} else {
				cellRow.style.display = 'none';
			}
		}
	}

	clearGroup(group) {
		while (group.children.length > 0) {
			const obj = group.children[0];
			group.remove(obj);
			if (obj.geometry) obj.geometry.dispose();
			if (obj.material) {
				if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
				else obj.material.dispose();
			}
		}
	}

	showError(msg) {
		const overlay = document.getElementById('loading-overlay');
		if (overlay) {
			overlay.classList.remove('hidden');
			overlay.innerHTML = `<div style="color: #f48771; font-weight: bold; text-align: center; padding: 20px;">
				<div style="font-size: 28px; margin-bottom: 8px;">⚠️</div>
				<div>${msg}</div>
			</div>`;
		}
	}
}

// Initial bootstrap inside Webview
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
	const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
	const container = document.getElementById('viewport-container');
	if (container) {
		const app = new Structure3DApp(container, vscode);

		// Listen to messages from extension host
		window.addEventListener('message', (event) => {
			const message = event.data;
			switch (message.type) {
				case 'init':
				case 'update':
					app.loadDocument(message.text, message.filename || 'structure');
					break;
			}
		});

		// Signal ready to host
		vscode?.postMessage({ command: 'ready' });
	}
}
