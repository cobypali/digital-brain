import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { CATEGORY_DEFINITIONS, HOME_REGIONS, getSessionUsername, login, logout, signup } from "./brain-store.js";

const authMessage = document.getElementById("auth-message");
const authForms = document.getElementById("auth-forms");
const sessionView = document.getElementById("session-view");
const sessionUsername = document.getElementById("session-username");
const infoPanel = document.getElementById("info-panel");
const authForm = document.getElementById("auth-form");
const authIdentifier = document.getElementById("auth-identifier");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const authHelper = document.getElementById("auth-helper");
const authModeLoginBtn = document.getElementById("auth-mode-login");
const authModeSignupBtn = document.getElementById("auth-mode-signup");
let activeUsername = null;
let authMode = "login";
let authBusy = false;

document.getElementById("close-btn").addEventListener("click", () => {
    infoPanel.style.display = "none";
});

authModeLoginBtn.addEventListener("click", () => setAuthMode("login"));
authModeSignupBtn.addEventListener("click", () => setAuthMode("signup"));

authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (authBusy) {
        return;
    }

    try {
        setAuthBusy(true);
        if (authMode === "signup") {
            await signup(
                authIdentifier.value,
                authEmail.value,
                authPassword.value
            );
            authMessage.textContent = "Brain created. Opening Movies.";
        } else {
            await login(
                authIdentifier.value,
                authPassword.value
            );
            authMessage.textContent = "Signed in. Opening Movies.";
        }
        await syncAuthUi();
        window.location.href = "movies.html";
    } catch (error) {
        authMessage.textContent = error.message;
    } finally {
        setAuthBusy(false);
    }
});

document.getElementById("logout-btn").addEventListener("click", () => {
    logout().then(syncAuthUi);
});

async function syncAuthUi() {
    activeUsername = await getSessionUsername();
    const loggedIn = Boolean(activeUsername);
    authForms.style.display = loggedIn ? "none" : "grid";
    sessionView.style.display = loggedIn ? "block" : "none";
    sessionUsername.textContent = loggedIn ? `${activeUsername}'s brain is active` : "";
}

function showInfo(slug) {
    const definition = CATEGORY_DEFINITIONS[slug];
    document.getElementById("panel-title").textContent = definition.name;
    document.getElementById("panel-title").style.color = `#${definition.color.toString(16).padStart(6, "0")}`;
    document.getElementById("panel-brain-region").textContent = `Located in the ${definition.brainRegion}`;
    document.getElementById("panel-description").textContent = definition.description;
    document.getElementById("panel-link").href = `${slug}.html`;
    infoPanel.style.display = "block";
}

function openRegion(slug) {
    window.location.href = `${slug}.html`;
}

function setAuthMode(mode) {
    authMode = mode;
    const isSignup = mode === "signup";
    authModeLoginBtn.classList.toggle("active", !isSignup);
    authModeSignupBtn.classList.toggle("active", isSignup);
    authEmail.classList.toggle("hidden", !isSignup);
    authEmail.required = isSignup;
    authIdentifier.placeholder = isSignup ? "Create username" : "Username or email";
    authSubmitBtn.textContent = isSignup ? "Create Brain" : "Log In";
    authHelper.textContent = isSignup
        ? "Sign up with a username, email, and password."
        : "Log in with your username or email and password.";
    authMessage.textContent = "";
}

function setAuthBusy(isBusy) {
    authBusy = isBusy;
    [authIdentifier, authEmail, authPassword, authModeLoginBtn, authModeSignupBtn, authSubmitBtn].forEach((element) => {
        element.disabled = isBusy;
    });
    authSubmitBtn.innerHTML = isBusy
        ? `<span class="loading-spinner-inline"></span>${authMode === "signup" ? "Creating..." : "Logging in..."}`
        : (authMode === "signup" ? "Create Brain" : "Log In");
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById("canvas-container").appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = "absolute";
labelRenderer.domElement.style.top = "0";
labelRenderer.domElement.style.pointerEvents = "none";
document.getElementById("canvas-container").appendChild(labelRenderer.domElement);

function updateCameraForScreenSize() {
    camera.position.set(0, window.innerWidth <= 768 ? 20 : 0, window.innerWidth <= 768 ? 350 : 250);
}

updateCameraForScreenSize();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 100;
controls.maxDistance = 500;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
keyLight.position.set(5, 5, 5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x88ccff, 0.6);
fillLight.position.set(-5, 0, 5);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xff8866, 0.4);
rimLight.position.set(0, -5, -5);
scene.add(rimLight);
const topLight = new THREE.DirectionalLight(0xffffff, 0.5);
topLight.position.set(0, 10, 0);
scene.add(topLight);

