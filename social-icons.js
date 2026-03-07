import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Social Icons Module
 *
 * Uses a single offscreen WebGLRenderer shared across all 7 icons.
 * Each icon container gets a 2D <canvas> that receives copied pixels
 * from the shared renderer. An IntersectionObserver gates loading
 * and animation so work only happens while the footer is visible.
 */

export function initSocialIcons() {
  const iconContainers = document.querySelectorAll('.social-icon-container');
  if (iconContainers.length === 0) return;

  // Find the footer element that wraps all icons
  const footer = iconContainers[0].closest('footer') ||
                 document.getElementById('social-links-3d');
  if (!footer) return;

  // ---------------------------------------------------------------------------
  // Shared offscreen WebGL renderer (single context for all icons)
  // ---------------------------------------------------------------------------
  const RENDER_SIZE = 80;
  const pixelRatio = Math.min(window.devicePixelRatio, 2);

  let sharedRenderer = null;

  function getSharedRenderer() {
    if (!sharedRenderer) {
      sharedRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      sharedRenderer.setSize(RENDER_SIZE, RENDER_SIZE);
      sharedRenderer.setPixelRatio(pixelRatio);
      // Keep the canvas offscreen -- never attach to DOM
    }
    return sharedRenderer;
  }

  // ---------------------------------------------------------------------------
  // Per-icon state
  // ---------------------------------------------------------------------------
  const icons = [];

  iconContainers.forEach((container, index) => {
    const modelPath = container.dataset.model;
    const link      = container.dataset.link;

    // Create a visible 2D canvas for this icon
    const canvas2d = document.createElement('canvas');
    canvas2d.width  = RENDER_SIZE * pixelRatio;
    canvas2d.height = RENDER_SIZE * pixelRatio;
    canvas2d.style.width  = '100%';
    canvas2d.style.height = '100%';
    container.appendChild(canvas2d);
    const ctx = canvas2d.getContext('2d');

    // Three.js scene & camera
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 0, 3);

    // Lighting (matches original)
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(2, 2, 2);
    scene.add(keyLight);

    const iconData = {
      container,
      canvas2d,
      ctx,
      scene,
      camera,
      link,
      modelPath,
      index,
      pivot: null,
      modelLoaded: false,
      manualRotation: 0,
      isDragging: false,
      hasDragged: false,
      lastX: 0,
    };

    icons.push(iconData);
  });

  // ---------------------------------------------------------------------------
  // Model loading
  // ---------------------------------------------------------------------------
  let modelsRequested = false;

  function loadModels() {
    if (modelsRequested) return;
    modelsRequested = true;

    const gltfLoader = new GLTFLoader();

    icons.forEach((icon) => {
      gltfLoader.load(icon.modelPath, (gltf) => {
        const model = gltf.scene;

        // Scale to fit
        const box    = new THREE.Box3().setFromObject(model);
        const size   = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale  = 1.8 / maxDim;
        model.scale.setScalar(scale);

        // Re-center after scaling
        const scaledBox = new THREE.Box3().setFromObject(model);
        const center    = scaledBox.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -center.y, -center.z);

        // Pivot group for rotation around center
        const pivot = new THREE.Group();
        pivot.add(model);
        icon.scene.add(pivot);

        icon.pivot       = pivot;
        icon.modelLoaded = true;
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Drag-to-rotate & click-to-navigate (per icon)
  // ---------------------------------------------------------------------------
  icons.forEach((icon) => {
    const container = icon.container;

    const onDragStart = (clientX) => {
      icon.isDragging = true;
      icon.hasDragged = false;
      icon.lastX      = clientX;
    };

    const onDragMove = (clientX) => {
      if (!icon.isDragging || !icon.pivot) return;
      const deltaX = clientX - icon.lastX;
      if (Math.abs(deltaX) > 2) {
        icon.hasDragged = true;
      }
      icon.manualRotation += deltaX * 0.02;
      icon.lastX = clientX;
    };

    const onDragEnd = () => {
      icon.isDragging = false;
    };

    // Mouse events
    container.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onDragStart(e.clientX);
    });

    // We store references so we can remove them later
    const mouseMoveHandler = (e) => onDragMove(e.clientX);
    const mouseUpHandler   = ()  => onDragEnd();

    window.addEventListener('mousemove', mouseMoveHandler);
    window.addEventListener('mouseup',   mouseUpHandler);

    // Touch events
    container.addEventListener('touchstart', (e) => {
      onDragStart(e.touches[0].clientX);
    }, { passive: true });

    const touchMoveHandler = (e) => {
      if (icon.isDragging) {
        onDragMove(e.touches[0].clientX);
      }
    };
    const touchEndHandler = () => onDragEnd();

    window.addEventListener('touchmove', touchMoveHandler, { passive: true });
    window.addEventListener('touchend',  touchEndHandler);

    // Click -- only navigate if the user did not drag
    container.addEventListener('click', () => {
      if (!icon.hasDragged) {
        window.open(icon.link, '_blank');
      }
    });

    // Stash handlers for potential cleanup
    icon._windowListeners = [
      ['mousemove', mouseMoveHandler],
      ['mouseup',   mouseUpHandler],
      ['touchmove', touchMoveHandler],
      ['touchend',  touchEndHandler],
    ];
  });

  // ---------------------------------------------------------------------------
  // Animation loop
  // ---------------------------------------------------------------------------
  let animFrameId = null;
  let isAnimating = false;

  function animate() {
    if (!isAnimating) return;
    animFrameId = requestAnimationFrame(animate);

    const renderer = getSharedRenderer();
    const time     = Date.now() * 0.001;

    icons.forEach((icon) => {
      if (!icon.modelLoaded) return;

      // Rotation logic (matches original)
      if (icon.isDragging) {
        icon.pivot.rotation.y = icon.manualRotation;
      } else {
        const autoRotation    = time + icon.index * 0.5;
        icon.manualRotation   = autoRotation;
        icon.pivot.rotation.y = autoRotation;
      }

      // Render this icon's scene into the shared offscreen renderer
      renderer.render(icon.scene, icon.camera);

      // Copy pixels to the icon's visible 2D canvas
      icon.ctx.clearRect(0, 0, icon.canvas2d.width, icon.canvas2d.height);
      icon.ctx.drawImage(renderer.domElement, 0, 0, icon.canvas2d.width, icon.canvas2d.height);
    });
  }

  function startAnimating() {
    if (isAnimating) return;
    isAnimating = true;
    loadModels();
    animate();
  }

  function stopAnimating() {
    isAnimating = false;
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Intersection Observer -- only run while footer is visible
  // ---------------------------------------------------------------------------
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          startAnimating();
        } else {
          stopAnimating();
        }
      });
    },
    { threshold: 0 }
  );

  observer.observe(footer);

  // ---------------------------------------------------------------------------
  // Public cleanup (optional -- call if you ever tear down the page)
  // ---------------------------------------------------------------------------
  return {
    dispose() {
      stopAnimating();
      observer.disconnect();

      // Remove window-level event listeners
      icons.forEach((icon) => {
        icon._windowListeners.forEach(([event, handler]) => {
          window.removeEventListener(event, handler);
        });
      });

      // Dispose Three.js resources
      icons.forEach((icon) => {
        icon.scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose());
            } else {
              obj.material.dispose();
            }
          }
        });
        // Remove canvas from DOM
        if (icon.canvas2d.parentNode) {
          icon.canvas2d.parentNode.removeChild(icon.canvas2d);
        }
      });

      if (sharedRenderer) {
        sharedRenderer.dispose();
        sharedRenderer = null;
      }
    },
  };
}
