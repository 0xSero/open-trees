<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/banner-dark.svg" />
  <img alt="Open Trees warm paper banner" src="docs/assets/brand/banner-light.svg" width="100%" />
</picture>

# Open Trees

Plugin de OpenCode para flujos de trabajo de `git worktree` rápidos y seguros.

## Instalación

Un solo comando (recomendado):

```bash
bunx open-trees add
```

Esto actualiza tu configuración de OpenCode (predeterminada: `~/.config/opencode/opencode.json`).
OpenCode instala los plugins de npm automáticamente al iniciar (almacenados en caché en `~/.cache/opencode/node_modules`).

Configuración manual:

```json
{
  "plugin": ["open-trees"]
}
```

Para desarrollo local, construye el plugin y apunta OpenCode al paquete local:

```bash
bun install
bun run build
```

```json
{
  "plugin": ["/absolute/path/to/open-trees"]
}
```

## Modo Worktree

Las herramientas de worktree están restringidas detrás del "modo worktree" para no saturar la lista de herramientas predeterminada.
Actívalo cuando quieras trabajar con worktrees y desactívalo cuando hayas terminado.

```text
worktree_mode { "action": "on" }
worktree_mode { "action": "off" }
```

`worktree_mode` también imprime una hoja de ayuda (herramientas + ejemplos) para que el modelo tenga el contexto de uso.

Activación nativa mediante slash (ver `.opencode/command/worktree.md`):

```text
/worktree on
/worktree off
```

`/worktree on` activa las herramientas y emite la hoja de ayuda en la sesión.
`/worktree off` las desactiva y las mantiene desactivadas para la siguiente sesión.

## Herramientas

- `worktree_mode` — activar/desactivar el modo worktree y mostrar ayuda.
- `worktree_overview` — listar, estado o panel de control de los worktrees.
- `worktree_make` — crear/abrir/bifurcar (fork) worktrees y sesiones.
- `worktree_cleanup` — eliminar o podar worktrees de forma segura.

### Ejemplos

Activar modo worktree:

```text
worktree_mode { "action": "on" }
```

Listar worktrees:

```text
worktree_overview
```

Estado de todos los worktrees:

```text
worktree_overview { "view": "status" }
```

Mostrar el panel de control de worktree/sesión:

```text
worktree_overview { "view": "dashboard" }
```

Crear un worktree (rama derivada del nombre):

```text
worktree_make { "action": "create", "name": "feature audit" }
```

Iniciar una nueva sesión (crea o reutiliza un worktree):

```text
worktree_make { "action": "start", "name": "feature audit", "openSessions": true }
```

Abrir una sesión en un worktree existente:

```text
worktree_make { "action": "open", "pathOrBranch": "feature/audit", "openSessions": true }
```

Bifurcar (fork) la sesión actual en un worktree:

```text
worktree_make { "action": "fork", "name": "feature audit", "openSessions": true }
```

Crear un enjambre (swarm) de worktrees/sesiones:

```text
worktree_make { "action": "swarm", "tasks": ["refactor-auth", "docs-refresh"], "openSessions": true }
```

Eliminar un worktree:

```text
worktree_cleanup { "action": "remove", "pathOrBranch": "feature/audit" }
```

Podar entradas de worktree obsoletas:

```text
worktree_cleanup { "action": "prune", "dryRun": true }
```

## Valores predeterminados y seguridad

- Ruta de worktree predeterminada (cuando se omite `path`):
  - `<repo>/.worktrees/<branch>`
- Las entradas de `path` relativas se resuelven bajo `.worktrees/` para evitar el salto de directorios (traversal).
- El nombre de la rama se deriva de `name` cuando se omite `branch` (en minúsculas, espacios sustituidos por `-`).
- `worktree_cleanup` se niega a eliminar worktrees con cambios sin confirmar (dirty) a menos que `force: true`.
- Todas las herramientas devuelven una salida legible con rutas explícitas y comandos de git.

## Flujo de trabajo de sesión

Las acciones de `worktree_make` (`start`, `open`, `fork`) crean o reutilizan un worktree, y luego crean una sesión en ese directorio.
Cada acción registra una entrada de mapeo en:

- `~/.config/opencode/open-trees/state.json` (o `${XDG_CONFIG_HOME}/opencode/open-trees/state.json`)

El título de la sesión es por defecto `wt:<branch>`, y la salida incluye el ID de la sesión y los siguientes pasos.

Notas de seguridad sobre el enjambre (swarm):

- `worktree_make` con `action: "swarm"` se niega a reutilizar ramas o rutas existentes a menos que `force: true`.
- Nunca elimina worktrees existentes; solo crea nuevos.

Ejemplos de archivos de comandos opcionales:

```text
# .opencode/command/worktree.md
worktree_mode { "action": "$1" }
```

```text
# .opencode/command/worktree-start.md
worktree_make { "action": "start", "name": "$1", "openSessions": true }
```

```text
# .opencode/command/worktree-open.md
worktree_make { "action": "open", "pathOrBranch": "$1", "openSessions": true }
```

Comandos slash (coloca estos archivos en `.opencode/command`):

```text
/worktree on
/worktree off
/worktree-overview
/worktree-make <name>
/worktree-clean <pathOrBranch>
```

## Desarrollo

Las pruebas E2E ejercitan la CLI contra un archivo de configuración de OpenCode temporal.

```bash
bun run lint
bun run typecheck
bun run build
bun run test
bun run test:e2e
bun pm scan
npm audit --omit=dev
```

## Versionado

Open Trees sigue el Versionado Semántico y registra los cambios notables en `CHANGELOG.md`.

## Marca

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/release-dark.svg" />
  <img alt="Open Trees release card" src="docs/assets/brand/release-light.svg" width="100%" />
</picture>

Los elementos visuales de marca, los activos SVG y las pautas de uso se encuentran en `docs/brand.md`.

## Contribución

Consulta `CONTRIBUTING.md` para obtener pautas sobre configuración, pruebas y lanzamiento.
