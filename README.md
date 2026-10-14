# HPC Studio

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/nosedimetuXD/HPC-Studio)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.txt)
[![Backend](https://img.shields.io/badge/backend-FastAPI%20%7C%20Python-blue)](https://github.com/nosedimetuXD/HPC-Studio-Backend)
[![Platform](https://img.shields.io/badge/platform-Linux-lightgrey.svg)](https://github.com/nosedimetuXD/HPC-Studio)

**HPC Studio** es un entorno de desarrollo integrado (IDE) de código abierto diseñado específicamente para **Supercómputo (HPC)**, **simulaciones cuánticas de materiales (DFT)** y **orquestación de cargas de trabajo en clústeres remotos**.

Construido sobre la robusta base de **Visual Studio Code (Code - OSS)** e impulsado por un motor satélite (**Sidecar**) en **Python (FastAPI + WebSockets)**, HPC Studio une la productividad de un editor moderno con las herramientas que los investigadores en física, química, ciencia de materiales e ingeniería HPC necesitan a diario.

---

## 🚀 Características Principales

### 🖥️ Conexión y Gestión de Clústeres Remotos
- **Explorador SSH Integrado**: Gestión visual de perfiles de conexión (`~/.ssh/config`), control de latencia y apertura de túneles seguros.
- **Explorador SFTP de Alto Rendimiento**: Navegación remota del sistema de archivos del clúster con transferencias asíncronas, cola de archivos y seguimiento de progreso.

### ⚡ Orquestador de Slurm en Tiempo Real
- **Monitor de Colas (`squeue`) en Vivo**: Visualización reactiva de trabajos mediante WebSockets con filtros por usuario, estado y partición.
- **Generador y Envío Asistido de Jobs (`sbatch`)**: Plantillas inteligentes con validación de recursos de nodos, CPUs, memoria y aceleradores GPU.
- **Seguimiento de Logs en Streaming**: Inspección en vivo (*tail -f*) de la salida de trabajos remotos en ejecución.

### ⚛️ Workbench Cuántico y Simulación de Materiales
- **Quantum ESPRESSO**: Soporte de sintaxis nativa para archivos de entrada (`.in`, `.pwi`) y salida (`.out`, `.pwo`), autocompletado de *namelists* (`&CONTROL`, `&SYSTEM`, `&ELECTRONS`) y tarjetas (`ATOMIC_POSITIONS`, `K_POINTS`).
- **Validador DFT**: Análisis estático previo al envío para prevenir errores comunes de parámetros y configuraciones incompatibles.
- **Gráficas de Convergencia y Bandas**: Renderizado automático de curvas de energía SCF y diagramas de dispersión electrónica a partir de los outputs de cálculo.

### 🧊 Visor 3D Interactivo para Estructuras Moleculares y Cristalinas
- **Soporte para `.cif` y `.xyz`**: Superación de las limitaciones del texto plano numérico mediante un editor personalizado 3D en WebGL.
- **Inspección Geométrica**: Modos *ball-and-stick* y *space-filling*, medición interactiva de distancias y ángulos de enlace, y visualización de la celda unitaria con parámetros periódicos.
- **Vista Dividida Sincronizada (Split View)**: Edición de coordenadas en texto plano con actualización reactiva e instantánea en el visor tridimensional.

### 🤖 Asistente de IA para HPC
- Soporte para diagnóstico automatizado de divergencias electrónicas SCF, asesoramiento de optimización de parámetros Slurm y flujos de simulación interactivos.

---

## 🏛️ Arquitectura del Sistema

HPC Studio se compone de dos capas principales acopladas de manera desacoplada y eficiente:

1. **HPC Studio Workbench (Frontend / Electron)**:
   - Repositorio: [https://github.com/nosedimetuXD/HPC-Studio](https://github.com/nosedimetuXD/HPC-Studio)
   - Capa de presentación, editores tridimensionales, árbol de actividades y extensión built-in `extensions/hpc-studio`.
2. **HPC Studio Backend Engine (Python Sidecar)**:
   - Repositorio: [https://github.com/nosedimetuXD/HPC-Studio-Backend](https://github.com/nosedimetuXD/HPC-Studio-Backend)
   - Servidor FastAPI y WebSockets con motores especializados en SSH (`paramiko`), Slurm, Quantum ESPRESSO, cristalografía y ZeroMQ para Jupyter kernels remotos.

---

## 🛠️ Desarrollo y Compilación desde Fuentes

### Requisitos Previos
- **Node.js** (versión recomendada `>= 20.x`)
- **Python** `>= 3.11` (con el entorno de [HPC-Studio-Backend](https://github.com/nosedimetuXD/HPC-Studio-Backend) configurado)
- **Herramientas de compilación en Linux** (`build-essential`, `libsecret-1-dev`, `libkrb5-dev`)

### Pasos de Configuración
```bash
# 1. Clonar el repositorio
git clone https://github.com/nosedimetuXD/HPC-Studio.git
cd HPC-Studio

# 2. Instalar dependencias
npm install

# 3. Compilar el cliente y extensiones integradas
npm run compile

# 4. Iniciar HPC Studio en modo desarrollo
./scripts/code.sh
```

---

## 📄 Licencia

Este proyecto está licenciado bajo los términos de la [Licencia MIT](LICENSE.txt).
