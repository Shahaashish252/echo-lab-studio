export default function build(k) {
  const { THREE } = k;
  const root = new THREE.Group();

  // ---------- shared dims (cm) ----------
  const boardL = 3.2, boardW = 1.4, boardT = 0.16;
  const halfL = boardL / 2, halfW = boardW / 2;
  const topY = boardT / 2;      // top surface y
  const botY = -boardT / 2;     // bottom surface y

  // ================= PCB BOARD =================
  const pcbGroup = new THREE.Group();
  pcbGroup.name = 'pcb-board';

  const substrateMat = k.pcb('#1d6b38');
  substrateMat.transparent = true;
  substrateMat.opacity = 1;
  const substrate = new THREE.Mesh(k.roundedBox(boardL, boardT, boardW, 0.035), substrateMat);
  pcbGroup.add(substrate);

  // copper traces + silkscreen, embedded just under top face so it's hidden
  // until the substrate material is faded to translucent
  const pcbTex = k.canvasTexture(640, 288, (ctx, w, h) => {
    const toX = x => ((x + halfL) / boardL) * w;
    const toY = z => ((z + halfW) / boardW) * h;

    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#caa06a';
    ctx.fillRect(w * 0.04, h * 0.08, w * 0.92, h * 0.84);
    ctx.restore();

    ctx.strokeStyle = '#d9a066';
    ctx.lineWidth = w * 0.012;
    ctx.lineCap = 'round';
    const trace = (x1, z1, x2, z2) => {
      ctx.beginPath();
      ctx.moveTo(toX(x1), toY(z1));
      ctx.lineTo(toX(x2), toY(z2));
      ctx.stroke();
    };
    trace(-1.3, -0.4, 0, 0);
    trace(-1.3, 0.4, 0, 0);
    trace(0, 0, 1.3, 0.35);
    trace(0, 0, 1.6, 0);
    trace(0, 0, 1.0, -0.3);
    trace(1.0, -0.3, 1.6, -0.4);
    trace(-1.3, -0.4, 1.6, -0.4);
    trace(-1.3, 0.4, 1.6, 0.4);

    ctx.fillStyle = '#e0ab6e';
    const pad = (x, z, r) => { ctx.beginPath(); ctx.arc(toX(x), toY(z), r, 0, Math.PI * 2); ctx.fill(); };
    pad(-1.3, -0.4, 9); pad(-1.3, 0.4, 9); pad(0, 0, 11);
    pad(1.0, -0.3, 8); pad(1.3, 0.35, 7);
    pad(1.6, -0.4, 8); pad(1.6, 0, 8); pad(1.6, 0.4, 8);

    ctx.fillStyle = '#eef0ee';
    ctx.textAlign = 'center';
    ctx.font = `${h * 0.065}px sans-serif`;
    ctx.fillText('VCC', toX(1.42), toY(-0.52));
    ctx.fillText('GND', toX(1.42), toY(0.03));
    ctx.fillText('OUT', toX(1.42), toY(0.58));
    ctx.font = `${h * 0.055}px sans-serif`;
    ctx.fillText('IR-OBSTACLE', toX(-0.2), toY(0.6));
  });
  const traceMat = new THREE.MeshStandardMaterial({ map: pcbTex, transparent: true, roughness: 0.4, metalness: 0.3 });
  const traceLayer = new THREE.Mesh(new THREE.PlaneGeometry(boardL * 0.95, boardW * 0.95), traceMat);
  traceLayer.rotation.x = -Math.PI / 2;
  traceLayer.position.y = topY - 0.006;
  pcbGroup.add(traceLayer);

  // header housing + pins (VCC / GND / OUT) — housing sits flush with the
  // board's back edge (pins protrude beyond it, which is correct/realistic)
  const headerMat = k.plastic('#0c0c0c', 0.6);
  const housingW = 0.22;
  const housing = new THREE.Mesh(new THREE.BoxGeometry(housingW, 0.26, 1.0), headerMat);
  housing.position.set(halfL - housingW / 2, 0, 0);
  pcbGroup.add(housing);

  const pinMat = k.metal('#cfcfcf', 0.3);
  [-0.4, 0, 0.4].forEach(z => {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 10), pinMat);
    pin.rotation.z = Math.PI / 2;
    pin.position.set(halfL + 0.25, 0, z);
    pcbGroup.add(pin);
  });

  root.add(pcbGroup);

  // ================= IR LED / PHOTODIODE builders =================
  // These two packages share identical geometry/material recipes so they
  // read as the same kind of part (dome lens + black TO-18-style base) from
  // every camera angle, and are positioned fully within the board outline
  // so their base flange always sits flush on the PCB with no overhang/gap.
  const bodyR = 0.22, bodyH = 0.12, legR = 0.025, legLen = 0.33;
  const flangeR = bodyR + 0.03, flangeH = 0.02;
  // lens dome radius is slightly LARGER than the body so it reads as a true
  // bulging hemispherical cap overhanging the cylindrical base (never a
  // flat disc), and is identical for emitter + receiver.
  const domeR = bodyR + 0.015;

  // Both lens domes use this exact same geometry (high segment count so the
  // curvature is smooth and unmistakable even in extreme close-up) so the
  // two packages always share an identical silhouette.
  const lensDomeGeo = new THREE.SphereGeometry(domeR, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);

  function makeLensMat() {
    // Matte black plastic (high roughness, no clearcoat/metalness) so the
    // dome never picks up a bright colored specular "dot" or a warm-tinted
    // highlight from the studio lights — stays a flat, neutral matte black
    // from every angle, identical for both lenses.
    return k.plastic('#070707', 0.55);
  }

  function makeDome(mat) {
    return new THREE.Mesh(lensDomeGeo, mat);
  }

  function makeLedInternal(x, z, dieMat) {
    const grp = new THREE.Group();
    const bodyMat = k.plastic('#161616', 0.5);

    // flange: a thin collar that sits exactly on the PCB top face so the
    // package always reads as flush-mounted, never floating above a gap
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(flangeR, flangeR, flangeH, 24), bodyMat);
    flange.position.set(x, topY + flangeH / 2, z);
    grp.add(flange);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(bodyR, bodyR, bodyH, 24), bodyMat);
    body.position.set(x, topY + flangeH + bodyH / 2, z);
    grp.add(body);

    const legMat = k.metal('#b8b8b8', 0.4);
    const solderMat = k.metal('#d8d8d8', 0.25);
    [-0.08, 0.08].forEach(dz => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(legR, legR, legLen, 8), legMat);
      leg.position.set(x, topY + flangeH + bodyH - legLen / 2, z + dz);
      grp.add(leg);
      const blob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), solderMat);
      blob.position.set(x, botY - 0.05, z + dz);
      grp.add(blob);
    });

    const die = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.06), dieMat);
    die.position.set(x, topY + flangeH + 0.04, z);
    grp.add(die);

    return grp;
  }

  // Both emitter and receiver are placed well inside the board's left
  // (front) edge at x = -1.3 so their footprint (radius ~0.24) never
  // overhangs past the board edge at x = -1.6 — eliminates the floating
  // / unsupported look and keeps the component identical from any angle.
  const ledX = -1.3;

  // emitter
  const emitterLensGroup = new THREE.Group();
  emitterLensGroup.name = 'emitter-lens';
  const emitterDome = makeDome(makeLensMat());
  emitterDome.position.set(ledX, topY + flangeH + bodyH, -0.4);
  emitterLensGroup.add(emitterDome);
  root.add(emitterLensGroup);

  const emitterLedGroup = makeLedInternal(ledX, -0.4, k.chip());
  emitterLedGroup.name = 'emitter-led';
  root.add(emitterLedGroup);

  // receiver
  const receiverLensGroup = new THREE.Group();
  receiverLensGroup.name = 'receiver-lens';
  const receiverDome = makeDome(makeLensMat());
  receiverDome.position.set(ledX, topY + flangeH + bodyH, 0.4);
  receiverLensGroup.add(receiverDome);
  root.add(receiverLensGroup);

  const receiverPhotodiodeGroup = makeLedInternal(ledX, 0.4, k.chip());
  receiverPhotodiodeGroup.name = 'receiver-photodiode';
  root.add(receiverPhotodiodeGroup);

  // ================= LM393 CHIP =================
  const chipW = 0.8, chipD = 0.4, chipH = 0.17;
  const chipY = topY + 0.02 + chipH / 2;
  const lm393Group = new THREE.Group();
  lm393Group.name = 'lm393-chip';

  const chipMat = k.plastic('#121212', 0.55);
  chipMat.transparent = true;
  chipMat.opacity = 1;
  const chipBody = new THREE.Mesh(k.roundedBox(chipW, chipH, chipD, 0.02), chipMat);
  chipBody.position.set(0, chipY, 0);
  lm393Group.add(chipBody);

  const chipPinMat = k.metal('#c9c9c9', 0.3);
  [-0.27, -0.09, 0.09, 0.27].forEach(x => {
    [-1, 1].forEach(s => {
      const pin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.05), chipPinMat);
      pin.position.set(x, chipY - chipH / 2 - 0.01, s * (chipD / 2 + 0.015));
      lm393Group.add(pin);
    });
  });

  const labelTex = k.canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ddd';
    ctx.font = `${h * 0.3}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('LM393', w / 2, h * 0.58);
    ctx.beginPath();
    ctx.arc(w * 0.12, h * 0.2, h * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = '#777';
    ctx.fill();
  });
  const labelMat = new THREE.MeshStandardMaterial({ map: labelTex, transparent: true, roughness: 0.6 });
  const labelPlane = new THREE.Mesh(new THREE.PlaneGeometry(chipW * 0.85, chipD * 0.7), labelMat);
  labelPlane.rotation.x = -Math.PI / 2;
  labelPlane.position.set(0, chipY + chipH / 2 + 0.002, 0);
  lm393Group.add(labelPlane);

  // internal die + simplified comparator schematic (revealed once the
  // package material is faded translucent)
  const dieMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.16), k.chip());
  dieMesh.position.set(0, topY + 0.03, 0);
  lm393Group.add(dieMesh);

  const schematicTex = k.canvasTexture(256, 128, (ctx, w, h) => {
    ctx.strokeStyle = '#cfd8dc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.15, h * 0.2); ctx.lineTo(w * 0.15, h * 0.8);
    ctx.lineTo(w * 0.45, h * 0.5); ctx.closePath(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.5); ctx.lineTo(w * 0.85, h * 0.5); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(w * (0.55 + i * 0.05), h * 0.42);
      ctx.lineTo(w * (0.58 + i * 0.05), h * 0.58);
      ctx.stroke();
    }
  });
  const schematicMat = new THREE.MeshStandardMaterial({ map: schematicTex, transparent: true, roughness: 0.6 });
  const schematicPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.16), schematicMat);
  schematicPlane.rotation.x = -Math.PI / 2;
  schematicPlane.position.set(0, topY + 0.045, 0);
  lm393Group.add(schematicPlane);

  const bondMat = k.metal('#e5e5e5', 0.2);
  [-0.12, 0.12].forEach(x => {
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 6), bondMat);
    wire.rotation.z = Math.PI / 2;
    wire.position.set(x * 1.6, topY + 0.035, 0);
    lm393Group.add(wire);
  });

  root.add(lm393Group);

  // ================= TRIMMER POTENTIOMETER =================
  const potW = 0.3, potD = 0.3, potH = 0.22;
  const potX = 1.0, potZ = -0.3;
  const potY = topY + 0.01 + potH / 2;
  const potGroup = new THREE.Group();
  potGroup.name = 'potentiometer';

  const potBody = new THREE.Mesh(k.roundedBox(potW, potH, potD, 0.02), k.plastic('#1255b5', 0.4));
  potBody.position.set(potX, potY, potZ);
  potGroup.add(potBody);

  const wiper = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 20), k.gold());
  wiper.position.set(potX, potY + potH / 2 + 0.02, potZ);
  potGroup.add(wiper);

  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.02), k.plastic('#111111', 0.5));
  slot.position.set(potX, potY + potH / 2 + 0.045, potZ);
  slot.rotation.y = 0.5;
  potGroup.add(slot);

  const potPinMat = k.metal('#c0c0c0', 0.3);
  [-0.08, 0, 0.08].forEach(dx => {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), potPinMat);
    pin.position.set(potX + dx, (topY + (botY - 0.03)) / 2, potZ - potD / 2 + 0.02);
    potGroup.add(pin);
  });

  root.add(potGroup);

  // ================= INDICATOR LED =================
  const indX = 1.3, indZ = 0.35;
  const indDomeR = 0.09, indBodyH = 0.06;
  const indGroup = new THREE.Group();
  indGroup.name = 'indicator-led';

  const indBody = new THREE.Mesh(new THREE.CylinderGeometry(indDomeR, indDomeR, indBodyH, 16), k.plastic('#4a0000', 0.4));
  indBody.position.set(indX, topY + indBodyH / 2, indZ);
  indGroup.add(indBody);

  const indDome = new THREE.Mesh(
    new THREE.SphereGeometry(indDomeR, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    k.glass('#ff2222', 0.5)
  );
  indDome.position.set(indX, topY + indBodyH, indZ);
  indGroup.add(indDome);

  const indCore = new THREE.Mesh(new THREE.SphereGeometry(indDomeR * 0.4, 10, 8), k.emissive('#ff0000', 2));
  indCore.position.set(indX, topY + indBodyH + indDomeR * 0.3, indZ);
  indGroup.add(indCore);

  const indLegMat = k.metal('#bdbdbd', 0.3);
  [-0.03, 0.03].forEach(dz => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 6), indLegMat);
    leg.position.set(indX, topY - 0.07, indZ + dz);
    indGroup.add(leg);
  });

  root.add(indGroup);

  // ================= PATHS =================
  const emitterApex = [ledX, topY + flangeH + bodyH + domeR, -0.4];
  const receiverApex = [ledX, topY + flangeH + bodyH + domeR, 0.4];
  const obstaclePoint = [-3.2, 0.5, 0];

  const irBeamPath = [
    emitterApex,
    [-2.3, 0.46, -0.2],
    obstaclePoint,
    [-2.3, 0.46, 0.2],
    receiverApex
  ];

  const signalPath = [
    [ledX, topY, 0.4],
    [-0.5, topY + 0.002, 0.2],
    [0, chipY + chipH / 2, 0],
    [0.8, topY + 0.002, 0.2],
    [indX, topY + indBodyH, indZ],
    [halfL + 0.4, botY + 0.03, 0]
  ];

  return {
    root,
    parts: {
      'pcb-board': pcbGroup,
      'emitter-lens': emitterLensGroup,
      'receiver-lens': receiverLensGroup,
      'emitter-led': emitterLedGroup,
      'receiver-photodiode': receiverPhotodiodeGroup,
      'lm393-chip': lm393Group,
      'potentiometer': potGroup,
      'indicator-led': indGroup
    },
    paths: {
      'ir-beam-path': irBeamPath,
      'signal-path': signalPath
    }
  };
}
