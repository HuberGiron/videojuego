# Maze Blaster

Videojuego arcade 2D en HTML, CSS y JavaScript, sin frameworks ni build step.

## Controles

- `W`, `A`, `S`, `D`: mover personaje.
- `Espacio`: disparar en la dirección actual.
- Mouse: apuntar y clic izquierdo para disparar.
- `P`: pausa.
- `R`: reiniciar.

## Características

- Laberinto arcade 2D.
- Shooter con enemigos de distintos tipos.
- Score y récord guardado en `localStorage`.
- 3 vidas.
- Niveles progresivos.
- Partículas, screen shake, animación de personaje y enemigos.
- Efectos de sonido generados con Web Audio API; no requiere archivos MP3.
- Responsive: el canvas mantiene proporción en escritorio y móvil.
- Assets SVG incluidos en `/assets`.

## Publicar en GitHub Pages

1. Sube todos los archivos manteniendo esta estructura.
2. En GitHub abre **Settings > Pages**.
3. En **Build and deployment**, selecciona **Deploy from a branch**.
4. Elige tu rama principal (`main`) y carpeta `/ (root)`.
5. Guarda los cambios.

## Estructura

```text
pac-shooter/
├─ index.html
├─ styles.css
├─ app.js
├─ README.md
└─ assets/
   ├─ hero.svg
   ├─ enemy-red.svg
   ├─ enemy-purple.svg
   └─ energy-core.svg
```
