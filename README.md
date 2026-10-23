# Draconic Architect

Map editor for tabletop RPGs with a pencil-on-paper look. Draw rooms and corridors, furnish them,
pick a style, then export a PNG or a UVTT file, or send the map straight to an
[Owlbear Rodeo](https://www.owlbear.rodeo) scene with walls for dynamic fog.

Інтерфейс українською та англійською.

## Running

```sh
npm install
npm run dev
```

To try it in Owlbear Rodeo while developing, add `http://localhost:5173/manifest.json` as an extension
(Profile → Extensions → Add Extension).

`npm run build` makes a static site in `dist/`. For a sub-folder (e.g. GitHub Pages) build with
`BASE_PATH=/draconic-architect/ npm run build`; the Pages workflow in `.github/workflows` does this.

## License

GPL-3.0-or-later, see [LICENSE](LICENSE).

The furniture and map symbols are by Mark Gosbell, released under CC0 —
see [public/assets/items/CREDITS.md](public/assets/items/CREDITS.md).
