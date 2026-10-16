# HPC Studio Core Extension

HPC Studio Core is the primary integration engine for HPC Studio, providing:

- **Sidecar Process Supervisor**: Automatic lifecycle management for the Python HPC backend daemon and MCP server.
- **Remote Cluster Connectivity**: SSH tunneling, remote Slurm queue monitor (`squeue`), job submissions (`sbatch`), and SFTP remote file browser.
- **Scientific Simulation Support**: Syntax highlighting, snippet completions, and language tooling for Fortran, Slurm, MPI, OpenMP, CUDA, OpenACC, LAMMPS, Quantum ESPRESSO, and CP2K.
- **Interactive 3D Molecular Viewer**: WebGL/Three.js-powered structural visualizer for PDB, CIF, and XYZ structures directly within the editor.
- **Antigravity AI Agent Integration**: Built-in HPC AI coding companion powered by MCP protocol.

## Features

- **Clusters View**: Add and ping HPC cluster profiles, launch integrated SSH terminals.
- **Slurm Queue Monitor**: Real-time view of running and pending jobs with cancel/status actions.
- **SFTP Explorer**: Seamless remote browsing and transfer between workstation and cluster storage.
- **Language Grammars**: Syntax highlighting and snippet templates for high-performance computing scripts.

## License

MIT License.
