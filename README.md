# openGrid Studio

Design custom openGrid boards in the browser with fast 2D editing, realtime 3D preview, and direct STL or 3MF export.

## Features

- 2D mask editor for tiles, screw holes, connector cutouts, and chamfers
- Realtime 3D preview rendered directly in the browser
- Direct export to `STL`, `ASCII STL`, and `3MF`
- `Copy SCAD` action for generating an OpenSCAD script for external use
- Config persistence in local storage, including the selected download format
- Light, dark, and auto theme modes

## Stack

- `refui` for the UI
- `tailwindcss` v4 for styling
- `manifold-3d` for in-browser geometry generation, preview meshes, and file export

## Development

Install dependencies:

```bash
pnpm install
```

Start the dev server:

```bash
pnpm dev
```

Create a production build:

```bash
pnpm build
```

Preview the production build locally:

```bash
pnpm preview
```

## Export Notes

- The default download format is binary `STL` and can be changed from the split download button in the title bar.
- Downloaded filenames include board type, board dimensions, stack count, and a short config hash.
- Browser exports are generated directly from Manifold. OpenSCAD is not bundled for export.
- `Copy SCAD` still generates a script that expects external `BOSL2/std.scad` and `opengrid_generator.scad`.

## License

Apache-2.0
