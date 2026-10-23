# Draconic Architect

![A small dungeon drawn in the pencil sketch style](docs/images/header.jpg)

Pencil-on-paper dungeon maps for tabletop RPGs. Draw rooms and corridors right on an
[Owlbear Rodeo](https://www.owlbear.rodeo) table, with walls for dynamic fog made as you go,
or use the full editor and export PNG or UVTT.

**[Open the editor](https://gammercvest.github.io/draconic-architect/)** · [Українською](README.uk.md)

## Features

- Floors from rectangles, polygons or a cell brush; cut out pillars and alcoves; outline and name rooms.
- Several looks: pencil sketch, ink and stipple, blueprint, parchment with contour lines and more.
  Mix styles in one map or make your own with paper and floor textures and stamped marks.
- Over 280 top-down furniture pieces and props, redrawn in the ink of your map's style.
- Doors (open or closed, and whether players may open them), windows, bars, curtains, bushes and
  crayon barriers that let sight through or block it; light sources (torches, candles, braziers, fire pits, lanterns) that can be lit or put out; items that block light.
- Draw straight on an Owlbear Rodeo table, or bring a finished map over from the editor.
- Layers, stacking priority, linked groups, attaching one object to another, merging shapes.
- Export to PNG, or to UVTT (`.dd2vtt`) for Smoke & Spectre, Foundry and other virtual tabletops.
- Ukrainian and English interface.

![The editor](docs/images/editor.jpg)

![The same map in the blueprint, parchment and ink styles](docs/images/styles.jpg)

## Install in Owlbear Rodeo

Add the extension with this link (see the [extension guide](https://extensions.owlbear.rodeo/guide) for how):

```
https://gammercvest.github.io/draconic-architect/manifest.json
```

### Drawing on the table

Pick the **Draconic Architect** tool in the toolbar (GM only):

- **Rectangle**, **Polygon** and **Cell brush** draw rooms; the floor/cut-out switch next to them
  makes cut-outs instead. Hold Ctrl for the opposite, Shift to skip snapping. Polygons close with a
  double click or Enter.
- **Items** opens the furniture catalogue; pick something and click the map to place it.
- **Doors**: click by a wall for a one-cell door, or drag; click a door to open or close it.
  Right-click a door to let players open it — they get a small Doors tool of their own.
- **Windows, bars, curtains**: pick the kind and whether it blocks sight, then click by a wall or drag.
- **Light**: pick a preset (torch, candle, brazier, campfire, lantern) and click an item to make it glow,
  or empty space to place a light. Right-click any item to light it, put it out, or make it block light.
- Rooms and items are ordinary scene items: move, turn, delete and undo them with Owlbear's own tools.
  The pencil look and the fog walls for Dynamic Fog are redrawn around them automatically.

The map style and the dynamic fog switch for the scene are in the extension's menu. Lights use the
Dynamic Fog extension, which needs to be installed too.

### Using the full editor

**Open editor** in the extension's menu opens the editor over the table, with every style, texture
and feature. When the map is ready:

- **To this scene** moves rooms and furniture onto the open scene, where the table tool keeps editing them.
- **As a picture** places the finished image with the full pencil look. Owlbear asks you to store it
  and pick it, since extensions can only place pictures from your storage.
- **New scene** creates a separate scene from the image.

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm run lint     # type check and formatting
npm run build    # static site in dist/
```

Pushes to `main` publish the site to GitHub Pages.

## License

Code: [GPL-3.0-or-later](LICENSE).
Furniture and map symbols: Mark Gosbell, CC0 — see [credits](public/assets/items/CREDITS.md).
