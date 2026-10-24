import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/**
 * QALQAN account-transfer visualisation.
 * Spatial layout and animation are illustrative. An edge is one supplied transfer,
 * and a review flag or node height is never a conclusion about an account.
 */
export function createNetworkScene(
  container,
  { nodes = [], links = [], onSelect = () => {} } = {},
) {
  const finite = (value, fallback = 0) =>
    Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, low, high, fallback = low) =>
    Math.max(low, Math.min(high, finite(value, fallback)));
  const accounts = [
    ...new Map(
      nodes
        .filter((node) => node && node.id != null)
        .map((node) => [String(node.id), { ...node, id: String(node.id) }]),
    ).values(),
  ];
  const nodeMap = new Map();
  const edges = [];
  const interactive = [];
  const disposables = new Set();
  const cleanups = [];
  let selectedId = accounts[0]?.id ?? null;
  let timeProgress = 1;
  let spread = 0.5;
  let speed = 1;
  let running = true;
  let disposed = false;
  let contextLost = false;
  let frame = 0;
  let motionTime = 0;
  let cameraMotion = null;
  const width = () => Math.max(1, container.clientWidth);
  const height = () => Math.max(1, container.clientHeight);
  const color = {
    account: 0xefe9dc,
    review: 0xd7c995,
    selected: 0x8ee1b9,
    transfer: 0x74ba9a,
    dim: 0x254e3e,
    floor: 0x0a2119,
  };
  container.style.position = "relative";

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    const fallback = document.createElement("div");
    fallback.style.cssText =
      "height:100%;min-height:280px;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:28px;gap:15px;color:#d6dfce;font:13px system-ui;text-align:center";
    const title = document.createElement("strong");
    title.textContent = "3D transfer view needs a WebGL-enabled browser";
    const explanation = document.createElement("p");
    explanation.textContent =
      "Account selection and the surrounding review tools remain available.";
    const list = document.createElement("div");
    list.style.cssText =
      "display:flex;flex-wrap:wrap;gap:7px;justify-content:center;max-height:180px;overflow:auto";
    accounts.forEach((account) => {
      const button = document.createElement("button");
      button.textContent = account.id;
      button.style.cssText =
        "border:1px solid #3d6450;border-radius:5px;background:#142f24;color:#ede9d9;padding:7px 10px;cursor:pointer";
      button.onclick = () => onSelect(account.id, account);
      list.appendChild(button);
    });
    fallback.append(title, explanation, list);
    container.appendChild(fallback);
    return {
      setTime() {},
      setSpread() {},
      setSpeed() {},
      setRunning() {},
      selectNode() {},
      setView() {},
      resize() {},
      getSnapshot: () => null,
      exportScene: async () => {
        throw new Error("3D export requires WebGL support.");
      },
      dispose: () => fallback.remove(),
    };
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(width(), height());
  renderer.setClearColor(0x081b14, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.style.cssText =
    "display:block;width:100%;height:100%;touch-action:none";
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute(
    "aria-label",
    "Interactive 3D account-transfer graph. Drag to orbit, scroll to zoom. Left and right arrows select accounts; Enter focuses the selection. Heights illustrate review counts.",
  );
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a2119, 0.006);
  const camera = new THREE.PerspectiveCamera(42, width() / height(), 0.1, 280);
  camera.position.set(45, 38, 53);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 4, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 12;
  controls.maxDistance = 130;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.75;
  controls.addEventListener("start", () => {
    cameraMotion = null;
  });
  scene.add(new THREE.HemisphereLight(0xe9ead4, 0x153d2b, 2.1));
  const light = new THREE.DirectionalLight(0xfff4df, 2.5);
  light.position.set(-20, 40, 30);
  scene.add(light);
  const emeraldLight = new THREE.PointLight(0x64be8d, 90, 95, 1.5);
  emeraldLight.position.set(20, 15, -10);
  scene.add(emeraldLight);

  const graph = new THREE.Group();
  graph.name = "QALQAN supplied account-transfer graph";
  graph.userData = {
    layout:
      "Illustrative spatial arrangement. Node height is review count, not guilt or proven risk. Particle speed is decorative.",
  };
  scene.add(graph);
  const nodeGroup = new THREE.Group();
  nodeGroup.name = "Accounts";
  graph.add(nodeGroup);
  const edgeGroup = new THREE.Group();
  edgeGroup.name = "Supplied transfers";
  graph.add(edgeGroup);
  const environment = new THREE.Group();
  environment.name = "Illustrative spatial guides";
  scene.add(environment);

  function keep(resource) {
    disposables.add(resource);
    return resource;
  }
  function basic(hex, opacity = 1) {
    return keep(
      new THREE.MeshBasicMaterial({
        color: hex,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      }),
    );
  }
  function makeRing(radius, thickness, material, parent = environment) {
    const object = new THREE.Mesh(
      keep(
        new THREE.RingGeometry(
          radius - thickness / 2,
          radius + thickness / 2,
          96,
        ),
      ),
      material,
    );
    object.rotation.x = -Math.PI / 2;
    parent.add(object);
    return object;
  }
  const floorMaterial = keep(
    new THREE.MeshStandardMaterial({
      color: color.floor,
      roughness: 0.94,
      metalness: 0.3,
      transparent: true,
      opacity: 0.75,
    }),
  );
  const floor = new THREE.Mesh(
    keep(new THREE.CircleGeometry(38, 96)),
    floorMaterial,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.18;
  environment.add(floor);
  [7, 14, 21, 28, 35].forEach((radius, i) => {
    const ring = makeRing(
      radius,
      i === 4 ? 0.045 : 0.025,
      basic(0x65957a, i === 4 ? 0.26 : 0.13),
    );
    ring.position.y = -0.1;
  });
  const radialPositions = [];
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    radialPositions.push(
      Math.sin(angle) * 3,
      -0.08,
      Math.cos(angle) * 3,
      Math.sin(angle) * 35,
      -0.08,
      Math.cos(angle) * 35,
    );
  }
  const radialGeometry = keep(new THREE.BufferGeometry());
  radialGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(radialPositions, 3),
  );
  environment.add(
    new THREE.LineSegments(
      radialGeometry,
      keep(
        new THREE.LineBasicMaterial({
          color: 0x416b52,
          transparent: true,
          opacity: 0.14,
        }),
      ),
    ),
  );
  const starPositions = [];
  for (let i = 0; i < 150; i++) {
    const x = Math.sin(i * 42.71) * 53;
    const z = Math.cos(i * 17.13) * 43;
    starPositions.push(x, Math.abs(Math.sin(i * 0.71)) * 18 - 2, z);
  }
  const starGeometry = keep(new THREE.BufferGeometry());
  starGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(starPositions, 3),
  );
  environment.add(
    new THREE.Points(
      starGeometry,
      keep(
        new THREE.PointsMaterial({
          color: 0x9bb393,
          size: 0.06,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        }),
      ),
    ),
  );

  // A small local radial texture provides a glow without downloaded assets.
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 64;
  const context = glowCanvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,250,236,.8)");
    gradient.addColorStop(0.18, "rgba(255,250,236,.35)");
    gradient.addColorStop(0.55, "rgba(255,250,236,.06)");
    gradient.addColorStop(1, "rgba(255,250,236,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  const glowTexture = keep(new THREE.CanvasTexture(glowCanvas));
  const sphereGeometry = keep(new THREE.IcosahedronGeometry(1, 2));
  const pointGeometry = keep(new THREE.SphereGeometry(0.115, 8, 6));
  const arrowGeometry = keep(new THREE.ConeGeometry(0.13, 0.4, 7));
  const maxReviews = Math.max(
    1,
    ...accounts.map((account) => Math.max(0, finite(account.reviewCount))),
  );
  const maxVolume = Math.max(
    1,
    ...accounts.map((account) => Math.max(0, finite(account.volumeKzt))),
  );

  const labels = document.createElement("div");
  labels.style.cssText =
    "position:absolute;inset:0;overflow:hidden;pointer-events:none";
  labels.setAttribute("aria-hidden", "true");
  container.appendChild(labels);
  const live = document.createElement("span");
  live.setAttribute("aria-live", "polite");
  live.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap";
  container.appendChild(live);
  const contextNotice = document.createElement("div");
  contextNotice.style.cssText =
    "position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:25px;background:rgba(8,27,20,.94);color:#ede9d9;text-align:center;font:13px system-ui";
  contextNotice.setAttribute("role", "status");
  contextNotice.textContent =
    "3D view paused while the graphics connection recovers. Account review data remains available.";
  container.appendChild(contextNotice);

  accounts.forEach((account, index) => {
    const reviewCount = Math.max(0, finite(account.reviewCount));
    const sphereRadius =
      0.43 +
      Math.sqrt(Math.max(0, finite(account.volumeKzt)) / maxVolume) * 0.35;
    const tint = reviewCount > 0 ? color.review : color.account;
    const group = new THREE.Group();
    group.name = account.id;
    group.userData = {
      accountId: account.id,
      reviewCount,
      heightMeaning: "Illustrative review-count elevation only",
    };
    nodeGroup.add(group);
    const material = keep(
      new THREE.MeshStandardMaterial({
        color: tint,
        emissive: tint,
        emissiveIntensity: 0.75,
        metalness: 0.35,
        roughness: 0.22,
      }),
    );
    const orb = new THREE.Mesh(sphereGeometry, material);
    orb.scale.setScalar(sphereRadius);
    orb.userData.nodeId = account.id;
    group.add(orb);
    interactive.push(orb);
    const glow = new THREE.Sprite(
      keep(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: tint,
          transparent: true,
          opacity: 0.6,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    glow.scale.setScalar(sphereRadius * 7);
    group.add(glow);
    const halo = makeRing(
      sphereRadius * 1.6,
      0.045,
      basic(color.selected, 0.9),
      group,
    );
    halo.rotation.x = Math.PI / 3;
    halo.visible = account.id === selectedId;
    const secondHalo = makeRing(
      sphereRadius * 2,
      0.018,
      basic(color.selected, 0.4),
      group,
    );
    secondHalo.rotation.x = -Math.PI / 4;
    secondHalo.visible = account.id === selectedId;
    const stemGeometry = keep(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
    );
    const stem = new THREE.Line(
      stemGeometry,
      keep(
        new THREE.LineBasicMaterial({
          color: tint,
          transparent: true,
          opacity: 0.13,
        }),
      ),
    );
    graph.add(stem);
    const foot = makeRing(0.23, 0.035, basic(tint, 0.25), environment);
    const label = document.createElement("div");
    label.textContent = account.id;
    label.style.cssText =
      "position:absolute;left:0;top:0;white-space:nowrap;transform:translate(-50%,-50%);color:#d3ddca;font:10px ui-monospace,SFMono-Regular,monospace;letter-spacing:.04em;background:rgba(10,33,25,.88);border:1px solid rgba(161,191,155,.2);border-radius:4px;padding:3px 6px";
    labels.appendChild(label);
    const angle = index * Math.PI * (3 - Math.sqrt(5)) + 0.4;
    const radius =
      accounts.length === 1
        ? 0
        : 6 + Math.sqrt(index / Math.max(1, accounts.length - 1)) * 22;
    nodeMap.set(account.id, {
      account,
      index,
      group,
      orb,
      glow,
      halo,
      secondHalo,
      stem,
      foot,
      label,
      tint,
      radius,
      angle,
      elevation: 2 + Math.sqrt(reviewCount / maxReviews) * 9,
      position: new THREE.Vector3(),
    });
  });

  links.forEach((link, index) => {
    if (
      !link ||
      !nodeMap.has(String(link.source)) ||
      !nodeMap.has(String(link.target))
    )
      return;
    // A missing/invalid timestamp is not placed into an invented part of the day.
    if (
      link.minute == null ||
      link.minute === "" ||
      !Number.isFinite(Number(link.minute)) ||
      Number(link.minute) < 0 ||
      Number(link.minute) > 1440
    )
      return;
    const tint = link.flagged ? color.review : color.transfer;
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(49 * 3), 3),
    );
    const material = keep(
      new THREE.LineBasicMaterial({
        color: tint,
        transparent: true,
        opacity: link.flagged ? 0.52 : 0.2,
        depthWrite: false,
      }),
    );
    const line = new THREE.Line(geometry, material);
    line.name = `Transfer ${String(link.id ?? index + 1)}`;
    line.userData = {
      transferId: String(link.id ?? index + 1),
      source: String(link.source),
      target: String(link.target),
      minute: Number(link.minute),
      flaggedForReview: Boolean(link.flagged),
    };
    edgeGroup.add(line);
    const marker = new THREE.Mesh(
      pointGeometry,
      basic(link.flagged ? 0xeee1b4 : 0xb5e5c9),
    );
    marker.name = "Illustrative source-to-target motion";
    edgeGroup.add(marker);
    const arrow = new THREE.Mesh(arrowGeometry, basic(tint, 0.65));
    edgeGroup.add(arrow);
    edges.push({
      link,
      index,
      source: String(link.source),
      target: String(link.target),
      minute: Number(link.minute),
      line,
      marker,
      arrow,
      curve: null,
      visible: true,
      positiveAmount:
        Number.isFinite(Number(link.amountKzt)) && Number(link.amountKzt) > 0,
    });
  });

  function updateGeometry() {
    const horizontalScale = 0.6 + spread * 0.8;
    for (const item of nodeMap.values()) {
      item.position.set(
        Math.sin(item.angle) * item.radius * horizontalScale,
        item.elevation * (0.75 + spread * 0.5),
        Math.cos(item.angle) * item.radius * horizontalScale,
      );
      item.group.position.copy(item.position);
      const stem = item.stem.geometry.attributes.position;
      stem.setXYZ(0, item.position.x, 0, item.position.z);
      stem.setXYZ(1, item.position.x, item.position.y - 0.4, item.position.z);
      stem.needsUpdate = true;
      item.stem.geometry.computeBoundingSphere();
      item.foot.position.set(item.position.x, 0.02, item.position.z);
    }
    for (const edge of edges) {
      const from = nodeMap.get(edge.source).position.clone();
      const to = nodeMap.get(edge.target).position.clone();
      if (edge.source === edge.target) {
        edge.curve = new THREE.CubicBezierCurve3(
          from,
          from.clone().add(new THREE.Vector3(5, 5, 2)),
          from.clone().add(new THREE.Vector3(-3, 5, 5)),
          to,
        );
      } else {
        const delta = to.clone().sub(from);
        const middle = from.clone().add(to).multiplyScalar(0.5);
        middle.y =
          Math.max(from.y, to.y) + Math.min(8, delta.length() * 0.14 + 1.8);
        middle.x -= delta.z * 0.09;
        middle.z += delta.x * 0.09;
        edge.curve = new THREE.QuadraticBezierCurve3(from, middle, to);
      }
      const position = edge.line.geometry.attributes.position;
      for (let i = 0; i < 49; i++) {
        const point = edge.curve.getPoint(i / 48);
        position.setXYZ(i, point.x, point.y, point.z);
      }
      position.needsUpdate = true;
      edge.line.geometry.computeBoundingSphere();
      edge.arrow.position.copy(edge.curve.getPoint(0.7));
      edge.arrow.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        edge.curve.getTangent(0.7).normalize(),
      );
      edge.marker.position.copy(
        edge.curve.getPoint((motionTime * 0.13 + edge.index * 0.173) % 1),
      );
    }
  }
  function updateVisibility() {
    const cutoff = 1440 * timeProgress;
    for (const edge of edges) {
      edge.visible = edge.minute <= cutoff;
      edge.line.visible = edge.visible;
      edge.arrow.visible = edge.visible;
      edge.marker.visible = edge.visible && edge.positiveAmount;
      const related =
        !selectedId || edge.source === selectedId || edge.target === selectedId;
      edge.line.material.opacity = related
        ? edge.link.flagged
          ? 0.68
          : 0.43
        : edge.link.flagged
          ? 0.22
          : 0.1;
      edge.arrow.material.opacity = related ? 0.9 : 0.3;
      edge.marker.material.opacity = related ? 1 : 0.45;
      edge.marker.material.transparent = true;
    }
  }
  function setTime(value) {
    timeProgress = clamp(value, 0, 1, 1);
    updateVisibility();
  }
  function setSpread(value) {
    spread = clamp(value, 0, 1, 0.5);
    updateGeometry();
  }
  function setSpeed(value) {
    speed = clamp(value, 0, 3, 1);
  }
  function setRunning(value) {
    running = Boolean(value);
  }
  function selectNode(id) {
    const key = id != null && nodeMap.has(String(id)) ? String(id) : null;
    selectedId = key;
    for (const [nodeId, item] of nodeMap) {
      const selected = nodeId === key;
      item.halo.visible = selected;
      item.secondHalo.visible = selected;
      item.orb.material.emissiveIntensity = selected ? 1.25 : 0.75;
      item.glow.material.opacity = selected ? 0.9 : 0.48;
      item.label.style.color = selected ? "#d6f6df" : "#d3ddca";
      item.label.style.borderColor = selected
        ? "rgba(142,225,185,.6)"
        : "rgba(161,191,155,.2)";
    }
    updateVisibility();
    live.textContent = key
      ? `${key} selected. Connected transfers are highlighted. A review flag does not establish wrongdoing.`
      : "No account is selected in the visible graph. All visible transfers are shown without a selection highlight.";
  }
  function moveCamera(to, target) {
    cameraMotion = {
      from: camera.position.clone(),
      to,
      targetFrom: controls.target.clone(),
      targetTo: target,
      progress: 0,
    };
  }
  function setView(view) {
    if (view === "top")
      moveCamera(new THREE.Vector3(0.01, 82, 0.01), new THREE.Vector3(0, 3, 0));
    else moveCamera(new THREE.Vector3(45, 38, 53), new THREE.Vector3(0, 4, 0));
  }
  function resize() {
    if (disposed) return;
    camera.aspect = width() / height();
    camera.updateProjectionMatrix();
    renderer.setSize(width(), height());
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downPosition = null;
  function hit(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(interactive, false)[0]?.object.userData
      .nodeId;
  }
  const pointerDown = (event) => {
    downPosition = { x: event.clientX, y: event.clientY };
  };
  const pointerUp = (event) => {
    const start = downPosition;
    downPosition = null;
    if (
      !start ||
      Math.hypot(start.x - event.clientX, start.y - event.clientY) > 6
    )
      return;
    const id = hit(event);
    if (id != null) {
      selectNode(id);
      onSelect(id, nodeMap.get(id).account);
    }
  };
  const pointerMove = (event) => {
    if (!downPosition)
      renderer.domElement.style.cursor =
        hit(event) != null ? "pointer" : "grab";
  };
  const keyboard = (event) => {
    if (event.key === "Enter" && nodeMap.has(selectedId)) {
      const item = nodeMap.get(selectedId);
      moveCamera(
        item.position.clone().add(new THREE.Vector3(17, 12, 19)),
        item.position.clone(),
      );
      event.preventDefault();
      return;
    }
    if (
      !accounts.length ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    const index = accounts.findIndex((account) => account.id === selectedId);
    const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const nextIndex =
      index < 0
        ? step > 0
          ? 0
          : accounts.length - 1
        : (index + step + accounts.length) % accounts.length;
    const account = accounts[nextIndex];
    selectNode(account.id);
    onSelect(account.id, account);
  };
  const lost = (event) => {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frame);
    contextNotice.style.display = "flex";
  };
  const restored = () => {
    if (disposed) return;
    contextLost = false;
    contextNotice.style.display = "none";
    clock.getDelta();
    render();
  };
  for (const [name, handler] of [
    ["pointerdown", pointerDown],
    ["pointerup", pointerUp],
    ["pointermove", pointerMove],
    [
      "pointercancel",
      () => {
        downPosition = null;
      },
    ],
    ["keydown", keyboard],
    ["webglcontextlost", lost],
    ["webglcontextrestored", restored],
  ]) {
    renderer.domElement.addEventListener(name, handler);
    cleanups.push(() => renderer.domElement.removeEventListener(name, handler));
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const clock = new THREE.Clock();
  const projected = new THREE.Vector3();
  const labelPosition = new THREE.Vector3();
  function render() {
    if (disposed || contextLost) return;
    frame = requestAnimationFrame(render);
    const dt = Math.min(clock.getDelta(), 0.06);
    if (running && !reducedMotion.matches) motionTime += dt * speed;
    if (cameraMotion) {
      cameraMotion.progress = Math.min(1, cameraMotion.progress + dt * 1.6);
      const t = cameraMotion.progress;
      const smooth = t * t * (3 - 2 * t);
      camera.position.lerpVectors(cameraMotion.from, cameraMotion.to, smooth);
      controls.target.lerpVectors(
        cameraMotion.targetFrom,
        cameraMotion.targetTo,
        smooth,
      );
      if (t >= 1) cameraMotion = null;
    }
    for (const edge of edges) {
      if (edge.marker.visible)
        edge.marker.position.copy(
          edge.curve.getPoint((motionTime * 0.13 + edge.index * 0.173) % 1),
        );
    }
    controls.update();
    for (const [id, item] of nodeMap) {
      const selected = id === selectedId;
      // Keep dense scenes legible while always identifying the chosen account.
      const showLabel =
        selected ||
        accounts.length <= 22 ||
        item.index % Math.ceil(accounts.length / 18) === 0;
      labelPosition.copy(item.position).add(new THREE.Vector3(0, 1.45, 0));
      projected.copy(labelPosition).project(camera);
      const visible =
        showLabel &&
        projected.z < 1 &&
        Math.abs(projected.x) < 1.03 &&
        Math.abs(projected.y) < 1.03;
      item.label.style.display = visible ? "block" : "none";
      if (visible) {
        item.label.style.left = `${(projected.x * 0.5 + 0.5) * width()}px`;
        item.label.style.top = `${(-projected.y * 0.5 + 0.5) * height()}px`;
        item.label.style.zIndex = selected ? "3" : "1";
      }
    }
    renderer.render(scene, camera);
  }
  updateGeometry();
  if (selectedId) selectNode(selectedId);
  else updateVisibility();
  controls.update();
  render();

  function getSnapshot({ transparent = false } = {}) {
    if (disposed || contextLost) return null;
    const oldBackground = scene.background;
    if (!transparent) scene.background = new THREE.Color(0x0a2119);
    renderer.render(scene, camera);
    const data = renderer.domElement.toDataURL("image/png");
    scene.background = oldBackground;
    return data;
  }
  async function exportScene() {
    if (disposed) throw new Error("This graph has been disposed.");
    const { GLTFExporter } =
      await import("three/addons/exporters/GLTFExporter.js");
    const exportRoot = new THREE.Scene();
    exportRoot.name = "QALQAN illustrative account-transfer graph";
    exportRoot.userData = {
      throughMinute: timeProgress * 1440,
      disclaimer:
        "Supplied transfer records only. Flags are review signals, not findings of wrongdoing. Spatial arrangement, heights, and animation are illustrative.",
    };
    const copy = graph.clone(true);
    const remove = [];
    copy.traverse((object) => {
      if (object.isSprite) remove.push(object);
    });
    remove.forEach((object) => object.removeFromParent());
    exportRoot.add(copy);
    const exportLight = new THREE.DirectionalLight(0xfff1d8, 3);
    exportLight.position.set(-20, 40, 30);
    exportRoot.add(exportLight);
    const result = await new GLTFExporter().parseAsync(exportRoot, {
      binary: true,
      onlyVisible: true,
    });
    return new Blob([result], { type: "model/gltf-binary" });
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    cleanups.forEach((cleanup) => cleanup());
    controls.dispose();
    disposables.forEach((resource) => resource.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    labels.remove();
    live.remove();
    contextNotice.remove();
  }
  return {
    setTime,
    setSpread,
    setSpeed,
    setRunning,
    selectNode,
    setView,
    resize,
    dispose,
    getSnapshot,
    exportScene,
  };
}