const brainGroup = new THREE.Group();
scene.add(brainGroup);
const hotspotMeshes = [];

function createHotspotMarker(region, index) {
    const definition = CATEGORY_DEFINITIONS[region.slug];
    const position = new THREE.Vector3(...region.position);

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3, 0.5, 16, 32),
        new THREE.MeshBasicMaterial({ color: definition.color, transparent: true, opacity: 0.9 })
    );
    ring.position.copy(position);
    ring.lookAt(new THREE.Vector3(0, 0, 0));
    brainGroup.add(ring);

    const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(2, 16, 16),
        new THREE.MeshBasicMaterial({ color: definition.color, transparent: true, opacity: 0.9 })
    );
    sphere.position.copy(position);
    sphere.userData = { slug: region.slug };
    brainGroup.add(sphere);

    const glow = new THREE.Mesh(
        new THREE.SphereGeometry(5, 16, 16),
        new THREE.MeshBasicMaterial({ color: definition.color, transparent: true, opacity: 0.15 })
    );
    glow.position.copy(position);
    brainGroup.add(glow);

    const labelDiv = document.createElement("div");
    labelDiv.className = "hotspot-label";
    labelDiv.textContent = definition.name;
    labelDiv.style.color = `#${definition.color.toString(16).padStart(6, "0")}`;
    const label = new CSS2DObject(labelDiv);
    label.position.copy(position);
    label.position.y += 10;
    brainGroup.add(label);

    hotspotMeshes[index] = { ring, sphere, glow, label };
}

setAuthMode("login");

new GLTFLoader().load("3d_brain_model/scene.gltf", (gltf) => {
    const brain = gltf.scene;
    brain.scale.set(100, 100, 100);
    brain.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(brain);
    const center = box.getCenter(new THREE.Vector3());
    brain.position.sub(center);
    brain.updateMatrixWorld(true);
    brainGroup.add(brain);

    brain.traverse((child) => {
        if (child.isMesh) {
            child.material = new THREE.MeshStandardMaterial({
                color: 0xffaaaa,
                roughness: 0.6,
                metalness: 0.1,
                emissive: 0xff6688,
                emissiveIntensity: 0.1
            });
        }
    });
    HOME_REGIONS.forEach(createHotspotMarker);
    document.getElementById("loading").style.display = "none";
}, undefined, () => {
    document.getElementById("loading").innerHTML = "<div>Failed to load brain model.</div>";
});

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener("click", (event) => {
    if (event.target.closest("nav, #account-panel, #info-panel")) {
        return;
    }
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(hotspotMeshes.filter(Boolean).map((entry) => entry.sphere));
    if (intersects.length > 0) {
        openRegion(intersects[0].object.userData.slug);
    }
});

window.addEventListener("mousemove", (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(hotspotMeshes.filter(Boolean).map((entry) => entry.sphere));
    document.body.style.cursor = intersects.length ? "pointer" : "grab";
});

let time = 0;
function animate() {
    requestAnimationFrame(animate);
    time += 0.01;

    hotspotMeshes.forEach((hotspot, index) => {
        if (!hotspot) {
            return;
        }
        hotspot.ring.rotation.x = time + index;
        hotspot.ring.rotation.y = time * 0.7 + index;
        hotspot.glow.scale.setScalar(1 + Math.sin(time * 2 + index * 0.5) * 0.1);
        hotspot.sphere.material.opacity = 0.7 + Math.sin(time * 3 + index) * 0.2;
    });

    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    updateCameraForScreenSize();
});

syncAuthUi();
animate();
