Write a JavaScript ES module that builds a realistic 3D model with three.js for a "How it works" explainer Short.
It will be rendered like a product shot: studio lights and room reflections are already set up, the camera orbits it.

The module must be exactly:

```js
export default function build(k) {
  const { THREE } = k;
  const root = new THREE.Group();
  // ... build meshes, add them to groups, add groups to root ...
  return { root, parts: { /* name: Object3D */ }, paths: { /* name: [[x,y,z], ...] */ } };
}
```

`k` provides (use these instead of creating materials by hand):
- `k.THREE`: three.js r186 (BoxGeometry, CylinderGeometry, SphereGeometry, CapsuleGeometry, TorusGeometry, LatheGeometry,
  ExtrudeGeometry + Shape, TubeGeometry + CatmullRomCurve3, PlaneGeometry, Group, Mesh, Vector2/3, Color, ...)
- `k.roundedBox(w, h, d, radius)`: a box geometry with rounded edges (use it for device bodies, chips, buttons)
- materials: `k.metal(color?, roughness?)`, `k.brushed(color?)`, `k.gold()`, `k.copper()`, `k.plastic(color?, roughness?)`,
  `k.glossy(color?)`, `k.rubber(color?)`, `k.glass(color?, opacity?)`, `k.pcb(color?)`, `k.chip()`, `k.skin(color?)`,
  `k.screen(color?, glowColor?)`, `k.emissive(color?, intensity?)`
- `k.finger({ length?, width?, bend?, color? })`: a ready-made realistic human index finger (Group) with nail, creases
  and fingerprint ridges. ALWAYS use it for fingers (never build one from capsules). Its tip is at its origin, it runs
  up +Y to the knuckle, the pad faces -Z and the nail +Z; rotate/position the group to place it (e.g. to press a
  screen facing +Z, rotate it so the pad faces the screen and the tip touches it). Units cm (default 8 long, 1.7 wide).
  Show fingers coming in at an angle (about 30-45 degrees from the surface), never pointing straight at the camera,
  so they read as fingers in profile. A finger is one of the parts: keep it whole (don't fade or explode it apart).
- `k.canvasTexture(w, h, (ctx, w, h) => { ...2D drawing... })`: a CanvasTexture for printed labels, screen UI, grilles,
  PCB traces, fingerprint ridges, etc. Use it as `map` on a material: e.g. `new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 })`.

Requirements:
- REALISM is the goal: correct real-world proportions and details (bevels, seams, buttons, camera bumps, screws, pins,
  labels, small parts), several materials per object, nothing floating. Units: 1 = 1 cm. Model centred near the origin.
- Every part listed below must be its own `THREE.Group` (or Mesh) returned in `parts` under exactly that name, positioned
  in place on the assembled object (the animation moves/explodes them from there). Inner parts that are hidden inside
  should still be modelled so they can be revealed (the outer shell can be faded away).
- Each path listed below goes in `paths` as 3+ points in the root's coordinates, along the route that the thing
  (light, sound, heat, current, air) travels.
- Deterministic: no Math.random, no time, no network, no imports, no DOM except inside canvasTexture.
- Keep it efficient (under ~300 meshes, geometry segments ≤ 48).
Reply with ONLY the JavaScript module.
